"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendParentMagicLink } from "@/lib/parent/actions";
import type { AgeGroup, Gender, ChildStatus } from "@/lib/types/enums";
import type { Child, ChildInsight } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface ChildWithCentres extends Child {
  centres: { id: string; name: string; enrolment_status: string }[];
}

/**
 * Snapshot of a child's assessment state for the *current* active term.
 *   - `done`     → skill_ratings exists for this term
 *   - `pending`  → no rating yet AND the term has been active < 14 days
 *   - `overdue`  → no rating AND the term has been active ≥ 14 days
 *   - `no_term`  → no active term in the system right now
 */
export type AssessmentStatus = "done" | "pending" | "overdue" | "no_term";

export interface ChildListItem {
  id: string;
  first_name: string;
  last_name: string;
  age_group: AgeGroup;
  status: ChildStatus;
  centres: { id: string; name: string }[];
  /** ISO timestamp of the most recent attendance row, or null when none. */
  last_attended_at: string | null;
  /**
   * Up to 2 linked parents (via parent_children → parent_profiles). The
   * cap matches the "+N" overflow chip in the table — anything past 2
   * is shown as `+N` rather than dragging the row width out.
   */
  parents: { id: string; name: string }[];
  /** Total parent_children link count (≥ parents.length when overflowed). */
  parents_total: number;
  assessment_status: AssessmentStatus;
  /** Derived from the child's centres; empty when no centre carries a region. */
  region_ids: string[];
  /** True when child_insights has any row in the last 90 days. */
  has_recent_insight: boolean;
  /** ISO timestamp the row was created — used for "new this week" jump filter. */
  created_at: string;
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
  /** Linked parents with contact details for the Family tab. */
  linked_parents: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    relationship: string;
  }[];
  /** Per-session observations (newest first) for the Engagement tab. */
  observations: {
    id: string;
    observation: string;
    session_id: string;
    created_at: string;
  }[];
  /** Recent AI insights for the Insights tab (last 90 days, newest first). */
  insights: Pick<
    ChildInsight,
    | "id"
    | "summary"
    | "strengths"
    | "areas_for_growth"
    | "recommendations"
    | "insight_type"
    | "created_at"
  >[];
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

    // Get all children with status filter — `created_at` is pulled so
    // the "new this week" jump filter can be applied client-side.
    let query = supabase
      .from("children")
      .select("id, first_name, last_name, age_group, status, created_at")
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

    // Get centre links (active enrolments only — withdrawn enrolments
    // shouldn't power "no centre linked" jumps).
    const childIds = children.map((c) => c.id);
    const { data: links, error: linksError } = await supabase
      .from("centre_children")
      .select("child_id, centre_id, status")
      .in("child_id", childIds)
      .eq("status", "active");

    if (linksError) throw linksError;

    // Get centre names + region_ids (region_id added in migration 039,
    // not yet on the Centre TS interface — select * and overlay).
    const centreIds = [...new Set((links ?? []).map((l) => l.centre_id))];
    const centreMap = new Map<string, string>();
    const centreRegionMap = new Map<string, string | null>();
    if (centreIds.length > 0) {
      const { data: centres } = await supabase
        .from("centres")
        .select("id, name, region_id")
        .in("id", centreIds);
      for (const c of centres ?? []) {
        const row = c as { id: string; name: string; region_id: string | null };
        centreMap.set(row.id, row.name);
        centreRegionMap.set(row.id, row.region_id ?? null);
      }
    }

    // Build child → centres + child → region_ids maps in one pass.
    const childCentreMap = new Map<
      string,
      { id: string; name: string }[]
    >();
    const childRegionsMap = new Map<string, Set<string>>();
    for (const link of links ?? []) {
      const arr = childCentreMap.get(link.child_id) ?? [];
      arr.push({
        id: link.centre_id,
        name: centreMap.get(link.centre_id) ?? "Unknown",
      });
      childCentreMap.set(link.child_id, arr);
      const regionId = centreRegionMap.get(link.centre_id);
      if (regionId) {
        const set = childRegionsMap.get(link.child_id) ?? new Set<string>();
        set.add(regionId);
        childRegionsMap.set(link.child_id, set);
      }
    }

    // ============================================================
    // Parents — join parent_children → parent_profiles. Cap displayed
    // parents at 2 + total count for the "+N" overflow chip.
    // ============================================================
    const parentMap = new Map<string, { id: string; name: string }[]>();
    const parentTotalMap = new Map<string, number>();
    {
      const { data: pcRows } = await supabase
        .from("parent_children")
        .select("parent_id, child_id")
        .in("child_id", childIds);
      const pcs = pcRows ?? [];
      const parentIds = [
        ...new Set(pcs.map((r: { parent_id: string }) => r.parent_id)),
      ];
      const parentNameMap = new Map<string, string>();
      if (parentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("parent_profiles")
          .select("id, first_name, last_name")
          .in("id", parentIds);
        for (const p of profiles ?? []) {
          const row = p as {
            id: string;
            first_name: string;
            last_name: string;
          };
          parentNameMap.set(row.id, `${row.first_name} ${row.last_name}`);
        }
      }
      for (const link of pcs) {
        const row = link as { parent_id: string; child_id: string };
        const total = parentTotalMap.get(row.child_id) ?? 0;
        parentTotalMap.set(row.child_id, total + 1);
        const arr = parentMap.get(row.child_id) ?? [];
        if (arr.length < 2) {
          arr.push({
            id: row.parent_id,
            name: parentNameMap.get(row.parent_id) ?? "Parent",
          });
          parentMap.set(row.child_id, arr);
        }
      }
    }

    // ============================================================
    // Assessment status — read the current active term ONCE, then
    // bucket skill_ratings by child_id. No active term ⇒ no_term.
    // ============================================================
    const assessmentMap = new Map<string, AssessmentStatus>();
    {
      const { data: termRows } = await supabase
        .from("terms")
        .select("id, start_date")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1);
      const term = (termRows ?? [])[0] as
        | { id: string; start_date: string }
        | undefined;
      if (!term) {
        for (const id of childIds) assessmentMap.set(id, "no_term");
      } else {
        const { data: ratings } = await supabase
          .from("skill_ratings")
          .select("child_id")
          .eq("term_id", term.id)
          .in("child_id", childIds);
        const ratedIds = new Set<string>(
          (ratings ?? []).map((r) => (r as { child_id: string }).child_id)
        );
        const ageDays =
          (Date.now() - new Date(term.start_date).getTime()) /
          (1000 * 60 * 60 * 24);
        const overdueAfter14d = ageDays >= 14;
        for (const id of childIds) {
          if (ratedIds.has(id)) {
            assessmentMap.set(id, "done");
          } else {
            assessmentMap.set(id, overdueAfter14d ? "overdue" : "pending");
          }
        }
      }
    }

    // ============================================================
    // Last-attended — single in() query for ALL listed children, sort
    // by created_at desc, bucket the first hit per child_id.
    // Cap at 500 rows to keep the wire payload tight (our biggest
    // centre runs ~30 children per session, so a few thousand rows
    // covers a healthy backlog).
    // ============================================================
    const lastAttendedMap = new Map<string, string>();
    {
      const { data: attendances } = await supabase
        .from("session_attendances")
        .select("child_id, created_at")
        .in("child_id", childIds)
        .eq("present", true)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const row of attendances ?? []) {
        const r = row as { child_id: string; created_at: string };
        if (!lastAttendedMap.has(r.child_id)) {
          lastAttendedMap.set(r.child_id, r.created_at);
        }
      }
    }

    // ============================================================
    // Recent insights — single capped query, bucket to a Set.
    // child_insights table is in migrations; if the query silently
    // returns zero rows, the badge logic stays dormant.
    // ============================================================
    const insightSet = new Set<string>();
    {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { data: insights } = await supabase
        .from("child_insights")
        .select("child_id")
        .in("child_id", childIds)
        .gte("created_at", ninetyDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      for (const row of insights ?? []) {
        insightSet.add((row as { child_id: string }).child_id);
      }
    }

    // Stitch it all together. The Filter-by-centre is applied last
    // because it's a single id match, not a multi-column join.
    let result: ChildListItem[] = children.map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      age_group: c.age_group,
      status: c.status,
      created_at: c.created_at,
      centres: childCentreMap.get(c.id) ?? [],
      last_attended_at: lastAttendedMap.get(c.id) ?? null,
      parents: parentMap.get(c.id) ?? [],
      parents_total: parentTotalMap.get(c.id) ?? 0,
      assessment_status: assessmentMap.get(c.id) ?? "no_term",
      region_ids: Array.from(childRegionsMap.get(c.id) ?? new Set<string>()),
      has_recent_insight: insightSet.has(c.id),
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

    // ============================================================
    // Linked parents — parent_children join parent_profiles
    // ============================================================
    const linked_parents: ChildDetail["linked_parents"] = [];
    {
      const { data: pcRows } = await supabase
        .from("parent_children")
        .select("parent_id, relationship")
        .eq("child_id", id);
      const pcs = pcRows ?? [];
      const parentIds = pcs.map((r: { parent_id: string }) => r.parent_id);
      if (parentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("parent_profiles")
          .select("id, first_name, last_name, email, phone")
          .in("id", parentIds);
        const profMap = new Map<
          string,
          {
            first_name: string;
            last_name: string;
            email: string;
            phone: string | null;
          }
        >();
        for (const p of profiles ?? []) {
          const row = p as {
            id: string;
            first_name: string;
            last_name: string;
            email: string;
            phone: string | null;
          };
          profMap.set(row.id, {
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
          });
        }
        for (const link of pcs) {
          const row = link as { parent_id: string; relationship: string };
          const prof = profMap.get(row.parent_id);
          if (prof) {
            linked_parents.push({
              id: row.parent_id,
              first_name: prof.first_name,
              last_name: prof.last_name,
              email: prof.email,
              phone: prof.phone,
              relationship: row.relationship,
            });
          }
        }
      }
    }

    // ============================================================
    // child_observations — per-session notes recorded by coaches
    // ============================================================
    const observations: ChildDetail["observations"] = [];
    {
      const { data: obsRows } = await supabase
        .from("child_observations")
        .select("id, observation, session_id, created_at")
        .eq("child_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      for (const row of obsRows ?? []) {
        observations.push(
          row as {
            id: string;
            observation: string;
            session_id: string;
            created_at: string;
          }
        );
      }
    }

    // ============================================================
    // child_insights — AI development insights for the Insights tab
    // ============================================================
    const insights: ChildDetail["insights"] = [];
    {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const { data: insightRows } = await supabase
        .from("child_insights")
        .select(
          "id, summary, strengths, areas_for_growth, recommendations, insight_type, created_at"
        )
        .eq("child_id", id)
        .gte("created_at", ninetyDaysAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(20);
      for (const row of insightRows ?? []) {
        insights.push(row as ChildDetail["insights"][number]);
      }
    }

    return {
      data: {
        ...child,
        centres,
        attendance_history,
        total_sessions_attended,
        linked_parents,
        observations,
        insights,
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
// deleteChild
// ============================================================

export async function deleteChild(
  childId: string
): Promise<{ error: string | null; warnings?: string[] }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Check for existing skill ratings
    const { count: ratingCount } = await supabase
      .from("skill_ratings")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId);

    // Check for existing session attendances
    const { count: attendanceCount } = await supabase
      .from("session_attendances")
      .select("*", { count: "exact", head: true })
      .eq("child_id", childId);

    const warnings: string[] = [];
    if (ratingCount && ratingCount > 0) {
      warnings.push(`${ratingCount} skill rating${ratingCount !== 1 ? "s" : ""} will be deleted.`);
    }
    if (attendanceCount && attendanceCount > 0) {
      warnings.push(`${attendanceCount} attendance record${attendanceCount !== 1 ? "s" : ""} will be deleted.`);
    }

    // Delete related records first
    await supabase.from("skill_ratings").delete().eq("child_id", childId);
    await supabase.from("session_attendances").delete().eq("child_id", childId);
    await supabase.from("centre_children").delete().eq("child_id", childId);

    // Delete the child record
    const { error } = await supabase
      .from("children")
      .delete()
      .eq("id", childId);

    if (error) throw error;

    // Activity log
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "child_deleted",
      entity_type: "child",
      entity_id: childId,
    });

    revalidatePath("/ops/children");
    revalidatePath("/admin/children");
    return { error: null, warnings };
  } catch (err) {
    console.error("deleteChild error:", err);
    return { error: "Failed to delete child." };
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

// ============================================================
// Bulk action auth gate
// ============================================================
//
// Bulk writes (linking, status changes, parent messaging, CSV
// exports) are an admin/ops surface only. Coaches see the children
// list via /coach but never the bulk bar — guarding here is a
// belt-and-braces check so a hand-crafted call from a coach session
// still bounces.

async function requireAdminOrOps(): Promise<
  | { ok: true; userId: string; role: "admin" | "ops" }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (profile.role !== "admin" && profile.role !== "ops")
  ) {
    return { ok: false, error: "Not authorised." };
  }

  return { ok: true, userId: user.id, role: profile.role };
}

// ============================================================
// bulkLinkChildrenToCentre — link N children to a single centre
// ============================================================

export async function bulkLinkChildrenToCentre(
  childIds: string[],
  centreId: string,
): Promise<{
  linked: number;
  alreadyLinked: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!childIds.length) {
    return {
      linked: 0,
      alreadyLinked: 0,
      errors: [],
      error: "No children selected.",
    };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { linked: 0, alreadyLinked: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  // Fetch existing active links so we report skipped vs. linked
  // honestly. Insert with onConflict so the same child can be linked
  // again after a withdrawal without an explicit re-activation flow.
  const { data: existing } = await supabase
    .from("centre_children")
    .select("child_id")
    .eq("centre_id", centreId)
    .eq("status", "active")
    .in("child_id", childIds);
  const existingSet = new Set<string>(
    (existing ?? []).map((r: { child_id: string }) => r.child_id),
  );

  const toLink = childIds.filter((id) => !existingSet.has(id));
  const errors: { id: string; error: string }[] = [];
  let linked = 0;

  for (const childId of toLink) {
    const { error } = await supabase.from("centre_children").upsert(
      { child_id: childId, centre_id: centreId, status: "active" },
      { onConflict: "child_id,centre_id" },
    );
    if (error) {
      errors.push({ id: childId, error: error.message });
    } else {
      linked += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "child_bulk_linked_centre",
        entity_type: "child",
        entity_id: childId,
        metadata: { centre_id: centreId },
      });
    }
  }

  revalidatePath("/admin/children");
  revalidatePath("/ops/children");
  return {
    linked,
    alreadyLinked: existingSet.size,
    errors,
    error: errors.length ? "Some children failed to link." : null,
  };
}

// ============================================================
// bulkUpdateChildrenStatus — toggle active/inactive across N children
// ============================================================

export async function bulkUpdateChildrenStatus(
  childIds: string[],
  status: ChildStatus,
): Promise<{
  updated: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!childIds.length) {
    return { updated: 0, errors: [], error: "No children selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { updated: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const errors: { id: string; error: string }[] = [];
  let updated = 0;

  for (const childId of childIds) {
    const { error } = await supabase
      .from("children")
      .update({ status })
      .eq("id", childId);
    if (error) {
      errors.push({ id: childId, error: error.message });
    } else {
      updated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "child_bulk_status_updated",
        entity_type: "child",
        entity_id: childId,
        metadata: { status },
      });
    }
  }

  revalidatePath("/admin/children");
  revalidatePath("/ops/children");
  return {
    updated,
    errors,
    error: errors.length ? "Some children failed to update." : null,
  };
}

// ============================================================
// bulkMessageParents — broadcast a notification to all linked parents
// ============================================================
//
// The notifications table is user-scoped (`user_id`), so we walk
// child_ids → parent_children → parent_profiles.user_id and insert
// one row per unique parent user_id. A single child with two
// parents counts once, never twice.

export async function bulkMessageParents(
  childIds: string[],
  title: string,
  body: string,
): Promise<{
  notified: number;
  uniqueParents: number;
  error: string | null;
}> {
  if (!childIds.length) {
    return { notified: 0, uniqueParents: 0, error: "No children selected." };
  }
  if (!title.trim() || !body.trim()) {
    return {
      notified: 0,
      uniqueParents: 0,
      error: "Title and body are required.",
    };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { notified: 0, uniqueParents: 0, error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  const { data: pcRows } = await supabase
    .from("parent_children")
    .select("parent_id")
    .in("child_id", childIds);

  const parentIds = [
    ...new Set(
      (pcRows ?? []).map((r: { parent_id: string }) => r.parent_id),
    ),
  ];
  if (!parentIds.length) {
    return {
      notified: 0,
      uniqueParents: 0,
      error: "No linked parents to notify.",
    };
  }

  const { data: profiles } = await supabase
    .from("parent_profiles")
    .select("user_id")
    .in("id", parentIds);
  const userIds = [
    ...new Set(
      (profiles ?? [])
        .map((p: { user_id: string }) => p.user_id)
        .filter((u): u is string => Boolean(u)),
    ),
  ];

  if (!userIds.length) {
    return {
      notified: 0,
      uniqueParents: parentIds.length,
      error: "Parents have no auth accounts yet.",
    };
  }

  const rows = userIds.map((userId) => ({
    user_id: userId,
    tier: "important",
    type: "admin_announcement",
    title: title.trim(),
    message: body.trim(),
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    return {
      notified: 0,
      uniqueParents: parentIds.length,
      error: error.message,
    };
  }

  await supabase.from("activity_log").insert({
    user_id: gate.userId,
    action: "children_bulk_parents_messaged",
    entity_type: "child",
    entity_id: null,
    metadata: {
      child_count: childIds.length,
      parents_notified: userIds.length,
      title: title.trim(),
    },
  });

  return {
    notified: userIds.length,
    uniqueParents: parentIds.length,
    error: null,
  };
}

// ============================================================
// exportChildrenCsv — buffer to CSV string for download
// ============================================================
//
// Caller is admin/ops only. Columns: first_name, last_name,
// age_group, status, centres, last_attended_at, assessment_status,
// parent_names. Parents are joined inline as "Jane Smith; Bob Smith"
// — a compromise between including the relationship without
// blowing up the row count.

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportChildrenCsv(
  childIds: string[],
): Promise<{ csv: string | null; error: string | null }> {
  if (!childIds.length) {
    return { csv: null, error: "No children selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { csv: null, error: gate.error };
  }

  const { data, error } = await getChildrenList();
  if (error || !data) {
    return { csv: null, error: error ?? "Failed to load children." };
  }

  const subset = data.filter((c) => childIds.includes(c.id));

  const header = [
    "first_name",
    "last_name",
    "age_group",
    "status",
    "centres",
    "last_attended_at",
    "assessment_status",
    "parent_names",
  ];
  const lines: string[] = [header.join(",")];
  for (const child of subset) {
    const centres = child.centres.map((c) => c.name).join("; ");
    const parents = child.parents.map((p) => p.name).join("; ");
    lines.push(
      [
        csvEscape(child.first_name),
        csvEscape(child.last_name),
        csvEscape(child.age_group),
        csvEscape(child.status),
        csvEscape(centres),
        csvEscape(child.last_attended_at ?? ""),
        csvEscape(child.assessment_status),
        csvEscape(parents),
      ].join(","),
    );
  }

  return { csv: lines.join("\n"), error: null };
}

// ============================================================
// inviteParentForChild — create parent_profile + link + magic link
// ============================================================
//
// Used by the "No parent" muted chip on the children table. We
// create a `parent_profiles` row (no auth user yet — supabase will
// auto-create on first magic-link redemption), insert the
// parent_children link, then dispatch the magic-link email so the
// parent can confirm and finish onboarding themselves.

export async function inviteParentForChild(
  childId: string,
  parentInput: { first_name: string; last_name: string; email: string },
): Promise<{ error: string | null }> {
  const gate = await requireAdminOrOps();
  if (!gate.ok) return { error: gate.error };

  if (
    !parentInput.first_name.trim() ||
    !parentInput.last_name.trim() ||
    !parentInput.email.trim()
  ) {
    return { error: "First name, last name, and email are required." };
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdmin();
  const email = parentInput.email.trim().toLowerCase();

  // Reuse an existing parent_profile if one matches this email —
  // otherwise the join collides on the email unique index.
  const { data: existing } = await supabase
    .from("parent_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let parentId: string;
  if (existing) {
    parentId = (existing as { id: string }).id;
  } else {
    // Use the admin client to bypass RLS on insert — parent_profiles
    // rows can't be self-created until the parent has an auth session.
    const { data: inserted, error: insertError } = await admin
      .from("parent_profiles")
      .insert({
        first_name: parentInput.first_name.trim(),
        last_name: parentInput.last_name.trim(),
        email,
        marketing_opt_in: false,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      return { error: insertError?.message ?? "Failed to create parent." };
    }
    parentId = (inserted as { id: string }).id;
  }

  // Link parent → child (skip if already linked).
  const { data: existingLink } = await supabase
    .from("parent_children")
    .select("id")
    .eq("parent_id", parentId)
    .eq("child_id", childId)
    .maybeSingle();
  if (!existingLink) {
    const { error: linkError } = await admin
      .from("parent_children")
      .insert({
        parent_id: parentId,
        child_id: childId,
        relationship: "parent",
      });
    if (linkError) {
      return { error: linkError.message };
    }
  }

  // Fire the magic link — best-effort. Errors don't roll the link
  // back because the parent_profile is still useful for record-keeping.
  await sendParentMagicLink(email);

  await supabase.from("activity_log").insert({
    user_id: gate.userId,
    action: "parent_invited",
    entity_type: "child",
    entity_id: childId,
    metadata: { parent_id: parentId, email },
  });

  revalidatePath("/admin/children");
  revalidatePath("/ops/children");
  revalidatePath(`/admin/children/${childId}`);
  revalidatePath(`/ops/children/${childId}`);
  return { error: null };
}
