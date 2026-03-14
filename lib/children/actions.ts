"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AgeGroup, Gender, ChildStatus } from "@/lib/types/enums";
import type { Child } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface ChildWithCentres extends Child {
  centres: { id: string; name: string; enrolment_status: string }[];
}

export interface ChildListItem {
  id: string;
  first_name: string;
  last_name: string;
  age_group: AgeGroup;
  status: ChildStatus;
  centres: { id: string; name: string }[];
}

export interface ChildDetail extends Child {
  centres: {
    id: string;
    name: string;
    enrolled_at: string;
    enrolment_status: string;
  }[];
  attendance_history: {
    session_id: string;
    date: string;
    sport: string;
    centre_name: string;
    present: boolean;
  }[];
  total_sessions_attended: number;
}

export interface CreateChildData {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  age_group: AgeGroup;
  gender?: Gender | null;
  medical_notes?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  centre_ids?: string[];
}

export interface UpdateChildData {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  age_group?: AgeGroup;
  gender?: Gender | null;
  medical_notes?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  photo_url?: string | null;
  status?: ChildStatus;
}

export interface ChildFilters {
  search?: string;
  centreId?: string;
  ageGroup?: AgeGroup | "all";
  status?: ChildStatus | "all";
}

export interface ImportChildRow {
  first_name: string;
  last_name: string;
  date_of_birth?: string;
  age_group: AgeGroup;
  gender?: string;
  medical_notes?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

// ============================================================
// getChildrenList
// ============================================================

export async function getChildrenList(
  filters?: ChildFilters
): Promise<{ data: ChildListItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Get all children with status filter
    let query = supabase
      .from("children")
      .select("id, first_name, last_name, age_group, status")
      .order("first_name");

    if (filters?.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters?.ageGroup && filters.ageGroup !== "all") {
      query = query.eq("age_group", filters.ageGroup);
    }

    if (filters?.search) {
      const term = `%${filters.search}%`;
      query = query.or(`first_name.ilike.${term},last_name.ilike.${term}`);
    }

    const { data: children, error: childrenError } = await query;
    if (childrenError) throw childrenError;
    if (!children || children.length === 0) return { data: [], error: null };

    // Get centre links
    const childIds = children.map((c) => c.id);
    const { data: links, error: linksError } = await supabase
      .from("centre_children")
      .select("child_id, centre_id, status")
      .in("child_id", childIds)
      .eq("status", "active");

    if (linksError) throw linksError;

    // Get centre names
    const centreIds = [...new Set((links ?? []).map((l) => l.centre_id))];
    let centreMap = new Map<string, string>();
    if (centreIds.length > 0) {
      const { data: centres } = await supabase
        .from("centres")
        .select("id, name")
        .in("id", centreIds);
      centreMap = new Map((centres ?? []).map((c) => [c.id, c.name]));
    }

    // Build child-centre map
    const childCentreMap = new Map<
      string,
      { id: string; name: string }[]
    >();
    for (const link of links ?? []) {
      const arr = childCentreMap.get(link.child_id) ?? [];
      arr.push({
        id: link.centre_id,
        name: centreMap.get(link.centre_id) ?? "Unknown",
      });
      childCentreMap.set(link.child_id, arr);
    }

    // Filter by centre if needed
    let result: ChildListItem[] = children.map((c) => ({
      ...c,
      centres: childCentreMap.get(c.id) ?? [],
    }));

    if (filters?.centreId) {
      result = result.filter((c) =>
        c.centres.some((centre) => centre.id === filters.centreId)
      );
    }

    return { data: result, error: null };
  } catch (err) {
    console.error("getChildrenList error:", err);
    return { data: null, error: "Failed to load children." };
  }
}

// ============================================================
// getChildDetail
// ============================================================

export async function getChildDetail(
  id: string
): Promise<{ data: ChildDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Get child
    const { data: child, error: childError } = await supabase
      .from("children")
      .select("*")
      .eq("id", id)
      .single();

    if (childError || !child) return { data: null, error: "Child not found." };

    // Get centre links
    const { data: links } = await supabase
      .from("centre_children")
      .select("centre_id, enrolled_at, status")
      .eq("child_id", id);

    const centreIds = (links ?? []).map((l) => l.centre_id);
    let centreMap = new Map<string, string>();
    if (centreIds.length > 0) {
      const { data: centres } = await supabase
        .from("centres")
        .select("id, name")
        .in("id", centreIds);
      centreMap = new Map((centres ?? []).map((c) => [c.id, c.name]));
    }

    const centres = (links ?? []).map((l) => ({
      id: l.centre_id,
      name: centreMap.get(l.centre_id) ?? "Unknown",
      enrolled_at: l.enrolled_at,
      enrolment_status: l.status,
    }));

    // Get attendance history
    const { data: attendances } = await supabase
      .from("session_attendances")
      .select("session_id, present")
      .eq("child_id", id);

    let attendance_history: ChildDetail["attendance_history"] = [];
    let total_sessions_attended = 0;

    if (attendances && attendances.length > 0) {
      const sessionIds = attendances.map((a) => a.session_id);
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, date, sport, centre_id")
        .in("id", sessionIds)
        .order("date", { ascending: false });

      const sessionCentreIds = [
        ...new Set((sessions ?? []).map((s) => s.centre_id)),
      ];
      let sessionCentreMap = new Map<string, string>();
      if (sessionCentreIds.length > 0) {
        const { data: sessionCentres } = await supabase
          .from("centres")
          .select("id, name")
          .in("id", sessionCentreIds);
        sessionCentreMap = new Map(
          (sessionCentres ?? []).map((c) => [c.id, c.name])
        );
      }

      const attendanceMap = new Map(
        attendances.map((a) => [a.session_id, a.present])
      );

      attendance_history = (sessions ?? []).map((s) => ({
        session_id: s.id,
        date: s.date,
        sport: s.sport,
        centre_name: sessionCentreMap.get(s.centre_id) ?? "Unknown",
        present: attendanceMap.get(s.id) ?? false,
      }));

      total_sessions_attended = attendances.filter((a) => a.present).length;
    }

    return {
      data: {
        ...child,
        centres,
        attendance_history,
        total_sessions_attended,
      },
      error: null,
    };
  } catch (err) {
    console.error("getChildDetail error:", err);
    return { data: null, error: "Failed to load child details." };
  }
}

// ============================================================
// createChild
// ============================================================

export async function createChild(
  data: CreateChildData
): Promise<{ data: Child | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { centre_ids, ...childFields } = data;

    const { data: child, error: childError } = await supabase
      .from("children")
      .insert({
        first_name: childFields.first_name.trim(),
        last_name: childFields.last_name.trim(),
        date_of_birth: childFields.date_of_birth ?? null,
        age_group: childFields.age_group,
        gender: childFields.gender ?? null,
        medical_notes: childFields.medical_notes ?? null,
        parent_name: childFields.parent_name ?? null,
        parent_phone: childFields.parent_phone ?? null,
        parent_email: childFields.parent_email ?? null,
      })
      .select()
      .single();

    if (childError) throw childError;

    // Link to centres
    if (centre_ids && centre_ids.length > 0 && child) {
      const links = centre_ids.map((centreId) => ({
        child_id: child.id,
        centre_id: centreId,
      }));
      await supabase.from("centre_children").insert(links);
    }

    // Activity log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "child_created",
      entity_type: "child",
      entity_id: child?.id,
      metadata: {
        name: `${childFields.first_name} ${childFields.last_name}`,
        age_group: childFields.age_group,
        centres: centre_ids ?? [],
      },
    });

    revalidatePath("/ops/children");
    revalidatePath("/admin/children");
    return { data: child, error: null };
  } catch (err) {
    console.error("createChild error:", err);
    return { data: null, error: "Failed to create child." };
  }
}

// ============================================================
// updateChild
// ============================================================

export async function updateChild(
  id: string,
  data: UpdateChildData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("children")
      .update(data)
      .eq("id", id);

    if (error) throw error;

    revalidatePath("/ops/children");
    revalidatePath("/admin/children");
    revalidatePath(`/ops/children/${id}`);
    revalidatePath(`/admin/children/${id}`);
    return { error: null };
  } catch (err) {
    console.error("updateChild error:", err);
    return { error: "Failed to update child." };
  }
}

// ============================================================
// linkChildToCentre
// ============================================================

export async function linkChildToCentre(
  childId: string,
  centreId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("centre_children").upsert(
      {
        child_id: childId,
        centre_id: centreId,
        status: "active",
      },
      { onConflict: "child_id,centre_id" }
    );

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("linkChildToCentre error:", err);
    return { error: "Failed to link child to centre." };
  }
}

// ============================================================
// withdrawChildFromCentre
// ============================================================

export async function withdrawChildFromCentre(
  childId: string,
  centreId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("centre_children")
      .update({ status: "withdrawn" })
      .eq("child_id", childId)
      .eq("centre_id", centreId);

    if (error) throw error;

    revalidatePath("/ops/centres");
    revalidatePath("/admin/centres");
    return { error: null };
  } catch (err) {
    console.error("withdrawChildFromCentre error:", err);
    return { error: "Failed to withdraw child." };
  }
}

// ============================================================
// getCentreChildren — children at a specific centre with stats
// ============================================================

export interface CentreChildWithStats {
  id: string;
  first_name: string;
  last_name: string;
  age_group: AgeGroup;
  status: ChildStatus;
  enrolled_at: string;
  enrolment_status: string;
  sessions_attended: number;
  total_sessions: number;
  last_attended: string | null;
}

export async function getCentreChildren(
  centreId: string
): Promise<{ data: CentreChildWithStats[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get linked children
    const { data: links, error: linksError } = await supabase
      .from("centre_children")
      .select("child_id, enrolled_at, status")
      .eq("centre_id", centreId)
      .eq("status", "active");

    if (linksError) throw linksError;
    if (!links || links.length === 0) return { data: [], error: null };

    const childIds = links.map((l) => l.child_id);

    // Get child records
    const { data: children, error: childrenError } = await supabase
      .from("children")
      .select("id, first_name, last_name, age_group, status")
      .in("id", childIds);

    if (childrenError) throw childrenError;

    // Get total completed sessions at this centre
    const { data: completedSessions } = await supabase
      .from("sessions")
      .select("id, date")
      .eq("centre_id", centreId)
      .eq("status", "completed");

    const totalSessions = completedSessions?.length ?? 0;
    const sessionIds = (completedSessions ?? []).map((s) => s.id);

    // Get attendances for these children at these sessions
    let attendanceMap = new Map<
      string,
      { count: number; lastDate: string | null }
    >();
    if (sessionIds.length > 0) {
      const { data: attendances } = await supabase
        .from("session_attendances")
        .select("child_id, session_id, present")
        .in("session_id", sessionIds)
        .in("child_id", childIds)
        .eq("present", true);

      // Build session date map
      const sessionDateMap = new Map(
        (completedSessions ?? []).map((s) => [s.id, s.date])
      );

      for (const a of attendances ?? []) {
        const existing = attendanceMap.get(a.child_id) ?? {
          count: 0,
          lastDate: null,
        };
        existing.count++;
        const sessionDate = sessionDateMap.get(a.session_id) ?? null;
        if (
          sessionDate &&
          (!existing.lastDate || sessionDate > existing.lastDate)
        ) {
          existing.lastDate = sessionDate;
        }
        attendanceMap.set(a.child_id, existing);
      }
    }

    // Build link map
    const linkMap = new Map(links.map((l) => [l.child_id, l]));

    const result: CentreChildWithStats[] = (children ?? []).map((c) => {
      const link = linkMap.get(c.id)!;
      const stats = attendanceMap.get(c.id) ?? { count: 0, lastDate: null };
      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        age_group: c.age_group,
        status: c.status,
        enrolled_at: link.enrolled_at,
        enrolment_status: link.status,
        sessions_attended: stats.count,
        total_sessions: totalSessions,
        last_attended: stats.lastDate,
      };
    });

    // Sort by name
    result.sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(
        `${b.first_name} ${b.last_name}`
      )
    );

    return { data: result, error: null };
  } catch (err) {
    console.error("getCentreChildren error:", err);
    return { data: null, error: "Failed to load centre children." };
  }
}

// ============================================================
// importChildren — CSV import with duplicate detection
// ============================================================

export async function importChildren(
  rows: ImportChildRow[],
  centreId: string,
  skipDuplicates: boolean
): Promise<{ data: ImportResult | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const result: ImportResult = { created: 0, skipped: 0, errors: [] };
    const validAgeGroups = ["3-5", "5-8", "8-12"];
    const validGenders = ["male", "female", "other", "prefer_not_to_say"];

    // Get existing children at this centre for duplicate detection
    const { data: existingLinks } = await supabase
      .from("centre_children")
      .select("child_id")
      .eq("centre_id", centreId)
      .eq("status", "active");

    const existingChildIds = (existingLinks ?? []).map((l) => l.child_id);
    let existingNames = new Set<string>();
    if (existingChildIds.length > 0) {
      const { data: existingChildren } = await supabase
        .from("children")
        .select("first_name, last_name")
        .in("id", existingChildIds);
      existingNames = new Set(
        (existingChildren ?? []).map(
          (c) => `${c.first_name.toLowerCase()}|${c.last_name.toLowerCase()}`
        )
      );
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // Validate required fields
      if (!row.first_name?.trim() || !row.last_name?.trim()) {
        result.errors.push(`Row ${rowNum}: Missing first or last name.`);
        continue;
      }

      if (!row.age_group || !validAgeGroups.includes(row.age_group)) {
        result.errors.push(
          `Row ${rowNum}: Invalid age group "${row.age_group}". Must be 3-5, 5-8, or 8-12.`
        );
        continue;
      }

      // Validate gender if provided
      const gender =
        row.gender && validGenders.includes(row.gender.toLowerCase())
          ? (row.gender.toLowerCase() as Gender)
          : null;

      // Check duplicate
      const nameKey = `${row.first_name.trim().toLowerCase()}|${row.last_name.trim().toLowerCase()}`;
      if (existingNames.has(nameKey)) {
        if (skipDuplicates) {
          result.skipped++;
          continue;
        }
      }

      // Create child
      const { data: child, error: insertError } = await supabase
        .from("children")
        .insert({
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          date_of_birth: row.date_of_birth || null,
          age_group: row.age_group as AgeGroup,
          gender,
          medical_notes: row.medical_notes?.trim() || null,
          parent_name: row.parent_name?.trim() || null,
          parent_phone: row.parent_phone?.trim() || null,
          parent_email: row.parent_email?.trim() || null,
        })
        .select("id")
        .single();

      if (insertError || !child) {
        result.errors.push(`Row ${rowNum}: Failed to create — ${insertError?.message ?? "unknown error"}`);
        continue;
      }

      // Link to centre
      await supabase.from("centre_children").insert({
        child_id: child.id,
        centre_id: centreId,
      });

      existingNames.add(nameKey);
      result.created++;
    }

    // Activity log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "children_imported",
      entity_type: "centre",
      entity_id: centreId,
      metadata: {
        total_rows: rows.length,
        created: result.created,
        skipped: result.skipped,
        errors: result.errors.length,
      },
    });

    revalidatePath("/ops/children");
    revalidatePath("/admin/children");
    return { data: result, error: null };
  } catch (err) {
    console.error("importChildren error:", err);
    return { data: null, error: "Failed to import children." };
  }
}

// ============================================================
// quickAddChild — streamlined for coach session workflow
// ============================================================

export async function quickAddChild(
  firstName: string,
  lastName: string,
  ageGroup: AgeGroup,
  centreId: string
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Create child
    const { data: child, error: childError } = await supabase
      .from("children")
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age_group: ageGroup,
      })
      .select("id")
      .single();

    if (childError || !child) throw childError;

    // Link to centre
    await supabase.from("centre_children").insert({
      child_id: child.id,
      centre_id: centreId,
    });

    return { data: { id: child.id }, error: null };
  } catch (err) {
    console.error("quickAddChild error:", err);
    return { data: null, error: "Failed to add child." };
  }
}
