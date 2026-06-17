"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AgeGroup } from "@/lib/types/enums";
import type {
  AssessmentTemplate,
  AssessmentSkill,
  SkillRatingEntry,
} from "@/lib/types/database";

// Re-export for consumer convenience
export type { AssessmentSkill, SkillRatingEntry };

// ============================================================
// Types
// ============================================================

export interface AssessmentTemplateListItem {
  id: string;
  sport: string;
  age_group: AgeGroup;
  skill_count: number;
  ratings_count: number;
  term_id: string | null;
  term_name: string | null;
  centre_id: string | null;
  centre_name: string | null;
  created_at: string;
}

export interface AssessmentTemplateDetail extends AssessmentTemplate {
  term_name: string | null;
  centre_name: string | null;
  creator_name: string | null;
  ratings_count: number;
}

export interface ChildRatingWithDetails {
  id: string;
  child_id: string;
  child_first_name: string;
  child_last_name: string;
  child_age_group: AgeGroup;
  ratings_json: SkillRatingEntry[];
  notes: string | null;
  assessed_at: string;
  term_name: string;
}

export interface CoachAssessmentTask {
  template_id: string;
  sport: string;
  age_group: AgeGroup;
  skills: AssessmentSkill[];
  centre_id: string;
  centre_name: string;
  term_id: string;
  term_name: string;
  children: {
    id: string;
    first_name: string;
    last_name: string;
    age_group: AgeGroup;
    already_rated: boolean;
  }[];
}

export interface ChildAssessmentHistory {
  template_id: string;
  sport: string;
  term_id: string;
  term_name: string;
  skills: AssessmentSkill[];
  ratings_json: SkillRatingEntry[];
  notes: string | null;
  assessed_at: string;
}

// ============================================================
// getAssessmentTemplates — list for ops/admin
// ============================================================

export async function getAssessmentTemplates(): Promise<{
  data: AssessmentTemplateListItem[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("assessment_templates")
      .select("id, sport, age_group, skills_json, term_id, centre_id, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch term and centre names + a per-template ratings count for
    // the detail-page tab badge and the "duplicate guard" path.
    const templateIds = (data ?? []).map((t) => t.id);
    const termIds = [...new Set((data ?? []).map((t) => t.term_id).filter(Boolean))] as string[];
    const centreIds = [...new Set((data ?? []).map((t) => t.centre_id).filter(Boolean))] as string[];

    const [termsResult, centresResult, ratingsResult] = await Promise.all([
      termIds.length > 0
        ? supabase.from("terms").select("id, name").in("id", termIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      centreIds.length > 0
        ? supabase.from("centres").select("id, name").in("id", centreIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      templateIds.length > 0
        ? supabase
            .from("skill_ratings")
            .select("assessment_template_id")
            .in("assessment_template_id", templateIds)
        : Promise.resolve({
            data: [] as Array<{ assessment_template_id: string }>,
          }),
    ]);

    const termMap = new Map((termsResult.data ?? []).map((t) => [t.id, t.name]));
    const centreMap = new Map((centresResult.data ?? []).map((c) => [c.id, c.name]));

    const ratingsByTemplate = new Map<string, number>();
    for (const row of ratingsResult.data ?? []) {
      const r = row as { assessment_template_id: string };
      ratingsByTemplate.set(
        r.assessment_template_id,
        (ratingsByTemplate.get(r.assessment_template_id) ?? 0) + 1,
      );
    }

    const items: AssessmentTemplateListItem[] = (data ?? []).map((t) => ({
      id: t.id,
      sport: t.sport,
      age_group: t.age_group as AgeGroup,
      skill_count: Array.isArray(t.skills_json) ? t.skills_json.length : 0,
      ratings_count: ratingsByTemplate.get(t.id) ?? 0,
      term_id: t.term_id ?? null,
      term_name: t.term_id ? termMap.get(t.term_id) ?? null : null,
      centre_id: t.centre_id ?? null,
      centre_name: t.centre_id ? centreMap.get(t.centre_id) ?? null : null,
      created_at: t.created_at,
    }));

    return { data: items, error: null };
  } catch (err) {
    console.error("getAssessmentTemplates error:", err);
    return { data: [], error: "Failed to load assessment templates." };
  }
}

// ============================================================
// Auth gate — admin/ops only for bulk + destructive operations
// ============================================================

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
// bulkDuplicateAssessmentTemplates
// ============================================================
//
// Copies each selected template into a brand-new row. We keep
// sport/age_group/skills_json/term_id/centre_id intact and clear out
// `created_by` to the current admin/ops user. A per-id error array
// surfaces partial failures so the UI can toast a precise count.

export async function bulkDuplicateAssessmentTemplates(
  templateIds: string[],
): Promise<{
  duplicated: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!templateIds.length) {
    return { duplicated: 0, errors: [], error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { duplicated: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error: fetchError } = await supabase
    .from("assessment_templates")
    .select("id, sport, age_group, skills_json, term_id, centre_id")
    .in("id", templateIds);
  if (fetchError) {
    return {
      duplicated: 0,
      errors: [],
      error: fetchError.message,
    };
  }

  const fetchedIds = new Set((rows ?? []).map((r) => r.id));
  const errors: { id: string; error: string }[] = templateIds
    .filter((id) => !fetchedIds.has(id))
    .map((id) => ({ id, error: "Template not found." }));
  let duplicated = 0;

  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      sport: string;
      age_group: AgeGroup;
      skills_json: unknown;
      term_id: string | null;
      centre_id: string | null;
    };
    const { error } = await supabase.from("assessment_templates").insert({
      sport: r.sport,
      age_group: r.age_group,
      skills_json: Array.isArray(r.skills_json) ? r.skills_json : [],
      term_id: r.term_id,
      centre_id: r.centre_id,
      created_by: gate.userId,
    });
    if (error) {
      errors.push({ id: r.id, error: error.message });
    } else {
      duplicated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "assessment_template_bulk_duplicated",
        entity_type: "assessment_template",
        entity_id: r.id,
      });
    }
  }

  revalidatePath("/admin/assessments");
  revalidatePath("/ops/assessments");

  return {
    duplicated,
    errors,
    error:
      errors.length && duplicated === 0
        ? "Failed to duplicate templates."
        : errors.length
          ? "Some templates failed to duplicate."
          : null,
  };
}

// ============================================================
// bulkDeleteAssessmentTemplates
// ============================================================
//
// Mirrors the single-row `deleteAssessmentTemplate` — any template
// that still has `skill_ratings` is skipped (with a per-id error)
// because that's data the org is meant to keep around. Ops-safe.

export async function bulkDeleteAssessmentTemplates(
  templateIds: string[],
): Promise<{
  deleted: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!templateIds.length) {
    return { deleted: 0, errors: [], error: "No templates selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { deleted: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  // One bulk read for ratings counts so we don't make N round-trips.
  const { data: ratingRows } = await supabase
    .from("skill_ratings")
    .select("assessment_template_id")
    .in("assessment_template_id", templateIds);
  const ratingsByTemplate = new Map<string, number>();
  for (const row of ratingRows ?? []) {
    const r = row as { assessment_template_id: string };
    ratingsByTemplate.set(
      r.assessment_template_id,
      (ratingsByTemplate.get(r.assessment_template_id) ?? 0) + 1,
    );
  }

  const errors: { id: string; error: string }[] = [];
  let deleted = 0;

  for (const id of templateIds) {
    const count = ratingsByTemplate.get(id) ?? 0;
    if (count > 0) {
      errors.push({
        id,
        error: `${count} rating${count === 1 ? "" : "s"} exist — remove ratings first.`,
      });
      continue;
    }
    const { error } = await supabase
      .from("assessment_templates")
      .delete()
      .eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
    } else {
      deleted += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "assessment_template_bulk_deleted",
        entity_type: "assessment_template",
        entity_id: id,
      });
    }
  }

  revalidatePath("/admin/assessments");
  revalidatePath("/ops/assessments");

  return {
    deleted,
    errors,
    error:
      errors.length && deleted === 0
        ? "Failed to delete templates."
        : errors.length
          ? "Some templates couldn't be deleted."
          : null,
  };
}

// ============================================================
// createAssessmentTemplate
// ============================================================

export async function createAssessmentTemplate(input: {
  sport: string;
  age_group: AgeGroup;
  skills_json: AssessmentSkill[];
  term_id?: string | null;
  centre_id?: string | null;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("assessment_templates")
      .insert({
        sport: input.sport,
        age_group: input.age_group,
        skills_json: input.skills_json,
        term_id: input.term_id ?? null,
        centre_id: input.centre_id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) throw error;

    revalidatePath("/ops/assessments");
    revalidatePath("/admin/assessments");

    return { data: { id: data.id }, error: null };
  } catch (err) {
    console.error("createAssessmentTemplate error:", err);
    return { data: null, error: "Failed to create assessment template." };
  }
}

// ============================================================
// deleteAssessmentTemplate
// ============================================================

export async function deleteAssessmentTemplate(
  templateId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Check if there are existing ratings — prevent deletion if so
    const { count } = await supabase
      .from("skill_ratings")
      .select("id", { count: "exact", head: true })
      .eq("assessment_template_id", templateId);

    if (count && count > 0) {
      return {
        error: `Cannot delete: ${count} rating${count !== 1 ? "s" : ""} exist for this template. Remove ratings first.`,
      };
    }

    const { error } = await supabase
      .from("assessment_templates")
      .delete()
      .eq("id", templateId);

    if (error) throw error;

    revalidatePath("/ops/assessments");
    revalidatePath("/admin/assessments");

    return { error: null };
  } catch (err) {
    console.error("deleteAssessmentTemplate error:", err);
    return { error: "Failed to delete assessment template." };
  }
}

// ============================================================
// getAssessmentTemplateDetail
// ============================================================

export async function getAssessmentTemplateDetail(
  templateId: string
): Promise<{ data: AssessmentTemplateDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: template, error } = await supabase
      .from("assessment_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (error || !template) return { data: null, error: "Template not found." };

    // Fetch related names
    const [termResult, centreResult, creatorResult, ratingsCount] =
      await Promise.all([
        template.term_id
          ? supabase
              .from("terms")
              .select("name")
              .eq("id", template.term_id)
              .single()
          : { data: null },
        template.centre_id
          ? supabase
              .from("centres")
              .select("name")
              .eq("id", template.centre_id)
              .single()
          : { data: null },
        supabase
          .from("profiles")
          .select("name")
          .eq("id", template.created_by)
          .single(),
        supabase
          .from("skill_ratings")
          .select("id", { count: "exact", head: true })
          .eq("assessment_template_id", templateId),
      ]);

    return {
      data: {
        ...template,
        age_group: template.age_group as AgeGroup,
        skills_json: template.skills_json as AssessmentSkill[],
        term_name: termResult.data?.name ?? null,
        centre_name: centreResult.data?.name ?? null,
        creator_name: creatorResult.data?.name ?? null,
        ratings_count: ratingsCount.count ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("getAssessmentTemplateDetail error:", err);
    return { data: null, error: "Failed to load template details." };
  }
}

// ============================================================
// getCoachAssessmentTasks — pending assessments for a coach
// ============================================================

export async function getCoachAssessmentTasks(): Promise<{
  data: CoachAssessmentTask[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    // Get active term
    const { data: activeTerm } = await supabase
      .from("terms")
      .select("id, name")
      .eq("status", "active")
      .limit(1)
      .single();

    if (!activeTerm) return { data: [], error: null };

    // Get templates for the active term
    const { data: templates } = await supabase
      .from("assessment_templates")
      .select("id, sport, age_group, skills_json, centre_id, term_id")
      .eq("term_id", activeTerm.id);

    if (!templates || templates.length === 0) return { data: [], error: null };

    // Get centres where this coach has sessions
    const { data: coachSessions } = await supabase
      .from("sessions")
      .select("centre_id")
      .eq("coach_id", user.id)
      .eq("term_id", activeTerm.id);

    const coachCentreIds = [...new Set((coachSessions ?? []).map((s) => s.centre_id))];
    if (coachCentreIds.length === 0) return { data: [], error: null };

    const tasks: CoachAssessmentTask[] = [];

    for (const template of templates) {
      // Only show templates for centres the coach works at
      if (template.centre_id && !coachCentreIds.includes(template.centre_id)) continue;

      const targetCentreIds = template.centre_id
        ? [template.centre_id]
        : coachCentreIds;

      for (const centreId of targetCentreIds) {
        // Get centre name
        const { data: centre } = await supabase
          .from("centres")
          .select("name")
          .eq("id", centreId)
          .single();

        // Get children at this centre matching the age group
        const { data: centreChildren } = await supabase
          .from("centre_children")
          .select("child_id")
          .eq("centre_id", centreId)
          .eq("status", "active");

        if (!centreChildren || centreChildren.length === 0) continue;

        const childIds = centreChildren.map((cc) => cc.child_id);

        const { data: children } = await supabase
          .from("children")
          .select("id, first_name, last_name, age_group")
          .in("id", childIds)
          .eq("age_group", template.age_group)
          .eq("status", "active")
          .order("first_name");

        if (!children || children.length === 0) continue;

        // Check which children already have ratings for this template + term
        const { data: existingRatings } = await supabase
          .from("skill_ratings")
          .select("child_id")
          .eq("assessment_template_id", template.id)
          .eq("term_id", activeTerm.id)
          .eq("coach_id", user.id);

        const ratedChildIds = new Set(
          (existingRatings ?? []).map((r) => r.child_id)
        );

        tasks.push({
          template_id: template.id,
          sport: template.sport,
          age_group: template.age_group as AgeGroup,
          skills: template.skills_json as AssessmentSkill[],
          centre_id: centreId,
          centre_name: centre?.name ?? "Unknown",
          term_id: activeTerm.id,
          term_name: activeTerm.name,
          children: children.map((c) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            age_group: c.age_group as AgeGroup,
            already_rated: ratedChildIds.has(c.id),
          })),
        });
      }
    }

    return { data: tasks, error: null };
  } catch (err) {
    console.error("getCoachAssessmentTasks error:", err);
    return { data: [], error: "Failed to load assessment tasks." };
  }
}

// ============================================================
// saveChildRating — upsert a single child's rating
// ============================================================

export async function saveChildRating(input: {
  assessment_template_id: string;
  child_id: string;
  term_id: string;
  ratings_json: SkillRatingEntry[];
  notes?: string | null;
}): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase.from("skill_ratings").upsert(
      {
        assessment_template_id: input.assessment_template_id,
        child_id: input.child_id,
        coach_id: user.id,
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
    console.error("saveChildRating error:", err);
    return { error: "Failed to save rating." };
  }
}

// ============================================================
// getChildAssessments — assessment history for a child
// ============================================================

export async function getChildAssessments(
  childId: string
): Promise<{ data: ChildAssessmentHistory[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data: ratings, error } = await supabase
      .from("skill_ratings")
      .select("assessment_template_id, term_id, ratings_json, notes, assessed_at")
      .eq("child_id", childId)
      .order("assessed_at", { ascending: false });

    if (error) throw error;
    if (!ratings || ratings.length === 0) return { data: [], error: null };

    // Fetch related templates and terms
    const templateIds = [...new Set(ratings.map((r) => r.assessment_template_id))];
    const termIds = [...new Set(ratings.map((r) => r.term_id))];

    const [templatesResult, termsResult] = await Promise.all([
      supabase
        .from("assessment_templates")
        .select("id, sport, skills_json")
        .in("id", templateIds),
      supabase.from("terms").select("id, name").in("id", termIds),
    ]);

    const templateMap = new Map(
      (templatesResult.data ?? []).map((t) => [t.id, t])
    );
    const termMap = new Map(
      (termsResult.data ?? []).map((t) => [t.id, t.name])
    );

    const history: ChildAssessmentHistory[] = ratings.map((r) => {
      const template = templateMap.get(r.assessment_template_id);
      return {
        template_id: r.assessment_template_id,
        sport: template?.sport ?? "Unknown",
        term_id: r.term_id,
        term_name: termMap.get(r.term_id) ?? "Unknown",
        skills: (template?.skills_json as AssessmentSkill[]) ?? [],
        ratings_json: r.ratings_json as SkillRatingEntry[],
        notes: r.notes,
        assessed_at: r.assessed_at,
      };
    });

    return { data: history, error: null };
  } catch (err) {
    console.error("getChildAssessments error:", err);
    return { data: [], error: "Failed to load assessments." };
  }
}

// ============================================================
// getAssessedChildIdsForCentre — which children have been assessed this term
// ============================================================

export async function getAssessedChildIdsForCentre(
  centreId: string
): Promise<{ data: string[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    // Get active term
    const { data: activeTerm } = await supabase
      .from("terms")
      .select("id")
      .eq("status", "active")
      .limit(1)
      .single();

    if (!activeTerm) return { data: [], error: null };

    // Get children at this centre
    const { data: links } = await supabase
      .from("centre_children")
      .select("child_id")
      .eq("centre_id", centreId)
      .eq("status", "active");

    if (!links || links.length === 0) return { data: [], error: null };

    const childIds = links.map((l) => l.child_id);

    // Check which have ratings this term
    const { data: ratings } = await supabase
      .from("skill_ratings")
      .select("child_id")
      .in("child_id", childIds)
      .eq("term_id", activeTerm.id);

    const uniqueIds = [...new Set((ratings ?? []).map((r) => r.child_id))];
    return { data: uniqueIds, error: null };
  } catch (err) {
    console.error("getAssessedChildIdsForCentre error:", err);
    return { data: [], error: "Failed to check assessments." };
  }
}

// ============================================================
// getTemplateRatings — all ratings for a template (ops/admin)
// ============================================================

export async function getTemplateRatings(
  templateId: string
): Promise<{ data: ChildRatingWithDetails[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data: ratings, error } = await supabase
      .from("skill_ratings")
      .select("id, child_id, term_id, ratings_json, notes, assessed_at")
      .eq("assessment_template_id", templateId)
      .order("assessed_at", { ascending: false });

    if (error) throw error;
    if (!ratings || ratings.length === 0) return { data: [], error: null };

    const childIds = [...new Set(ratings.map((r) => r.child_id))];
    const termIds = [...new Set(ratings.map((r) => r.term_id))];

    const [childrenResult, termsResult] = await Promise.all([
      supabase
        .from("children")
        .select("id, first_name, last_name, age_group")
        .in("id", childIds),
      supabase.from("terms").select("id, name").in("id", termIds),
    ]);

    const childMap = new Map(
      (childrenResult.data ?? []).map((c) => [c.id, c])
    );
    const termMap = new Map(
      (termsResult.data ?? []).map((t) => [t.id, t.name])
    );

    const result: ChildRatingWithDetails[] = ratings.map((r) => {
      const child = childMap.get(r.child_id);
      return {
        id: r.id,
        child_id: r.child_id,
        child_first_name: child?.first_name ?? "Unknown",
        child_last_name: child?.last_name ?? "",
        child_age_group: (child?.age_group as AgeGroup) ?? "5-8",
        ratings_json: r.ratings_json as SkillRatingEntry[],
        notes: r.notes,
        assessed_at: r.assessed_at,
        term_name: termMap.get(r.term_id) ?? "Unknown",
      };
    });

    return { data: result, error: null };
  } catch (err) {
    console.error("getTemplateRatings error:", err);
    return { data: [], error: "Failed to load ratings." };
  }
}
