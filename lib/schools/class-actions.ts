"use server";

// School classes (migration 080) — admin/ops management of the class
// list and memberships. Design: docs/superpowers/specs/
// 2026-08-26-school-classes-design.md. RLS enforces staff-only writes;
// the guard here exists because server actions are directly callable.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { yearGroupToAgeBand } from "@/lib/schools/year-groups";
import {
  parseClassListCsv,
  buildClassImportPlan,
  type ClassImportPlan,
} from "@/lib/schools/class-import";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";

export interface SchoolClassSummary {
  id: string;
  name: string;
  year_group: string;
  school_year: number;
  teacher_name: string | null;
  student_count: number;
}

export interface ClassRosterChild {
  child_id: string;
  first_name: string;
  last_name: string;
  age_group: string;
  /** Current class id, null when unassigned. */
  class_id: string | null;
}

async function requireStaff(): Promise<{ userId: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, error: "Not authenticated." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (
    !profile ||
    profile.status !== "active" ||
    (profile.role !== "admin" && profile.role !== "ops")
  ) {
    return { userId: null, error: "Not authorised." };
  }
  return { userId: user.id, error: null };
}

export async function getSchoolClasses(centreId: string): Promise<{
  data: { classes: SchoolClassSummary[]; roster: ClassRosterChild[] } | null;
  error: string | null;
}> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { data: null, error: authError };
    const supabase = await createSupabaseServerClient();

    const [{ data: classes, error: clsErr }, { data: enrolments, error: enrErr }] =
      await Promise.all([
        supabase
          .from("school_classes")
          .select("id, name, year_group, school_year, teacher_name")
          .eq("centre_id", centreId)
          .order("school_year", { ascending: false })
          .order("name"),
        supabase
          .from("centre_children")
          .select("child_id, children!inner(id, first_name, last_name, age_group)")
          .eq("centre_id", centreId)
          .eq("status", "active"),
      ]);
    if (clsErr) return { data: null, error: clsErr.message };
    if (enrErr) return { data: null, error: enrErr.message };

    const classIds = (classes ?? []).map((c) => c.id);
    let memberships: { class_id: string; child_id: string }[] = [];
    if (classIds.length > 0) {
      const { data: members } = await supabase
        .from("school_class_children")
        .select("class_id, child_id")
        .in("class_id", classIds)
        .is("ended_at", null);
      memberships = members ?? [];
    }

    const classByChild = new Map(memberships.map((m) => [m.child_id, m.class_id]));
    const countByClass = new Map<string, number>();
    for (const m of memberships) {
      countByClass.set(m.class_id, (countByClass.get(m.class_id) ?? 0) + 1);
    }

    const roster: ClassRosterChild[] = (enrolments ?? [])
      .map((e) => {
        const child = e.children as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          age_group: string;
        };
        return {
          child_id: child.id,
          first_name: child.first_name,
          last_name: child.last_name,
          age_group: child.age_group,
          class_id: classByChild.get(child.id) ?? null,
        };
      })
      .sort((a, b) => a.first_name.localeCompare(b.first_name));

    return {
      data: {
        classes: (classes ?? []).map((c) => ({
          ...c,
          student_count: countByClass.get(c.id) ?? 0,
        })),
        roster,
      },
      error: null,
    };
  } catch (err) {
    console.error("getSchoolClasses error:", err);
    return { data: null, error: "Failed to load classes." };
  }
}

export async function createSchoolClass(
  centreId: string,
  input: { name: string; year_group: string; school_year: number; teacher_name?: string }
): Promise<{ error: string | null }> {
  try {
    const { userId, error: authError } = await requireStaff();
    if (authError) return { error: authError };

    const name = input.name.trim();
    const yearGroup = input.year_group.trim();
    if (name.length < 1 || name.length > 40) return { error: "Class name is required (max 40 characters)." };
    if (yearGroup.length < 1 || yearGroup.length > 10) return { error: "Year group is required." };
    if (!Number.isInteger(input.school_year) || input.school_year < 2020 || input.school_year > 2100) {
      return { error: "School year must be a valid year." };
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("school_classes").insert({
      centre_id: centreId,
      name,
      year_group: yearGroup,
      school_year: input.school_year,
      teacher_name: input.teacher_name?.trim() || null,
    });
    if (error) {
      return {
        error: error.code === "23505"
          ? `A class called "${name}" already exists for ${input.school_year}.`
          : error.message,
      };
    }

    await supabase.from("activity_log").insert({
      user_id: userId,
      action: "school_class_created",
      entity_type: "centre",
      entity_id: centreId,
      metadata: { name, year_group: yearGroup, school_year: input.school_year },
    });
    return { error: null };
  } catch (err) {
    console.error("createSchoolClass error:", err);
    return { error: "Failed to create the class." };
  }
}

export async function deleteSchoolClass(classId: string): Promise<{ error: string | null }> {
  try {
    const { userId, error: authError } = await requireStaff();
    if (authError) return { error: authError };
    const supabase = await createSupabaseServerClient();

    const { data: cls } = await supabase
      .from("school_classes")
      .select("id, centre_id, name")
      .eq("id", classId)
      .maybeSingle();
    if (!cls) return { error: "Class not found." };

    // Memberships cascade — the class is a label, deleting it never
    // touches children or enrolments.
    const { error } = await supabase.from("school_classes").delete().eq("id", classId);
    if (error) return { error: error.message };

    // sessions.school_class_ids is a bare uuid[] (no FK) — scrub the
    // deleted id so targeted sessions don't carry a dangling reference.
    const { data: targeted } = await supabase
      .from("sessions")
      .select("id, school_class_ids")
      .contains("school_class_ids", [classId]);
    for (const s of targeted ?? []) {
      const remaining = ((s.school_class_ids as string[]) ?? []).filter(
        (id) => id !== classId
      );
      await supabase
        .from("sessions")
        .update({ school_class_ids: remaining.length > 0 ? remaining : null })
        .eq("id", s.id);
    }

    await supabase.from("activity_log").insert({
      user_id: userId,
      action: "school_class_deleted",
      entity_type: "centre",
      entity_id: cls.centre_id,
      metadata: { name: cls.name },
    });
    return { error: null };
  } catch (err) {
    console.error("deleteSchoolClass error:", err);
    return { error: "Failed to delete the class." };
  }
}

/**
 * Assign children to a class. Moving a child out of another class in
 * the same school+year closes that membership (ended_at) rather than
 * deleting it, so history survives. Also derives children.age_group
 * from the class's year group (design Q2) so programme generation
 * keeps working for school children.
 */
export async function assignChildrenToClass(
  classId: string,
  childIds: string[]
): Promise<{ error: string | null }> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { error: authError };
    if (childIds.length === 0) return { error: null };
    const supabase = await createSupabaseServerClient();

    const { data: cls } = await supabase
      .from("school_classes")
      .select("id, centre_id, year_group, school_year")
      .eq("id", classId)
      .maybeSingle();
    if (!cls) return { error: "Class not found." };

    // Close current memberships in sibling classes (same school+year).
    const { data: siblingClasses } = await supabase
      .from("school_classes")
      .select("id")
      .eq("centre_id", cls.centre_id)
      .eq("school_year", cls.school_year)
      .neq("id", classId);
    const siblingIds = (siblingClasses ?? []).map((c) => c.id);
    if (siblingIds.length > 0) {
      await supabase
        .from("school_class_children")
        .update({ ended_at: sydneyTodayIso() })
        .in("class_id", siblingIds)
        .in("child_id", childIds)
        .is("ended_at", null);
    }

    const { error: upsertErr } = await supabase.from("school_class_children").upsert(
      childIds.map((child_id) => ({ class_id: classId, child_id, ended_at: null })),
      { onConflict: "class_id,child_id" }
    );
    if (upsertErr) return { error: upsertErr.message };

    // Age-band derivation — only worth doing when the band changes.
    const band = yearGroupToAgeBand(cls.year_group);
    await supabase
      .from("children")
      .update({ age_group: band })
      .in("id", childIds)
      .neq("age_group", band);

    return { error: null };
  } catch (err) {
    console.error("assignChildrenToClass error:", err);
    return { error: "Failed to assign students." };
  }
}

export interface ClassOption {
  id: string;
  name: string;
  year_group: string;
  teacher_name: string | null;
}

/** Sydney calendar year — the school year for class scoping. */
function currentSchoolYear(): number {
  return Number(sydneyTodayIso().slice(0, 4));
}

// Single definition of "this centre's current-year classes" — the
// picker and the import preview must agree on which classes exist.
function fetchCurrentYearClasses(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  centreId: string
) {
  return supabase
    .from("school_classes")
    .select("id, name, year_group, teacher_name")
    .eq("centre_id", centreId)
    .eq("school_year", currentSchoolYear())
    .order("name");
}

/**
 * Lightweight class list for pickers (roster session sheet). Staff-only;
 * the coach/portal surfaces read classes through their own RLS-scoped
 * queries instead.
 */
export async function getClassOptionsForCentre(
  centreId: string
): Promise<{ data: ClassOption[] | null; error: string | null }> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { data: null, error: authError };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await fetchCurrentYearClasses(supabase, centreId);
    if (error) return { data: null, error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getClassOptionsForCentre error:", err);
    return { data: null, error: "Failed to load classes." };
  }
}

export interface ClassImportPreview {
  plan: ClassImportPlan;
  parseErrors: { line: number; message: string }[];
  rowCount: number;
}

export interface ClassImportOptions {
  /** Create + enrol students the roster doesn't have yet (schools upload
   *  one SIS file; without this every new student is a skip). */
  createMissing?: boolean;
}

async function buildImportPreview(
  centreId: string,
  csvText: string,
  opts: ClassImportOptions = {}
): Promise<{ data: ClassImportPreview | null; error: string | null }> {
  const parsed = parseClassListCsv(csvText);
  if (parsed.rows.length === 0) {
    return {
      data: null,
      error:
        parsed.errors[0]?.message ??
        "No student rows found in the file.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: enrolments, error: enrErr }, { data: currentYearClasses, error: clsErr }] =
    await Promise.all([
      supabase
        .from("centre_children")
        .select("child_id, children!inner(id, first_name, last_name)")
        .eq("centre_id", centreId)
        .eq("status", "active"),
      fetchCurrentYearClasses(supabase, centreId),
    ]);
  if (enrErr) return { data: null, error: enrErr.message };
  if (clsErr) return { data: null, error: clsErr.message };

  const plan = buildClassImportPlan(
    parsed.rows,
    (enrolments ?? []).map((e) => {
      const child = e.children as unknown as {
        id: string;
        first_name: string;
        last_name: string;
      };
      return {
        child_id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
      };
    }),
    currentYearClasses ?? [],
    { createMissing: opts.createMissing }
  );
  return {
    data: { plan, parseErrors: parsed.errors, rowCount: parsed.rows.length },
    error: null,
  };
}

/** Parse a pasted/uploaded class-list CSV and report what a commit would do. */
export async function previewClassImport(
  centreId: string,
  csvText: string,
  opts: ClassImportOptions = {}
): Promise<{ data: ClassImportPreview | null; error: string | null }> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { data: null, error: authError };
    if (csvText.length > 500_000) return { data: null, error: "File too large (500KB max)." };
    return await buildImportPreview(centreId, csvText, opts);
  } catch (err) {
    console.error("previewClassImport error:", err);
    return { data: null, error: "Failed to read the file." };
  }
}

export interface ClassImportResult {
  createdClasses: number;
  createdStudents: number;
  assigned: number;
  unmatched: number;
  ambiguous: number;
  warnings: string[];
}

/**
 * Commit a class-list import: create missing classes for the current
 * school year, fill in missing teachers, and assign matched children.
 * The CSV is re-parsed server-side — the preview the user approved is
 * advisory, never the write payload. Unmatched/ambiguous rows are
 * skipped and reported, not guessed at.
 */
export async function commitClassImport(
  centreId: string,
  csvText: string,
  opts: ClassImportOptions = {}
): Promise<{ data: ClassImportResult | null; error: string | null }> {
  try {
    const { userId, error: authError } = await requireStaff();
    if (authError) return { data: null, error: authError };
    if (csvText.length > 500_000) return { data: null, error: "File too large (500KB max)." };

    const { data: preview, error } = await buildImportPreview(centreId, csvText, opts);
    if (error || !preview) return { data: null, error: error ?? "Failed to read the file." };

    const supabase = await createSupabaseServerClient();
    const schoolYear = currentSchoolYear();
    const classIdByName = new Map<string, string>();
    let createdClasses = 0;

    for (const cls of preview.plan.classes) {
      if (cls.existing_id) {
        classIdByName.set(cls.name, cls.existing_id);
        if (cls.teacher_name) {
          // Fill a missing teacher; never overwrite one already on file.
          await supabase
            .from("school_classes")
            .update({ teacher_name: cls.teacher_name })
            .eq("id", cls.existing_id)
            .is("teacher_name", null);
        }
        continue;
      }
      const { data: inserted, error: insErr } = await supabase
        .from("school_classes")
        .insert({
          centre_id: centreId,
          name: cls.name,
          year_group: cls.year_group,
          school_year: schoolYear,
          teacher_name: cls.teacher_name,
        })
        .select("id")
        .single();
      if (insErr || !inserted) {
        return { data: null, error: `Failed to create class "${cls.name}": ${insErr?.message}` };
      }
      classIdByName.set(cls.name, inserted.id);
      createdClasses++;
    }

    const childrenByClass = new Map<string, string[]>();
    for (const a of preview.plan.assignments) {
      const list = childrenByClass.get(a.className) ?? [];
      list.push(a.child_id);
      childrenByClass.set(a.className, list);
    }

    // New students (createMissing): one batched children insert + one
    // batched enrolment insert, then they join the per-class assignment
    // like any matched child (which also derives their age band).
    let createdStudents = 0;
    if (opts.createMissing && preview.plan.creations.length > 0) {
      const { data: newChildren, error: childErr } = await supabase
        .from("children")
        .insert(
          preview.plan.creations.map((c) => ({
            first_name: c.firstName,
            last_name: c.lastName,
            date_of_birth: c.dateOfBirth,
            age_group: c.ageGroup,
          }))
        )
        .select("id");
      if (childErr || !newChildren) {
        return { data: null, error: `Failed to create students: ${childErr?.message}` };
      }
      const { error: linkErr } = await supabase.from("centre_children").insert(
        newChildren.map((c) => ({ centre_id: centreId, child_id: c.id }))
      );
      if (linkErr) {
        return { data: null, error: `Failed to enrol new students: ${linkErr.message}` };
      }
      // insert preserves input order, so ids line up with creations.
      newChildren.forEach((c, i) => {
        const className = preview.plan.creations[i].className;
        const list = childrenByClass.get(className) ?? [];
        list.push(c.id);
        childrenByClass.set(className, list);
      });
      createdStudents = newChildren.length;
    }
    let assigned = 0;
    for (const [className, childIds] of childrenByClass) {
      const classId = classIdByName.get(className);
      if (!classId) continue;
      const { error: assignErr } = await assignChildrenToClass(classId, childIds);
      if (assignErr) return { data: null, error: assignErr };
      assigned += childIds.length;
    }

    await supabase.from("activity_log").insert({
      user_id: userId,
      action: "school_class_list_imported",
      entity_type: "centre",
      entity_id: centreId,
      metadata: {
        created_classes: createdClasses,
        created_students: createdStudents,
        assigned,
        unmatched: preview.plan.unmatched.length,
        ambiguous: preview.plan.ambiguous.length,
      },
    });

    return {
      data: {
        createdClasses,
        createdStudents,
        assigned,
        unmatched: preview.plan.unmatched.length,
        ambiguous: preview.plan.ambiguous.length,
        warnings: preview.plan.warnings,
      },
      error: null,
    };
  } catch (err) {
    console.error("commitClassImport error:", err);
    return { data: null, error: "Failed to import the class list." };
  }
}

export async function removeChildFromClass(
  classId: string,
  childId: string
): Promise<{ error: string | null }> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { error: authError };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("school_class_children")
      .update({ ended_at: sydneyTodayIso() })
      .eq("class_id", classId)
      .eq("child_id", childId)
      .is("ended_at", null);
    return { error: error?.message ?? null };
  } catch (err) {
    console.error("removeChildFromClass error:", err);
    return { error: "Failed to remove the student." };
  }
}
