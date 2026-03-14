"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CoachMetrics, CoachPerformanceSnapshot } from "@/lib/types/database";
import { normaliseMetrics } from "./calculate";

/**
 * Get a coach's current performance with previous period comparison.
 */
export async function getCoachPerformance(
  coachId: string,
  periodStart: string,
  periodEnd: string
): Promise<{
  current: CoachPerformanceSnapshot | null;
  previous: CoachPerformanceSnapshot | null;
  normalised: Record<string, number> | null;
}> {
  const supabase = await createSupabaseServerClient();

  // Current period snapshot
  const { data: current } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Previous period (same length)
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - diffDays);

  const { data: previous } = await supabase
    .from("coach_performance_snapshots")
    .select("*")
    .eq("coach_id", coachId)
    .gte("period_start", prevStart.toISOString().split("T")[0])
    .lte("period_end", prevEnd.toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const normalised = current
    ? normaliseMetrics(current.metrics_json as CoachMetrics)
    : null;

  return {
    current: current as CoachPerformanceSnapshot | null,
    previous: previous as CoachPerformanceSnapshot | null,
    normalised,
  };
}

/**
 * Get team ranking for a specific metric.
 */
export async function getTeamRanking(
  metric: keyof CoachMetrics,
  periodStart: string,
  periodEnd: string
): Promise<{ coachId: string; value: number; name: string }[]> {
  const supabase = await createSupabaseServerClient();

  const { data: snapshots } = await supabase
    .from("coach_performance_snapshots")
    .select("coach_id, metrics_json, profiles!inner(name)")
    .gte("period_start", periodStart)
    .lte("period_end", periodEnd)
    .order("created_at", { ascending: false });

  if (!snapshots) return [];

  // Deduplicate by coach (take latest snapshot)
  const seen = new Set<string>();
  const unique = snapshots.filter((s) => {
    if (seen.has(s.coach_id)) return false;
    seen.add(s.coach_id);
    return true;
  });

  const ranked = unique
    .map((s) => {
      const metrics = s.metrics_json as unknown as CoachMetrics;
      const metricData = metrics[metric];
      const value = extractMetricValue(metric, metricData);
      const profile = s.profiles as unknown as { name: string };
      return { coachId: s.coach_id, value, name: profile?.name ?? "Unknown" };
    })
    .sort((a, b) => b.value - a.value);

  return ranked;
}

/**
 * Get what percentile a coach is in for a given metric.
 */
export async function getCoachPercentile(
  coachId: string,
  metric: keyof CoachMetrics,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  const ranking = await getTeamRanking(metric, periodStart, periodEnd);
  if (ranking.length === 0) return 0;

  const idx = ranking.findIndex((r) => r.coachId === coachId);
  if (idx === -1) return 0;

  // Percentile: percentage of coaches this coach is better than
  return Math.round(((ranking.length - idx) / ranking.length) * 100);
}

/** Extract a single numeric value from a metric object for ranking. */
function extractMetricValue(
  metric: keyof CoachMetrics,
  data: unknown
): number {
  if (!data || typeof data !== "object") return 0;
  const d = data as Record<string, unknown>;
  switch (metric) {
    case "session_volume":
      return (d.count as number) ?? 0;
    case "feedback_rating":
      return (d.average as number) ?? 0;
    case "attendance_consistency":
      return (d.average_per_session as number) ?? 0;
    case "form_completion":
      return (d.rate as number) ?? 0;
    case "punctuality":
      return 100 - ((d.average_minutes as number) ?? 0) * 10;
    case "shift_reliability":
      return (d.rate as number) ?? 0;
    case "assessment_thoroughness":
      return (d.std_dev as number) ?? 0;
    case "equipment_responsibility":
      return 100 - ((d.issue_rate as number) ?? 0) * 20;
    default:
      return 0;
  }
}
