"use server";

// ============================================================
// Roster status pulse — counts powering the inline pulse strip
// ============================================================
//
// Cheap counts, computed in parallel. Mirrors the centres status pulse
// shape (a handful of `count: 'exact', head: true` queries) scoped to
// the active week. The projected-wage figure is gated by
// `getFinancialAccess` and returns null when the viewer can't see
// financials — letting the pulse strip hide that cell entirely rather
// than show a confusing "—" or zero.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFinancialAccess } from "@/lib/auth/financial-access";
import { getWeekCostProjection } from "@/lib/roster/cost-actions";

export interface RosterStatusPulse {
  /** Sessions in the week with `status='draft'`. */
  draftsCount: number;
  /**
   * Sessions in the week that aren't cancelled and have NO primary
   * coach assigned (sessions.coach_id IS NULL — the trigger keeps this
   * column in sync with session_coaches).
   */
  unassignedCount: number;
  /**
   * 0–100 — assigned-non-cancelled / non-cancelled, rounded to a whole
   * percent. When there are no non-cancelled sessions in the week the
   * coverage is 100 (a clean board is "complete", not "broken").
   */
  coveragePercent: number;
  /**
   * Wage projection for the week in AUD. `null` when the viewer lacks
   * financial_access OR when the projection failed for any reason —
   * the caller treats both as "hide the cell".
   */
  projectedWage: number | null;
}

/**
 * Compute the four headline counts for the roster pulse strip.
 *
 * The week range is Monday → Friday inclusive (5 days) — matches the
 * staff/calendar view's working-week scope. Cancelled sessions are
 * excluded from both the unassigned and coverage maths so a cleanly
 * cancelled shift doesn't inflate "needs attention" signals.
 */
export async function getRosterStatusPulse(
  weekStart: string,
): Promise<RosterStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // Mon → Fri inclusive (matches StaffRosterView / SessionCalendarView).
    const monday = new Date(weekStart + "T00:00:00");
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekEndDate = friday.toISOString().split("T")[0];

    // Fan out the cheap counts. Each is `head: true` so no row data
    // crosses the wire — just the count.
    const [draftsRes, unassignedRes, nonCancelledRes, hasFinancial] =
      await Promise.all([
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .gte("date", weekStart)
          .lte("date", weekEndDate)
          .eq("status", "draft"),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .gte("date", weekStart)
          .lte("date", weekEndDate)
          .is("coach_id", null)
          .neq("status", "cancelled"),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .gte("date", weekStart)
          .lte("date", weekEndDate)
          .neq("status", "cancelled"),
        getFinancialAccess(),
      ]);

    const draftsCount = draftsRes.count ?? 0;
    const unassignedCount = unassignedRes.count ?? 0;
    const nonCancelledCount = nonCancelledRes.count ?? 0;

    // Coverage = (non-cancelled with a primary coach) / (non-cancelled).
    // When the denominator is zero we report 100 — a calm board is a
    // covered board, not a broken one.
    const assignedCount = Math.max(0, nonCancelledCount - unassignedCount);
    const coveragePercent =
      nonCancelledCount === 0
        ? 100
        : Math.round((assignedCount / nonCancelledCount) * 100);

    // Wage projection — only fetched when the viewer can see it. The
    // projection action ALSO gates internally (returns null data when
    // financial_access is false), but checking here saves an unneeded
    // round-trip and keeps the response shape predictable.
    let projectedWage: number | null = null;
    if (hasFinancial) {
      // 5-day projection — keeps the headline number aligned with the
      // pulse's Mon–Fri scope. The WeekCostChip still calls the 7-day
      // default for its detailed tooltip; this is the inline summary.
      const { data: cost } = await getWeekCostProjection(weekStart, 5);
      if (cost) projectedWage = cost.totalCost;
    }

    return {
      draftsCount,
      unassignedCount,
      coveragePercent,
      projectedWage,
    };
  } catch (err) {
    console.error("getRosterStatusPulse error:", err);
    return {
      draftsCount: 0,
      unassignedCount: 0,
      coveragePercent: 100,
      projectedWage: null,
    };
  }
}

// ============================================================
// getLatestSchedulingRunForWeek — powers the "Last AI run" pill
// ============================================================
//
// Returns the most recent scheduling_runs row whose week_start matches
// the active week. Returns null when no run has ever been generated
// for that week so the pill caller can hide itself.

export interface LatestSchedulingRun {
  runId: string;
  createdAt: string; // matches `generated_at` column
  publishedAt: string | null;
}

export async function getLatestSchedulingRunForWeek(
  weekStart: string,
): Promise<LatestSchedulingRun | null> {
  try {
    const supabase = await createSupabaseServerClient();
    // Mon → Fri inclusive — same window as the rest of the pulse maths.
    // `scheduling_runs` stores `week_start` as the Monday so a simple
    // equality match is enough; no need to range-scan.
    const { data, error } = await supabase
      .from("scheduling_runs")
      .select("id, generated_at, published_at")
      .eq("week_start", weekStart)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      runId: data.id as string,
      createdAt: data.generated_at as string,
      publishedAt: (data.published_at as string | null) ?? null,
    };
  } catch (err) {
    console.error("getLatestSchedulingRunForWeek error:", err);
    return null;
  }
}
