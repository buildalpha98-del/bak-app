"use server";

// ============================================================
// Performance — status pulse server action
// ============================================================
//
// Powers the inline pulse strip above the team performance summary
// cards. Four counts that tell Abdul (and Owner) where to look first:
//
//   1. Underperforming coaches  — overall_score < 60 in the period.
//   2. Top performers           — overall_score >= 80 in the period.
//   3. Zero feedback this period — active coaches with snapshots but
//      `feedback_rating.count === 0`. Highlights coaches who haven't
//      yet earned a centre rating in the window.
//   4. New badges earned        — `coach_badges.earned_at` within the
//      period. The performance cron does the awarding; this is a
//      pure read.
//
// Implementation mirrors the existing pulse actions:
//   - All five Supabase calls fan out in parallel.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - `head: true` for the badge count to keep the wire payload tight.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  normaliseMetrics,
  calculateOverallScore,
} from "@/lib/utils/performance/calculate";
import type { CoachMetrics, CoachPerformanceSnapshot } from "@/lib/types/database";

export interface PerformanceStatusPulse {
  underperformingCount: number;
  topPerformerCount: number;
  zeroFeedbackCount: number;
  newBadgesCount: number;
}

const UNDERPERFORMING_THRESHOLD = 60;
const TOP_PERFORMER_THRESHOLD = 80;

/**
 * Returns the four pulse counts for the performance page over the given
 * window. Falls back to all-zeros on any thrown error.
 */
export async function getPerformanceStatusPulse(
  periodStart: string,
  periodEnd: string,
): Promise<PerformanceStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // (1) Active coaches — denominator for every count except badges.
    const { data: activeCoaches } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "coach")
      .eq("status", "active");

    const coachIds = (activeCoaches ?? []).map((c: { id: string }) => c.id);

    if (coachIds.length === 0) {
      return {
        underperformingCount: 0,
        topPerformerCount: 0,
        zeroFeedbackCount: 0,
        newBadgesCount: 0,
      };
    }

    // (2) + (3): snapshots for the period (newest first so dedup keeps
    // the latest), and badges earned within the window.
    const [snapshotsRes, badgesRes] = await Promise.all([
      supabase
        .from("coach_performance_snapshots")
        .select("coach_id, overall_score, metrics_json, created_at")
        .in("coach_id", coachIds)
        .gte("period_start", periodStart)
        .lte("period_end", periodEnd)
        .order("created_at", { ascending: false }),
      supabase
        .from("coach_badges")
        .select("id", { count: "exact", head: true })
        .in("coach_id", coachIds)
        .gte("earned_at", periodStart)
        .lte("earned_at", `${periodEnd}T23:59:59.999Z`),
    ]);

    // Deduplicate to one (latest) snapshot per coach.
    const seen = new Set<string>();
    type SnapRow = Pick<
      CoachPerformanceSnapshot,
      "coach_id" | "overall_score" | "metrics_json"
    >;
    const latestByCoach: SnapRow[] = [];
    for (const row of (snapshotsRes.data ?? []) as SnapRow[]) {
      if (seen.has(row.coach_id)) continue;
      seen.add(row.coach_id);
      latestByCoach.push(row);
    }

    let underperformingCount = 0;
    let topPerformerCount = 0;
    let zeroFeedbackCount = 0;

    for (const snap of latestByCoach) {
      const metrics = snap.metrics_json as CoachMetrics;
      const score =
        snap.overall_score ??
        calculateOverallScore(normaliseMetrics(metrics));

      if (score < UNDERPERFORMING_THRESHOLD) underperformingCount += 1;
      if (score >= TOP_PERFORMER_THRESHOLD) topPerformerCount += 1;

      // Zero feedback in the period — `feedback_rating.count` is per
      // snapshot, so this is a window-scoped signal not a lifetime one.
      const feedbackCount = metrics?.feedback_rating?.count ?? 0;
      if (feedbackCount === 0) zeroFeedbackCount += 1;
    }

    const newBadgesCount = badgesRes.count ?? 0;

    return {
      underperformingCount,
      topPerformerCount,
      zeroFeedbackCount,
      newBadgesCount,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("getPerformanceStatusPulse error:", err);
    return {
      underperformingCount: 0,
      topPerformerCount: 0,
      zeroFeedbackCount: 0,
      newBadgesCount: 0,
    };
  }
}

// ============================================================
// Performance pulse — compare variant
// ============================================================
//
// Performance is already period-scoped (the action takes
// `periodStart`/`periodEnd`), so the compare variant just calls the
// underlying action twice — once for the current window, once for
// the prior one. Caller supplies the prior bounds; we don't try to
// infer them from term metadata here because `getTeamPerformanceData`
// already mirrors a prior-period pattern and we don't want two
// different "what is the prior period" definitions in the codebase.

export async function getPerformanceStatusPulseWithCompare(
  currentStart: string,
  currentEnd: string,
  priorStart: string,
  priorEnd: string,
  priorLabel: string
): Promise<{
  current: PerformanceStatusPulse;
  previous: PerformanceStatusPulse;
  compareLabel: string;
}> {
  const [current, previous] = await Promise.all([
    getPerformanceStatusPulse(currentStart, currentEnd),
    getPerformanceStatusPulse(priorStart, priorEnd),
  ]);
  return { current, previous, compareLabel: priorLabel };
}
