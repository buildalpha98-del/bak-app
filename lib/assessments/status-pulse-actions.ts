"use server";

// ============================================================
// Assessments — status pulse server action
// ============================================================
//
// Powers the inline pulse strip above the template list.
// Four counts that tell Abdul (and Owner) where to look first:
//
//   1. Templates without skills   — `assessment_templates` rows where
//      the `skills_json` array is empty (no skills defined). These are
//      half-built scaffolds that coaches can't act on.
//   2. Children pending this term — active children at centres that
//      have a published template for the active term who haven't yet
//      been rated. Direct read on `skill_ratings` absence per child.
//   3. Coaches with un-submitted  — active coaches who have ever rated
//      anyone but have NOT submitted any rating this week (Monday →
//      now). A "did the rotation keep cadence?" check.
//   4. New templates this week    — `assessment_templates.created_at`
//      since Monday — what was published into the org this week.
//
// Implementation mirrors the existing pulse actions:
//   - All Supabase calls fan out in parallel where possible.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - `head: true` for the templates-this-week count keeps the wire
//     payload tight.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";
import type { AgeGroup } from "@/lib/types/enums";

export interface AssessmentsStatusPulse {
  templatesWithoutSkillsCount: number;
  childrenPendingCount: number;
  coachesUnsubmittedCount: number;
  newTemplatesThisWeekCount: number;
}

export async function getAssessmentsStatusPulse(): Promise<AssessmentsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    // ============================================================
    // Fan out:
    //
    // 1. All templates (id, age_group, centre_id, skills_json, term_id)
    //    — needed for (a) skills-empty count, (b) per-term/age scope
    //    for the pending-children count.
    // 2. Templates created this week (head count) — count only.
    // 3. Active term — scopes the pending-children + coaches checks.
    // 4. Active coaches — denominator for the un-submitted count.
    // 5. Active children — used as the rated/unrated denominator.
    // ============================================================

    const [
      allTemplatesRes,
      newTemplatesRes,
      activeTermRes,
      activeCoachesRes,
      activeChildrenRes,
    ] = await Promise.all([
      supabase
        .from("assessment_templates")
        .select("id, age_group, centre_id, skills_json, term_id"),
      supabase
        .from("assessment_templates")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("terms")
        .select("id")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1),
      supabase
        .from("profiles")
        .select("id")
        .eq("role", "coach")
        .eq("status", "active"),
      supabase
        .from("children")
        .select("id, age_group")
        .eq("status", "active"),
    ]);

    const newTemplatesThisWeekCount = newTemplatesRes.count ?? 0;

    // (1) Templates without skills — empty skills_json array.
    const allTemplates = (allTemplatesRes.data ?? []) as Array<{
      id: string;
      age_group: AgeGroup;
      centre_id: string | null;
      skills_json: unknown;
      term_id: string | null;
    }>;
    let templatesWithoutSkillsCount = 0;
    for (const t of allTemplates) {
      const skills = Array.isArray(t.skills_json) ? t.skills_json : [];
      if (skills.length === 0) templatesWithoutSkillsCount += 1;
    }

    // ============================================================
    // (2) Children pending this term
    //   - Need an active term + at least one template for that term
    //   - For each (template.age_group, template.centre_id) bucket,
    //     enumerate the active children that match and subtract those
    //     already rated for that template in the term.
    // ============================================================

    let childrenPendingCount = 0;
    const activeTermRow = (activeTermRes.data ?? [])[0] as
      | { id: string }
      | undefined;

    if (activeTermRow) {
      const termId = activeTermRow.id;
      const termTemplates = allTemplates.filter((t) => t.term_id === termId);

      if (termTemplates.length > 0) {
        const activeChildren = (activeChildrenRes.data ?? []) as Array<{
          id: string;
          age_group: AgeGroup;
        }>;

        // Pull centre_children once for any centre-scoped templates.
        const centreIdsToFetch = [
          ...new Set(
            termTemplates
              .map((t) => t.centre_id)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        const centreChildrenByCentre = new Map<string, Set<string>>();
        if (centreIdsToFetch.length > 0) {
          const { data: links } = await supabase
            .from("centre_children")
            .select("child_id, centre_id")
            .in("centre_id", centreIdsToFetch)
            .eq("status", "active");
          for (const row of links ?? []) {
            const r = row as { child_id: string; centre_id: string };
            if (!centreChildrenByCentre.has(r.centre_id)) {
              centreChildrenByCentre.set(r.centre_id, new Set());
            }
            centreChildrenByCentre.get(r.centre_id)!.add(r.child_id);
          }
        }

        // For each template, derive the list of expected child_ids
        // (matching age_group + centre constraint), then subtract those
        // already rated for that template in this term.
        const templateIds = termTemplates.map((t) => t.id);
        const { data: termRatings } = await supabase
          .from("skill_ratings")
          .select("assessment_template_id, child_id")
          .eq("term_id", termId)
          .in("assessment_template_id", templateIds);

        const ratedByTemplate = new Map<string, Set<string>>();
        for (const row of termRatings ?? []) {
          const r = row as {
            assessment_template_id: string;
            child_id: string;
          };
          if (!ratedByTemplate.has(r.assessment_template_id)) {
            ratedByTemplate.set(r.assessment_template_id, new Set());
          }
          ratedByTemplate.get(r.assessment_template_id)!.add(r.child_id);
        }

        // Track unique (template_id, child_id) pairs to avoid double-
        // counting the same template's pending child across centres.
        const pendingPairs = new Set<string>();
        for (const tpl of termTemplates) {
          const eligible = activeChildren.filter(
            (c) => c.age_group === tpl.age_group,
          );
          const centreSet =
            tpl.centre_id !== null
              ? centreChildrenByCentre.get(tpl.centre_id) ?? new Set<string>()
              : null;
          const rated = ratedByTemplate.get(tpl.id) ?? new Set<string>();

          for (const child of eligible) {
            if (centreSet !== null && !centreSet.has(child.id)) continue;
            if (rated.has(child.id)) continue;
            pendingPairs.add(`${tpl.id}:${child.id}`);
          }
        }
        childrenPendingCount = pendingPairs.size;
      }
    }

    // ============================================================
    // (3) Coaches with un-submitted ratings this week
    //   - Of the active coaches, how many have NOT submitted any
    //     `skill_ratings` row this week (assessed_at >= Monday)?
    //   - We scope to coaches who have ever submitted at least one
    //     rating (otherwise we'd flag brand-new coaches who simply
    //     have nothing to rate yet — that's noise, not signal).
    // ============================================================

    let coachesUnsubmittedCount = 0;
    const activeCoaches = (activeCoachesRes.data ?? []) as Array<{ id: string }>;
    if (activeCoaches.length > 0) {
      const coachIds = activeCoaches.map((c) => c.id);

      const [allRatingsRes, weekRatingsRes] = await Promise.all([
        supabase
          .from("skill_ratings")
          .select("coach_id")
          .in("coach_id", coachIds),
        supabase
          .from("skill_ratings")
          .select("coach_id")
          .in("coach_id", coachIds)
          .gte("assessed_at", mondayIso),
      ]);

      const everSubmitted = new Set<string>(
        (allRatingsRes.data ?? []).map(
          (r) => (r as { coach_id: string }).coach_id,
        ),
      );
      const weekSubmitted = new Set<string>(
        (weekRatingsRes.data ?? []).map(
          (r) => (r as { coach_id: string }).coach_id,
        ),
      );

      for (const id of everSubmitted) {
        if (!weekSubmitted.has(id)) coachesUnsubmittedCount += 1;
      }
    }

    return {
      templatesWithoutSkillsCount,
      childrenPendingCount,
      coachesUnsubmittedCount,
      newTemplatesThisWeekCount,
    };
  } catch (err) {
    console.error("getAssessmentsStatusPulse error:", err);
    return {
      templatesWithoutSkillsCount: 0,
      childrenPendingCount: 0,
      coachesUnsubmittedCount: 0,
      newTemplatesThisWeekCount: 0,
    };
  }
}
