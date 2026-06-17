"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CoachMetrics, CoachPerformanceSnapshot, CoachBadge } from "@/lib/types/database";
import { normaliseMetrics, calculateOverallScore, METRIC_WEIGHTS } from "@/lib/utils/performance/calculate";
import { getCoachBadges, BADGE_DEFINITIONS, type BadgeKey } from "@/lib/utils/performance/badges";

// ============================================================
// Team performance row type — shared with the view component so
// the leaderboard / table both render the same shape.
// ============================================================

export interface TeamPerformanceCoach {
  id: string;
  name: string;
  photo_url: string | null;
  overall_score: number;
  metrics: CoachMetrics;
  normalised: Record<string, number>;
  badge_count: number;
  /**
   * The 3 most-recently-earned badges (by `earned_at` desc). Used by
   * the leaderboard card grid + the new per-row chip group.
   */
  badges: Array<{ key: string; earned_at: string }>;
  /**
   * Score from the immediately-preceding period of the same length.
   * `null` when the prior period has no snapshot for this coach (new
   * coach, or first period of cron coverage). The view renders
   * `prior_overall_score - overall_score` as the trend delta.
   */
  prior_overall_score: number | null;
  /** Region label — derived from `profiles.region_ids[0]` if set. */
  region_id: string | null;
  region_name: string | null;
}

export interface TeamPerformanceData {
  coaches: TeamPerformanceCoach[];
  averages: Record<string, number>;
}

// ============================================================
// Internal helpers
// ============================================================

/** Compute the ISO date string (YYYY-MM-DD) for the start of the current calendar month. */
function currentMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

/** Compute the ISO date string (YYYY-MM-DD) for the end of the current calendar month. */
function currentMonthEnd(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** Compute the ISO date string (YYYY-MM-DD) for the start of the previous calendar month. */
function previousMonthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
}

/** Compute the ISO date string (YYYY-MM-DD) for the end of the previous calendar month. */
function previousMonthEnd(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
}

/** Average an array of numbers; returns 0 for empty arrays. */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Average a named key from an array of normalised metric maps. */
function teamAverageForKey(
  normalisedMaps: Record<string, number>[],
  key: string
): number {
  return average(normalisedMaps.map((m) => m[key] ?? 0));
}

// ============================================================
// 1. getTeamPerformanceData
// ============================================================

/**
 * Returns all coach metrics for the team performance page.
 * Pulls the latest snapshot for each active coach within the given period,
 * joins with profiles for name/photo, computes normalised values and team averages,
 * then sorts coaches by overall_score descending.
 */
export async function getTeamPerformanceData(
  periodStart: string,
  periodEnd: string
): Promise<TeamPerformanceData> {
  const supabase = await createSupabaseServerClient();

  // Fetch all active coach profiles (region_ids cast through a
  // record-shape because the typed Profile interface doesn't include
  // region_ids yet — same pattern used in lib/staff/actions.ts).
  const { data: activeCoachesRaw } = await supabase
    .from("profiles")
    .select("id, name, photo_url, region_ids")
    .eq("role", "coach")
    .eq("status", "active");

  if (!activeCoachesRaw || activeCoachesRaw.length === 0) {
    return { coaches: [], averages: {} };
  }

  const activeCoaches = activeCoachesRaw.map((c) => {
    const regionIds = ((c as Record<string, unknown>).region_ids ?? null) as
      | string[]
      | null;
    return {
      id: c.id as string,
      name: c.name as string,
      photo_url: (c.photo_url as string | null) ?? null,
      region_id:
        Array.isArray(regionIds) && regionIds.length > 0 ? regionIds[0] : null,
    };
  });

  const coachIds = activeCoaches.map((c) => c.id);

  // Prior period — same length, immediately preceding. e.g. picking
  // 1–17 May 2026 makes the prior window 14–30 April 2026. We compute
  // it here so the view doesn't have to know about it.
  const { priorStart, priorEnd } = computePriorPeriod(periodStart, periodEnd);

  // Fan out: current snapshots, prior snapshots, badges, regions.
  const [
    snapshotsRes,
    priorSnapshotsRes,
    badgeRowsRes,
    regionsRes,
  ] = await Promise.all([
    supabase
      .from("coach_performance_snapshots")
      .select("*")
      .in("coach_id", coachIds)
      .gte("period_start", periodStart)
      .lte("period_end", periodEnd)
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_performance_snapshots")
      .select("coach_id, overall_score, metrics_json, created_at")
      .in("coach_id", coachIds)
      .gte("period_start", priorStart)
      .lte("period_end", priorEnd)
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_badges")
      .select("coach_id, badge_key, earned_at")
      .in("coach_id", coachIds)
      .order("earned_at", { ascending: false }),
    supabase.from("regions").select("id, name"),
  ]);

  const snapshots = snapshotsRes.data ?? [];
  const priorSnapshots = priorSnapshotsRes.data ?? [];
  const badgeRows = badgeRowsRes.data ?? [];
  const regionRows = regionsRes.data ?? [];

  const regionNameById = new Map<string, string>();
  for (const r of regionRows) {
    regionNameById.set(r.id as string, r.name as string);
  }

  // Deduplicate — keep only the latest snapshot per coach
  const seenCoachIds = new Set<string>();
  const latestByCoach = new Map<string, CoachPerformanceSnapshot>();
  for (const snapshot of snapshots) {
    if (!seenCoachIds.has(snapshot.coach_id)) {
      seenCoachIds.add(snapshot.coach_id);
      latestByCoach.set(snapshot.coach_id, snapshot as CoachPerformanceSnapshot);
    }
  }

  // Prior-period scores — same dedup logic.
  const seenPriorCoachIds = new Set<string>();
  const priorScoreByCoach = new Map<string, number>();
  for (const snap of priorSnapshots) {
    if (seenPriorCoachIds.has(snap.coach_id)) continue;
    seenPriorCoachIds.add(snap.coach_id);
    const metrics = snap.metrics_json as CoachMetrics;
    const score =
      snap.overall_score ?? calculateOverallScore(normaliseMetrics(metrics));
    priorScoreByCoach.set(snap.coach_id, score);
  }

  // Badges — bucket by coach, ordered desc by earned_at (query already
  // returned them that way).
  const badgesByCoach = new Map<
    string,
    Array<{ key: string; earned_at: string }>
  >();
  const badgeCountByCoach: Record<string, number> = {};
  for (const row of badgeRows) {
    badgeCountByCoach[row.coach_id] = (badgeCountByCoach[row.coach_id] ?? 0) + 1;
    const list = badgesByCoach.get(row.coach_id) ?? [];
    list.push({ key: row.badge_key as string, earned_at: row.earned_at as string });
    badgesByCoach.set(row.coach_id, list);
  }

  // Build per-coach result entries (only include coaches with a snapshot)
  const coachEntries: TeamPerformanceCoach[] = activeCoaches
    .filter((coach) => latestByCoach.has(coach.id))
    .map((coach) => {
      const snapshot = latestByCoach.get(coach.id)!;
      const metrics = snapshot.metrics_json as CoachMetrics;
      const normalised = normaliseMetrics(metrics);
      const overall_score =
        snapshot.overall_score ?? calculateOverallScore(normalised);
      return {
        id: coach.id,
        name: coach.name,
        photo_url: coach.photo_url,
        overall_score,
        metrics,
        normalised,
        badge_count: badgeCountByCoach[coach.id] ?? 0,
        badges: (badgesByCoach.get(coach.id) ?? []).slice(0, 3),
        prior_overall_score: priorScoreByCoach.get(coach.id) ?? null,
        region_id: coach.region_id,
        region_name: coach.region_id
          ? (regionNameById.get(coach.region_id) ?? null)
          : null,
      };
    });

  // Sort by overall_score descending
  coachEntries.sort((a, b) => b.overall_score - a.overall_score);

  // Compute team averages across all metric keys + overall_score
  const metricKeys = Object.keys(METRIC_WEIGHTS) as Array<keyof typeof METRIC_WEIGHTS>;
  const allNormalised = coachEntries.map((c) => c.normalised);

  const averages: Record<string, number> = {};
  for (const key of metricKeys) {
    averages[key] = teamAverageForKey(allNormalised, key);
  }
  averages.overall_score = average(coachEntries.map((c) => c.overall_score));

  return { coaches: coachEntries, averages };
}

/**
 * Compute the immediately-preceding window of the same length. Used
 * for the trend arrow next to each coach's overall score.
 *
 * Example: picking 2026-05-01 → 2026-05-17 (17 days) returns
 * priorStart 2026-04-14, priorEnd 2026-04-30.
 */
function computePriorPeriod(
  start: string,
  end: string,
): { priorStart: string; priorEnd: string } {
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  const lengthDays =
    Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;
  const priorEndDate = new Date(startDate);
  priorEndDate.setUTCDate(priorEndDate.getUTCDate() - 1);
  const priorStartDate = new Date(priorEndDate);
  priorStartDate.setUTCDate(priorStartDate.getUTCDate() - (lengthDays - 1));
  return {
    priorStart: priorStartDate.toISOString().slice(0, 10),
    priorEnd: priorEndDate.toISOString().slice(0, 10),
  };
}

// ============================================================
// 2. getCoachPerformanceDetail
// ============================================================

/**
 * Returns detailed performance data for an individual coach, including their
 * current snapshot, historical snapshots, badges, recent sessions with feedback
 * ratings, and aggregated breakdowns by centre and sport.
 */
export async function getCoachPerformanceDetail(coachId: string): Promise<{
  coach: { id: string; name: string; photo_url: string | null };
  current: CoachPerformanceSnapshot | null;
  normalised: Record<string, number> | null;
  snapshots: CoachPerformanceSnapshot[];
  badges: CoachBadge[];
  recentSessions: Array<{
    id: string;
    date: string;
    centre_name: string;
    sport: string;
    rating: number | null;
  }>;
  centreBreakdown: Array<{ centre_name: string; avg_rating: number; session_count: number }>;
  sportBreakdown: Array<{ sport: string; avg_rating: number; session_count: number }>;
}> {
  const supabase = await createSupabaseServerClient();

  // Fetch coach profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, photo_url")
    .eq("id", coachId)
    .single();

  const coach = profile
    ? { id: profile.id, name: profile.name, photo_url: profile.photo_url ?? null }
    : { id: coachId, name: "Unknown", photo_url: null };

  // Latest snapshot (most recent regardless of period)
  const { data: latestSnapshot } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = latestSnapshot as CoachPerformanceSnapshot | null;
  const normalised = current
    ? normaliseMetrics(current.metrics_json as CoachMetrics)
    : null;

  // Historical snapshots — last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

  const { data: snapshotRows } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .gte("period_start", sixMonthsAgoStr)
    .order("period_start", { ascending: true });

  const snapshots = (snapshotRows ?? []) as CoachPerformanceSnapshot[];

  // Fetch badges
  const badges = await getCoachBadges(coachId);

  // Fetch recent 20 completed sessions with centre name and feedback rating
  const { data: recentSessionRows } = await supabase
    .from("sessions")
    .select("id, date, sport, centres!inner(name)")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .order("date", { ascending: false })
    .limit(20);

  const recentSessionIds = (recentSessionRows ?? []).map((s) => s.id);

  // Fetch feedback ratings for those sessions
  const { data: feedbackRows } = recentSessionIds.length > 0
    ? await supabase
        .from("feedback_ratings")
        .select("session_id, rating")
        .in("session_id", recentSessionIds)
    : { data: [] };

  const ratingBySessionId: Record<string, number | null> = {};
  for (const row of feedbackRows ?? []) {
    ratingBySessionId[row.session_id] = row.rating;
  }

  const recentSessions = (recentSessionRows ?? []).map((s) => {
    const centre = s.centres as unknown as { name: string };
    return {
      id: s.id,
      date: s.date,
      centre_name: centre?.name ?? "Unknown",
      sport: s.sport,
      rating: ratingBySessionId[s.id] ?? null,
    };
  });

  // Aggregate ratings by centre
  const centreMap = new Map<string, { total: number; count: number }>();
  for (const session of recentSessions) {
    if (!centreMap.has(session.centre_name)) {
      centreMap.set(session.centre_name, { total: 0, count: 0 });
    }
    const entry = centreMap.get(session.centre_name)!;
    entry.count += 1;
    if (session.rating !== null) {
      entry.total += session.rating;
    }
  }

  const centreBreakdown = Array.from(centreMap.entries()).map(([centre_name, { total, count }]) => ({
    centre_name,
    avg_rating: count > 0 ? total / count : 0,
    session_count: count,
  }));

  // Aggregate ratings by sport
  const sportMap = new Map<string, { total: number; count: number }>();
  for (const session of recentSessions) {
    if (!sportMap.has(session.sport)) {
      sportMap.set(session.sport, { total: 0, count: 0 });
    }
    const entry = sportMap.get(session.sport)!;
    entry.count += 1;
    if (session.rating !== null) {
      entry.total += session.rating;
    }
  }

  const sportBreakdown = Array.from(sportMap.entries()).map(([sport, { total, count }]) => ({
    sport,
    avg_rating: count > 0 ? total / count : 0,
    session_count: count,
  }));

  return {
    coach,
    current,
    normalised,
    snapshots,
    badges,
    recentSessions,
    centreBreakdown,
    sportBreakdown,
  };
}

// ============================================================
// 3. getCoachSelfPerformance
// ============================================================

/**
 * Returns performance data for the currently authenticated coach.
 * Includes own snapshot, comparison against anonymised team averages, percentile
 * ranking, badges, historical snapshots, and auto-generated highlight text.
 */
export async function getCoachSelfPerformance(): Promise<{
  coach: { id: string; name: string };
  current: CoachPerformanceSnapshot | null;
  normalised: Record<string, number> | null;
  teamAverages: Record<string, number>;
  percentiles: Record<string, number>;
  badges: CoachBadge[];
  snapshots: CoachPerformanceSnapshot[];
  highlights: Array<{ type: string; text: string }>;
}> {
  const supabase = await createSupabaseServerClient();

  // Resolve current user from session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }

  const coachId = user.id;

  // Fetch coach profile name
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("id", coachId)
    .single();

  const coach = profile
    ? { id: profile.id, name: profile.name }
    : { id: coachId, name: "You" };

  // Fetch own latest snapshot
  const { data: latestSnapshot } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = latestSnapshot as CoachPerformanceSnapshot | null;
  const normalised = current
    ? normaliseMetrics(current.metrics_json as CoachMetrics)
    : null;

  // Fetch historical snapshots — last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);

  const { data: snapshotRows } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .gte("period_start", sixMonthsAgoStr)
    .order("period_start", { ascending: true });

  const snapshots = (snapshotRows ?? []) as CoachPerformanceSnapshot[];

  // Fetch badges
  const badges = await getCoachBadges(coachId);

  // Fetch all team snapshots for the same period as the coach's latest snapshot
  // — used for anonymised benchmarking (no names returned)
  const periodStart = current?.period_start ?? currentMonthStart();
  const periodEnd = current?.period_end ?? currentMonthEnd();

  const { data: teamSnapshots } = await supabase
    .from("coach_performance_snapshots")
    .select("coach_id, metrics_json, overall_score, created_at")
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)
    .order("created_at", { ascending: false });

  // Deduplicate team snapshots — one per coach
  const seenTeamCoachIds = new Set<string>();
  const teamNormalisedMaps: Record<string, number>[] = [];
  const teamOverallScores: number[] = [];

  for (const snap of teamSnapshots ?? []) {
    if (seenTeamCoachIds.has(snap.coach_id)) continue;
    seenTeamCoachIds.add(snap.coach_id);
    const metrics = snap.metrics_json as CoachMetrics;
    const norm = normaliseMetrics(metrics);
    teamNormalisedMaps.push(norm);
    teamOverallScores.push(snap.overall_score ?? calculateOverallScore(norm));
  }

  // Compute team averages per metric + overall_score (anonymised — no names returned)
  const metricKeys = Object.keys(METRIC_WEIGHTS) as Array<keyof typeof METRIC_WEIGHTS>;
  const teamAverages: Record<string, number> = {};
  for (const key of metricKeys) {
    teamAverages[key] = teamAverageForKey(teamNormalisedMaps, key);
  }
  teamAverages.overall_score = average(teamOverallScores);

  // Compute percentile for overall_score and each individual metric
  const percentiles: Record<string, number> = {};

  if (normalised) {
    const ownOverallScore = current?.overall_score ?? calculateOverallScore(normalised);
    const coachesBelow = teamOverallScores.filter((s) => s < ownOverallScore).length;
    percentiles.overall_score =
      teamOverallScores.length > 0
        ? Math.round((coachesBelow / teamOverallScores.length) * 100)
        : 0;

    for (const key of metricKeys) {
      const ownValue = normalised[key] ?? 0;
      const teamValues = teamNormalisedMaps.map((m) => m[key] ?? 0);
      const below = teamValues.filter((v) => v < ownValue).length;
      percentiles[key] =
        teamValues.length > 0 ? Math.round((below / teamValues.length) * 100) : 0;
    }
  }

  // Generate highlights — best-rated sessions and positive feedback snippets
  const highlights: Array<{ type: string; text: string }> = [];

  if (current) {
    const metrics = current.metrics_json as CoachMetrics;

    if (metrics.feedback_rating.average >= 4.5 && metrics.feedback_rating.count >= 3) {
      highlights.push({
        type: "feedback",
        text: `Averaging ${metrics.feedback_rating.average.toFixed(1)} / 5 across ${metrics.feedback_rating.count} sessions — excellent work!`,
      });
    }

    if (metrics.shift_reliability.rate >= 100 && metrics.shift_reliability.completed >= 5) {
      highlights.push({
        type: "reliability",
        text: `Perfect reliability this period — all ${metrics.shift_reliability.completed} sessions completed.`,
      });
    }

    if (metrics.form_completion.rate >= 100) {
      highlights.push({
        type: "forms",
        text: "All session forms submitted on time this period.",
      });
    }

    if (metrics.punctuality.average_minutes < 2 && metrics.punctuality.total_tracked >= 3) {
      highlights.push({
        type: "punctuality",
        text: "Great punctuality — average start time within 2 minutes of schedule.",
      });
    }

    if (metrics.session_volume.trend > 0.1 && metrics.session_volume.count >= 5) {
      highlights.push({
        type: "growth",
        text: `Session volume up ${Math.round(metrics.session_volume.trend * 100)}% compared to the previous period.`,
      });
    }
  }

  // Add a highlight for the most recently earned badge (if any)
  if (badges.length > 0) {
    const latestBadge = badges[0]; // getCoachBadges orders by earned_at desc
    const badgeDef = BADGE_DEFINITIONS[latestBadge.badge_key as BadgeKey];
    if (badgeDef) {
      highlights.push({
        type: "badge",
        text: `You recently earned the "${badgeDef.name}" badge — ${badgeDef.description}.`,
      });
    }
  }

  return {
    coach,
    current,
    normalised,
    teamAverages,
    percentiles,
    badges,
    snapshots,
    highlights,
  };
}

// ============================================================
// 4. exportTeamPerformanceCsv
// ============================================================

/**
 * Generates a CSV export of team performance metrics for the given period.
 * Returns the CSV as a raw string suitable for download from a server action response.
 */
export async function exportTeamPerformanceCsv(
  periodStart: string,
  periodEnd: string
): Promise<string> {
  const { coaches } = await getTeamPerformanceData(periodStart, periodEnd);

  const headers = [
    "Coach Name",
    "Overall Score",
    "Sessions",
    "Avg Rating",
    "Form Completion %",
    "Punctuality",
    "Reliability %",
    "Equipment Issue Rate",
  ];

  const rows = coaches.map((coach) => {
    const m = coach.metrics;
    const punctualityScore = Math.max(100 - m.punctuality.average_minutes * 10, 0);
    return [
      `"${coach.name.replace(/"/g, '""')}"`,
      coach.overall_score.toFixed(1),
      m.session_volume.count,
      m.feedback_rating.average.toFixed(2),
      m.form_completion.rate.toFixed(1),
      punctualityScore.toFixed(1),
      m.shift_reliability.rate.toFixed(1),
      m.equipment_responsibility.issue_rate.toFixed(2),
    ];
  });

  const lines = [headers.join(","), ...rows.map((r) => r.join(","))];
  return lines.join("\n");
}

// ============================================================
// 5. getPerformanceWidgetData
// ============================================================

/**
 * Returns summarised performance data for the admin dashboard widget.
 * Includes team average score, trend vs previous month, top 3 performers,
 * and coaches whose overall_score falls below the flagged threshold of 60.
 */
export async function getPerformanceWidgetData(): Promise<{
  teamAvgScore: number;
  teamAvgTrend: number;
  topPerformers: Array<{ name: string; score: number }>;
  flaggedCoaches: Array<{ name: string; score: number }>;
}> {
  const supabase = await createSupabaseServerClient();

  const periodStart = currentMonthStart();
  const periodEnd = currentMonthEnd();
  const prevStart = previousMonthStart();
  const prevEnd = previousMonthEnd();

  // Fetch all active coach profiles for name lookup
  const { data: activeCoaches } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .eq("status", "active");

  const coachIds = (activeCoaches ?? []).map((c) => c.id);
  const coachNameById = new Map<string, string>(
    (activeCoaches ?? []).map((c) => [c.id, c.name])
  );

  if (coachIds.length === 0) {
    return { teamAvgScore: 0, teamAvgTrend: 0, topPerformers: [], flaggedCoaches: [] };
  }

  // Fetch current month snapshots for all active coaches
  const { data: currentSnapshots } = await supabase
    .from("coach_performance_snapshots")
    .select("coach_id, overall_score, metrics_json, created_at")
    .in("coach_id", coachIds)
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)
    .order("created_at", { ascending: false });

  // Deduplicate — latest snapshot per coach
  const seenCurrent = new Set<string>();
  const currentByCoach = new Map<string, { overall_score: number }>();
  for (const snap of currentSnapshots ?? []) {
    if (!seenCurrent.has(snap.coach_id)) {
      seenCurrent.add(snap.coach_id);
      const metrics = snap.metrics_json as CoachMetrics;
      const score = snap.overall_score ?? calculateOverallScore(normaliseMetrics(metrics));
      currentByCoach.set(snap.coach_id, { overall_score: score });
    }
  }

  const currentScores = Array.from(currentByCoach.values()).map((v) => v.overall_score);
  const teamAvgScore = average(currentScores);

  // Fetch previous month snapshots for trend calculation
  const { data: prevSnapshots } = await supabase
    .from("coach_performance_snapshots")
    .select("coach_id, overall_score, metrics_json, created_at")
    .in("coach_id", coachIds)
    .gte("period_start", prevStart)
    .lte("period_end", prevEnd)
    .order("created_at", { ascending: false });

  // Deduplicate previous snapshots
  const seenPrev = new Set<string>();
  const prevOverallScores: number[] = [];
  for (const snap of prevSnapshots ?? []) {
    if (!seenPrev.has(snap.coach_id)) {
      seenPrev.add(snap.coach_id);
      const metrics = snap.metrics_json as CoachMetrics;
      const score = snap.overall_score ?? calculateOverallScore(normaliseMetrics(metrics));
      prevOverallScores.push(score);
    }
  }

  const prevAvgScore = average(prevOverallScores);
  const teamAvgTrend = teamAvgScore - prevAvgScore;

  // Build ranked list of coach entries from current period
  const rankedEntries = Array.from(currentByCoach.entries())
    .map(([coachId, { overall_score }]) => ({
      name: coachNameById.get(coachId) ?? "Unknown",
      score: Math.round(overall_score * 10) / 10,
    }))
    .sort((a, b) => b.score - a.score);

  // Top 3 performers
  const topPerformers = rankedEntries.slice(0, 3);

  // Flagged coaches: overall_score below 60
  const flaggedCoaches = rankedEntries.filter((c) => c.score < 60);

  return {
    teamAvgScore: Math.round(teamAvgScore * 10) / 10,
    teamAvgTrend: Math.round(teamAvgTrend * 10) / 10,
    topPerformers,
    flaggedCoaches,
  };
}
