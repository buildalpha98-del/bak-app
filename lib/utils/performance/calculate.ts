"use server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CoachMetrics } from "@/lib/types/database";

// ============================================================
// Metric weights — must sum to 1.0
// ============================================================
export const METRIC_WEIGHTS = {
  session_volume: 0.10,
  feedback_rating: 0.20,
  attendance_consistency: 0.10,
  form_completion: 0.15,
  punctuality: 0.15,
  shift_reliability: 0.20,
  assessment_thoroughness: 0.05,
  equipment_responsibility: 0.05,
} as const;

// ============================================================
// Pure helpers (exported for unit tests)
// ============================================================

/**
 * Normalise each CoachMetrics field to a 0–100 value.
 * Scores are clamped between 0 and 100.
 */
export function normaliseMetrics(metrics: CoachMetrics): Record<string, number> {
  const { session_volume, feedback_rating, attendance_consistency, form_completion,
    punctuality, shift_reliability, assessment_thoroughness, equipment_responsibility } = metrics;

  return {
    session_volume: Math.min(session_volume.count / 20 * 100, 100),
    feedback_rating: (feedback_rating.average / 5) * 100,
    attendance_consistency: Math.min(attendance_consistency.average_per_session / 15 * 100, 100),
    form_completion: form_completion.rate,
    punctuality: Math.max(100 - punctuality.average_minutes * 10, 0),
    shift_reliability: shift_reliability.rate,
    assessment_thoroughness: assessment_thoroughness.flagged
      ? 40
      : Math.min(assessment_thoroughness.std_dev / 1.5 * 100, 100),
    equipment_responsibility: Math.max(100 - equipment_responsibility.issue_rate * 20, 0),
  };
}

/**
 * Apply METRIC_WEIGHTS to a normalised metrics map and return a weighted sum.
 */
export function calculateOverallScore(normalised: Record<string, number>): number {
  return (
    (normalised.session_volume ?? 0) * METRIC_WEIGHTS.session_volume +
    (normalised.feedback_rating ?? 0) * METRIC_WEIGHTS.feedback_rating +
    (normalised.attendance_consistency ?? 0) * METRIC_WEIGHTS.attendance_consistency +
    (normalised.form_completion ?? 0) * METRIC_WEIGHTS.form_completion +
    (normalised.punctuality ?? 0) * METRIC_WEIGHTS.punctuality +
    (normalised.shift_reliability ?? 0) * METRIC_WEIGHTS.shift_reliability +
    (normalised.assessment_thoroughness ?? 0) * METRIC_WEIGHTS.assessment_thoroughness +
    (normalised.equipment_responsibility ?? 0) * METRIC_WEIGHTS.equipment_responsibility
  );
}

// ============================================================
// Internal helpers
// ============================================================

/** Return a ISO date string for the previous period of equal length. */
function previousPeriod(periodStart: string, periodEnd: string): { start: string; end: string } {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const lengthMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1); // day before current period starts
  const prevStart = new Date(prevEnd.getTime() - lengthMs);
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

/** Compute sample standard deviation of an array of numbers. Returns 0 for empty/single arrays. */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Midpoint date string (YYYY-MM-DD) of a period, used for splitting halves. */
function midDate(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  return new Date((start + end) / 2).toISOString().slice(0, 10);
}

// ============================================================
// Main calculation function
// ============================================================

export async function calculateCoachPerformance(
  coachId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ metrics: CoachMetrics; overall_score: number }> {
  const supabase = createSupabaseAdmin();
  const prev = previousPeriod(periodStart, periodEnd);

  // ── 1. Fetch completed sessions in current period ────────────────────────
  const { data: currentSessions } = await supabase
    .from("sessions")
    .select("id, date, time, started_at, headcount")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const completedSessions = currentSessions ?? [];
  const completedSessionIds = completedSessions.map((s) => s.id);

  // ── 2. Previous period session count (for session_volume trend) ──────────
  const { count: prevSessionCount } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .gte("date", prev.start)
    .lte("date", prev.end);

  const currentCount = completedSessions.length;
  const prevCount = prevSessionCount ?? 0;

  // ── 3. Feedback rating (current + previous + team average) ───────────────
  // Join feedback_ratings through session ids
  const { data: currentFeedback } = completedSessionIds.length > 0
    ? await supabase
        .from("feedback_ratings")
        .select("rating")
        .in("session_id", completedSessionIds)
        .not("rating", "is", null)
    : { data: [] };

  const feedbackValues = (currentFeedback ?? []).map((f) => f.rating as number);
  const feedbackAvg = feedbackValues.length > 0
    ? feedbackValues.reduce((a, b) => a + b, 0) / feedbackValues.length
    : 0;

  // Previous period feedback
  const { data: prevSessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("coach_id", coachId)
    .eq("status", "completed")
    .gte("date", prev.start)
    .lte("date", prev.end);

  const prevSessionIds = (prevSessions ?? []).map((s) => s.id);

  const { data: prevFeedback } = prevSessionIds.length > 0
    ? await supabase
        .from("feedback_ratings")
        .select("rating")
        .in("session_id", prevSessionIds)
        .not("rating", "is", null)
    : { data: [] };

  const prevFeedbackValues = (prevFeedback ?? []).map((f) => f.rating as number);
  const prevFeedbackAvg = prevFeedbackValues.length > 0
    ? prevFeedbackValues.reduce((a, b) => a + b, 0) / prevFeedbackValues.length
    : 0;

  // Team average: all feedback for sessions by any coach in this period
  const { data: allPeriodSessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("status", "completed")
    .gte("date", periodStart)
    .lte("date", periodEnd);

  const allPeriodSessionIds = (allPeriodSessions ?? []).map((s) => s.id);

  const { data: teamFeedback } = allPeriodSessionIds.length > 0
    ? await supabase
        .from("feedback_ratings")
        .select("rating")
        .in("session_id", allPeriodSessionIds)
        .not("rating", "is", null)
    : { data: [] };

  const teamFeedbackValues = (teamFeedback ?? []).map((f) => f.rating as number);
  const teamFeedbackAvg = teamFeedbackValues.length > 0
    ? teamFeedbackValues.reduce((a, b) => a + b, 0) / teamFeedbackValues.length
    : 0;

  // ── 4. Attendance consistency ────────────────────────────────────────────
  // Named attendance counts per session; fall back to session.headcount
  const { data: attendanceRows } = completedSessionIds.length > 0
    ? await supabase
        .from("session_attendances")
        .select("session_id, present")
        .in("session_id", completedSessionIds)
        .eq("present", true)
    : { data: [] };

  // Build count per session from named attendance
  const attendanceBySession: Record<string, number> = {};
  for (const row of attendanceRows ?? []) {
    attendanceBySession[row.session_id] = (attendanceBySession[row.session_id] ?? 0) + 1;
  }

  // Resolve per-session count: named attendance → headcount fallback
  const sessionAttendanceCounts = completedSessions.map((s) => {
    if (attendanceBySession[s.id] !== undefined) return attendanceBySession[s.id];
    return s.headcount ?? 0;
  });

  const avgAttendancePerSession = sessionAttendanceCounts.length > 0
    ? sessionAttendanceCounts.reduce((a, b) => a + b, 0) / sessionAttendanceCounts.length
    : 0;

  // Trend: split period in half and compare averages
  const mid = midDate(periodStart, periodEnd);
  const firstHalf = completedSessions
    .filter((s) => s.date <= mid)
    .map((s) => attendanceBySession[s.id] ?? s.headcount ?? 0);
  const secondHalf = completedSessions
    .filter((s) => s.date > mid)
    .map((s) => attendanceBySession[s.id] ?? s.headcount ?? 0);

  const firstHalfAvg = firstHalf.length > 0
    ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    : 0;
  const secondHalfAvg = secondHalf.length > 0
    ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    : 0;

  let attendanceTrend: "growing" | "stable" | "declining" = "stable";
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const diff = secondHalfAvg - firstHalfAvg;
    if (diff > 1) attendanceTrend = "growing";
    else if (diff < -1) attendanceTrend = "declining";
  }

  // ── 5. Form completion ───────────────────────────────────────────────────
  const expectedForms = currentCount * 2;
  const { count: actualForms } = completedSessionIds.length > 0
    ? await supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("submitted_by", coachId)
        .in("session_id", completedSessionIds)
    : { count: 0 };

  const formActual = actualForms ?? 0;
  const formRate = expectedForms === 0 ? 100 : Math.min((formActual / expectedForms) * 100, 100);

  // ── 6. Punctuality ───────────────────────────────────────────────────────
  // For sessions with started_at, compare to scheduled time (date + time)
  const sessionsWithStartedAt = completedSessions.filter((s) => s.started_at);
  const lateThresholdMinutes = 5;
  let totalLateMinutes = 0;
  let lateCount = 0;
  const trackedCount = sessionsWithStartedAt.length;

  for (const s of sessionsWithStartedAt) {
    const scheduled = new Date(`${s.date}T${s.time}`);
    const actual = new Date(s.started_at as string);
    const diffMinutes = (actual.getTime() - scheduled.getTime()) / 60000;
    // Negative means early — count as 0
    const lateMinutes = Math.max(diffMinutes, 0);
    totalLateMinutes += lateMinutes;
    if (diffMinutes > lateThresholdMinutes) lateCount++;
  }

  const avgMinutesLate = trackedCount > 0 ? totalLateMinutes / trackedCount : 0;

  // ── 7. Shift reliability ─────────────────────────────────────────────────
  const { count: cancellationCount } = await supabase
    .from("rerostering_events")
    .select("id", { count: "exact", head: true })
    .eq("original_coach_id", coachId)
    .gte("created_at", `${periodStart}T00:00:00`)
    .lte("created_at", `${periodEnd}T23:59:59`);

  const cancellations = cancellationCount ?? 0;
  const reliabilityTotal = currentCount + cancellations;
  const reliabilityRate = reliabilityTotal === 0 ? 100 : (currentCount / reliabilityTotal) * 100;

  // ── 8. Assessment thoroughness ───────────────────────────────────────────
  const { data: skillRatingsRows } = await supabase
    .from("skill_ratings")
    .select("ratings_json")
    .eq("coach_id", coachId);

  const allRatingValues: number[] = [];
  for (const row of skillRatingsRows ?? []) {
    const entries = row.ratings_json as Array<{ skill_name: string; rating: number }>;
    for (const entry of entries ?? []) {
      if (typeof entry.rating === "number") allRatingValues.push(entry.rating);
    }
  }

  const assessmentStdDev = stdDev(allRatingValues);
  const assessmentAvg = allRatingValues.length > 0
    ? allRatingValues.reduce((a, b) => a + b, 0) / allRatingValues.length
    : 0;
  const assessmentFlagged = allRatingValues.length > 0 && assessmentStdDev < 0.5;

  // ── 9. Equipment responsibility ──────────────────────────────────────────
  const { count: equipmentIssues } = await supabase
    .from("equipment_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", coachId)
    .eq("action", "issue_flagged")
    .gte("created_at", `${periodStart}T00:00:00`)
    .lte("created_at", `${periodEnd}T23:59:59`);

  const { count: equipmentCheckins } = await supabase
    .from("equipment_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", coachId)
    .eq("action", "check_in")
    .gte("created_at", `${periodStart}T00:00:00`)
    .lte("created_at", `${periodEnd}T23:59:59`);

  const issues = equipmentIssues ?? 0;
  const checkins = equipmentCheckins ?? 0;
  const issueRate = checkins === 0 ? 0 : (issues / checkins) * 100;

  // ── Assemble metrics ─────────────────────────────────────────────────────
  const metrics: CoachMetrics = {
    session_volume: {
      count: currentCount,
      trend: prevCount === 0 ? 0 : (currentCount - prevCount) / Math.max(prevCount, 1),
      previous_count: prevCount,
    },
    feedback_rating: {
      average: feedbackAvg,
      team_average: teamFeedbackAvg,
      trend: feedbackAvg - prevFeedbackAvg,
      count: feedbackValues.length,
    },
    attendance_consistency: {
      average_per_session: avgAttendancePerSession,
      trend: attendanceTrend,
    },
    form_completion: {
      rate: formRate,
      expected: expectedForms,
      actual: formActual,
    },
    punctuality: {
      average_minutes: avgMinutesLate,
      late_count: lateCount,
      total_tracked: trackedCount,
    },
    shift_reliability: {
      rate: reliabilityRate,
      completed: currentCount,
      total: reliabilityTotal,
      cancellations,
    },
    assessment_thoroughness: {
      std_dev: assessmentStdDev,
      avg_rating: assessmentAvg,
      total_ratings: allRatingValues.length,
      flagged: assessmentFlagged,
    },
    equipment_responsibility: {
      issue_rate: issueRate,
      issues,
      checkins,
    },
  };

  const normalised = normaliseMetrics(metrics);
  const overall_score = calculateOverallScore(normalised);

  return { metrics, overall_score };
}

// ============================================================
// Team benchmarks
// ============================================================

export async function calculateTeamBenchmarks(
  periodStart: string,
  periodEnd: string
): Promise<{ averages: Record<string, number>; coachCount: number }> {
  const supabase = createSupabaseAdmin();

  const { data: coaches } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "coach")
    .eq("status", "active");

  const activeCoaches = coaches ?? [];

  if (activeCoaches.length === 0) {
    return {
      averages: {
        session_volume: 0,
        feedback_rating: 0,
        attendance_consistency: 0,
        form_completion: 0,
        punctuality: 0,
        shift_reliability: 0,
        assessment_thoroughness: 0,
        equipment_responsibility: 0,
        overall_score: 0,
      },
      coachCount: 0,
    };
  }

  // Calculate performance for all coaches in parallel
  const results = await Promise.allSettled(
    activeCoaches.map((coach) =>
      calculateCoachPerformance(coach.id, periodStart, periodEnd)
    )
  );

  // Collect only fulfilled results
  const successful = results
    .filter((r): r is PromiseFulfilledResult<{ metrics: CoachMetrics; overall_score: number }> =>
      r.status === "fulfilled"
    )
    .map((r) => r.value);

  if (successful.length === 0) {
    return {
      averages: {
        session_volume: 0,
        feedback_rating: 0,
        attendance_consistency: 0,
        form_completion: 0,
        punctuality: 0,
        shift_reliability: 0,
        assessment_thoroughness: 0,
        equipment_responsibility: 0,
        overall_score: 0,
      },
      coachCount: 0,
    };
  }

  // Sum normalised values across all coaches
  const metricKeys = Object.keys(METRIC_WEIGHTS) as Array<keyof typeof METRIC_WEIGHTS>;
  const sums: Record<string, number> = {
    ...Object.fromEntries(metricKeys.map((k) => [k, 0])),
    overall_score: 0,
  };

  for (const { metrics, overall_score } of successful) {
    const normalised = normaliseMetrics(metrics);
    for (const key of metricKeys) {
      sums[key] += normalised[key] ?? 0;
    }
    sums.overall_score += overall_score;
  }

  const count = successful.length;
  const averages: Record<string, number> = {};
  for (const key of [...metricKeys, "overall_score"]) {
    averages[key] = sums[key] / count;
  }

  return { averages, coachCount: count };
}
