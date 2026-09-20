"use server";

// Teacher-entered assessments (migration 088). The school's own staff
// complete the term's skill ratings in the portal, into the same
// skill_ratings table the coaches use, so report cards, the term report,
// class rollups, Impact and the CSV need no second source. Everything
// reads and writes through the cookie client — RLS decides what a portal
// user can see and author.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentClientUser } from "@/lib/client/actions";
import { scopeClasses, isClassScoped, canRateChild } from "@/lib/client/assessment-scope";
import { buildGridRows, type GridRow, type GridRatingRow } from "@/lib/client/assessment-grid";
import type { CoachAssessmentTask } from "@/lib/assessments/actions";
import type { AssessmentSkill, SkillRatingEntry } from "@/lib/types/database";
import type { AgeGroup } from "@/lib/types/enums";

export type ClientAssessmentTask = CoachAssessmentTask;

export async function getClientAssessmentTasks(
  centreId: string
): Promise<{ data: ClientAssessmentTask[]; error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { data: [], error: "Not authorised." };
    }
    const supabase = await createSupabaseServerClient();

    const { data: activeTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!activeTerm) return { data: [], error: null };

    const { data: templates } = await supabase
      .from("assessment_templates")
      .select("id, subject, sport, age_group, skills_json, centre_id")
      .eq("term_id", activeTerm.id)
      .or(`centre_id.is.null,centre_id.eq.${centreId}`);
    if (!templates || templates.length === 0) return { data: [], error: null };

    // Current-year classes, scoped to the caller.
    const { data: classRows } = await supabase
      .from("school_classes")
      .select("id, name, year_group, school_year")
      .eq("centre_id", centreId);
    const latestYear =
      classRows && classRows.length > 0
        ? Math.max(...classRows.map((c) => c.school_year))
        : null;
    const classes = scopeClasses(
      (classRows ?? []).filter((c) => c.school_year === latestYear),
      clientUser.class_ids
    );
    const classByChild = new Map<string, string>();
    if (classes.length > 0) {
      const { data: members } = await supabase
        .from("school_class_children")
        .select("class_id, child_id")
        .in(
          "class_id",
          classes.map((c) => c.id)
        )
        .is("ended_at", null);
      for (const m of members ?? []) classByChild.set(m.child_id, m.class_id);
    }
    const teacherScoped = isClassScoped(clientUser.class_ids);

    const { data: enrolled } = await supabase
      .from("centre_children")
      .select("child_id")
      .eq("centre_id", centreId)
      .eq("status", "active");
    const childIds = (enrolled ?? []).map((cc) => cc.child_id);
    if (childIds.length === 0) return { data: [], error: null };

    const { data: children } = await supabase
      .from("children")
      .select("id, first_name, last_name, age_group")
      .in("id", childIds)
      .eq("status", "active")
      .order("first_name");

    const tasks: ClientAssessmentTask[] = [];
    for (const template of templates) {
      const band = (children ?? []).filter((c) => c.age_group === template.age_group);
      if (band.length === 0) continue;

      // Anyone's rating this term counts — a child the coach already
      // assessed shows as done rather than inviting a second, conflicting
      // rating (the upsert would fail RLS on the coach's row anyway).
      const { data: existing } = await supabase
        .from("skill_ratings")
        .select("child_id")
        .eq("assessment_template_id", template.id)
        .eq("term_id", activeTerm.id)
        .in(
          "child_id",
          band.map((c) => c.id)
        );
      const rated = new Set((existing ?? []).map((r) => r.child_id));
      const mapChild = (c: (typeof band)[number]) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        age_group: c.age_group as AgeGroup,
        already_rated: rated.has(c.id),
      });
      const base = {
        template_id: template.id,
        subject: template.subject ?? "pdhpe",
        sport: template.sport,
        age_group: template.age_group as AgeGroup,
        skills: template.skills_json as AssessmentSkill[],
        centre_id: centreId,
        centre_name: clientUser.centre_name,
        term_id: activeTerm.id,
        term_name: activeTerm.name,
      };

      if (classes.length > 0) {
        for (const cls of classes) {
          const members = band.filter((c) => classByChild.get(c.id) === cls.id);
          if (members.length === 0) continue;
          tasks.push({
            ...base,
            class_id: cls.id,
            class_name: cls.name,
            children: members.map(mapChild),
          });
        }
        // Band children in no class: only for unscoped viewers — a
        // class teacher's list is their class, nothing else.
        if (!teacherScoped) {
          const unassigned = band.filter((c) => !classByChild.has(c.id));
          if (unassigned.length > 0) {
            tasks.push({ ...base, class_id: null, class_name: null, children: unassigned.map(mapChild) });
          }
        }
      } else if (!teacherScoped) {
        tasks.push({ ...base, class_id: null, class_name: null, children: band.map(mapChild) });
      }
    }

    return { data: tasks, error: null };
  } catch (err) {
    console.error("getClientAssessmentTasks error:", err);
    return { data: [], error: "Failed to load assessments." };
  }
}

export interface ClassAssessmentGrid {
  class: { id: string; name: string; year_group: string; teacher_name: string | null };
  template: { id: string; subject: string; sport: string; age_group: string; skills: AssessmentSkill[] };
  term: { id: string; name: string };
  rows: GridRow[];
}

/**
 * Students × skills for one class and one template this term. The
 * grid is how a teacher fills in a whole class in minutes; the
 * one-by-one flow stays for phones.
 */
export async function getClassAssessmentGrid(
  centreId: string,
  classId: string,
  templateId: string
): Promise<{ data: ClassAssessmentGrid | null; error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { data: null, error: "Not authorised." };
    }
    if (isClassScoped(clientUser.class_ids) && !clientUser.class_ids.includes(classId)) {
      return { data: null, error: "This class is not one of yours." };
    }
    const supabase = await createSupabaseServerClient();

    const [{ data: cls }, { data: template }, { data: activeTerm }] = await Promise.all([
      supabase
        .from("school_classes")
        .select("id, name, year_group, teacher_name, centre_id")
        .eq("id", classId)
        .eq("centre_id", centreId)
        .maybeSingle(),
      supabase
        .from("assessment_templates")
        .select("id, subject, sport, age_group, skills_json, centre_id, term_id")
        .eq("id", templateId)
        .maybeSingle(),
      supabase.from("terms").select("id, name").eq("status", "active").limit(1).maybeSingle(),
    ]);
    if (!cls) return { data: null, error: "Class not found." };
    if (!template || (template.centre_id && template.centre_id !== centreId)) {
      return { data: null, error: "Assessment not found." };
    }
    if (!activeTerm || template.term_id !== activeTerm.id) {
      return { data: null, error: "This assessment is not for the current term." };
    }

    const { data: members } = await supabase
      .from("school_class_children")
      .select("child_id")
      .eq("class_id", classId)
      .is("ended_at", null);
    const memberIds = (members ?? []).map((m) => m.child_id);
    const { data: students } = memberIds.length
      ? await supabase
          .from("children")
          .select("id, first_name, last_name, age_group")
          .in("id", memberIds)
          .eq("age_group", template.age_group)
          .eq("status", "active")
          .order("first_name")
      : { data: [] as Array<{ id: string; first_name: string; last_name: string; age_group: string }> };

    const { data: ratings } = students && students.length
      ? await supabase
          .from("skill_ratings")
          .select("child_id, coach_id, client_user_id, ratings_json, notes")
          .eq("assessment_template_id", templateId)
          .eq("term_id", activeTerm.id)
          .in(
            "child_id",
            students.map((s) => s.id)
          )
      : { data: [] as GridRatingRow[] };

    return {
      data: {
        class: { id: cls.id, name: cls.name, year_group: cls.year_group, teacher_name: cls.teacher_name },
        template: {
          id: template.id,
          subject: template.subject ?? "pdhpe",
          sport: template.sport,
          age_group: template.age_group,
          skills: template.skills_json as AssessmentSkill[],
        },
        term: activeTerm,
        rows: buildGridRows(students ?? [], (ratings ?? []) as GridRatingRow[], clientUser.id),
      },
      error: null,
    };
  } catch (err) {
    console.error("getClassAssessmentGrid error:", err);
    return { data: null, error: "Failed to load the class grid." };
  }
}

export async function saveClientChildRating(
  centreId: string,
  input: {
    assessment_template_id: string;
    child_id: string;
    term_id: string;
    ratings_json: SkillRatingEntry[];
    notes?: string | null;
  }
): Promise<{ error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { error: "Not authorised." };
    }
    const supabase = await createSupabaseServerClient();

    // Class scope is an application rule (RLS is centre-wide).
    if (isClassScoped(clientUser.class_ids)) {
      const { data: membership } = await supabase
        .from("school_class_children")
        .select("class_id")
        .eq("child_id", input.child_id)
        .is("ended_at", null);
      const childClassIds = (membership ?? []).map((m) => m.class_id);
      if (!canRateChild(clientUser.class_ids, childClassIds)) {
        return { error: "This student is not in one of your classes." };
      }
    }

    // A coach's rating for this child and term is theirs: say so rather
    // than let the upsert bounce off RLS with a bare permission error.
    const { data: existing } = await supabase
      .from("skill_ratings")
      .select("coach_id, client_user_id")
      .eq("assessment_template_id", input.assessment_template_id)
      .eq("child_id", input.child_id)
      .eq("term_id", input.term_id)
      .maybeSingle();
    if (existing && existing.coach_id) {
      return { error: "Your coach has already assessed this student this term." };
    }
    if (existing && existing.client_user_id && existing.client_user_id !== clientUser.id) {
      return { error: "A colleague has already assessed this student this term." };
    }

    const { error } = await supabase.from("skill_ratings").upsert(
      {
        assessment_template_id: input.assessment_template_id,
        child_id: input.child_id,
        coach_id: null,
        client_user_id: clientUser.id,
        term_id: input.term_id,
        ratings_json: input.ratings_json,
        notes: input.notes ?? null,
        assessed_at: new Date().toISOString(),
      },
      { onConflict: "assessment_template_id,child_id,term_id" }
    );
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("saveClientChildRating error:", err);
    return { error: "Failed to save the assessment." };
  }
}
