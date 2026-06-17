"use server";

// ============================================================
// Analytics (revenue forecasts) — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/analytics. Four
// counts surface "what to look at first":
//
//   1. Forecast stale         — 1 if the latest forecast_date is
//      older than 7 days, 0 otherwise. Reminds the admin to
//      regenerate before quarterly reviews.
//   2. Forecast vs actuals    — months in the current quarter where
//      committed_revenue overshot the prior-month forecast by 10%+
//      (positive variance = good news worth noting).
//   3. Negative-margin months — count of months in the next 6 where
//      `projected_profit < 0`. Loss-warning signal.
//   4. Months ahead generated — number of monthly forecasts in the
//      latest run. Coverage signal — high is "you have visibility".

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AnalyticsStatusPulse {
  forecastStaleDays: number;
  forecastIsStale: boolean;
  overperformingMonthsCount: number;
  negativeMarginMonthsCount: number;
  monthsAheadGenerated: number;
}

export async function getAnalyticsStatusPulse(): Promise<AnalyticsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: latest } = await supabase
      .from("revenue_forecasts")
      .select("forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      return {
        forecastStaleDays: 0,
        forecastIsStale: false,
        overperformingMonthsCount: 0,
        negativeMarginMonthsCount: 0,
        monthsAheadGenerated: 0,
      };
    }

    const latestDate = new Date(latest.forecast_date);
    const today = new Date();
    const daysSince = Math.floor(
      (today.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const forecastIsStale = daysSince >= 7;

    // Monthly forecasts from the latest run
    const { data: monthlyForecasts } = await supabase
      .from("revenue_forecasts")
      .select(
        "period_start, total_projected_revenue, committed_revenue, projected_profit",
      )
      .eq("forecast_date", latest.forecast_date)
      .eq("period_type", "monthly")
      .order("period_start", { ascending: true });

    const monthly = monthlyForecasts ?? [];
    const monthsAheadGenerated = monthly.length;

    const negativeMarginMonthsCount = monthly.filter(
      (m) => Number(m.projected_profit ?? 0) < 0,
    ).length;

    const overperformingMonthsCount = monthly.filter(
      (m) =>
        Number(m.committed_revenue ?? 0) >
        Number(m.total_projected_revenue ?? 0) * 1.1,
    ).length;

    return {
      forecastStaleDays: daysSince,
      forecastIsStale,
      overperformingMonthsCount,
      negativeMarginMonthsCount,
      monthsAheadGenerated,
    };
  } catch (err) {
    console.error("getAnalyticsStatusPulse error:", err);
    return {
      forecastStaleDays: 0,
      forecastIsStale: false,
      overperformingMonthsCount: 0,
      negativeMarginMonthsCount: 0,
      monthsAheadGenerated: 0,
    };
  }
}
