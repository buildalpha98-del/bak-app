"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RevenueForecast, ForecastConfig } from "@/lib/types/database";

// ============================================================
// Get latest forecasts
// ============================================================

export async function getLatestForecasts(): Promise<{
  data: { monthly: RevenueForecast[]; quarterly: RevenueForecast[] };
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get the latest forecast_date
    const { data: latest } = await supabase
      .from("revenue_forecasts")
      .select("forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(1)
      .single();

    if (!latest) return { data: { monthly: [], quarterly: [] }, error: null };

    const { data: forecasts } = await supabase
      .from("revenue_forecasts")
      .select("*")
      .eq("forecast_date", latest.forecast_date)
      .order("period_start", { ascending: true });

    const monthly = (forecasts ?? []).filter((f) => f.period_type === "monthly");
    const quarterly = (forecasts ?? []).filter((f) => f.period_type === "quarterly");

    return { data: { monthly, quarterly }, error: null };
  } catch (err) {
    console.error("getLatestForecasts error:", err);
    return { data: { monthly: [], quarterly: [] }, error: "Failed to load forecasts." };
  }
}

// ============================================================
// Get forecast history (for accuracy tracking)
// ============================================================

export async function getForecastHistory(periodType: "monthly" | "quarterly"): Promise<{
  data: RevenueForecast[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("revenue_forecasts")
      .select("*")
      .eq("period_type", periodType)
      .order("forecast_date", { ascending: false })
      .limit(50);

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getForecastHistory error:", err);
    return { data: [], error: "Failed to load forecast history." };
  }
}

// ============================================================
// Get forecast config
// ============================================================

export async function getForecastConfig(): Promise<{
  data: ForecastConfig[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("forecast_config")
      .select("*")
      .order("key");

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getForecastConfig error:", err);
    return { data: [], error: "Failed to load config." };
  }
}

// ============================================================
// Update forecast config
// ============================================================

export async function updateForecastConfig(
  key: string,
  value: Record<string, unknown>
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("forecast_config")
      .update({
        value,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateForecastConfig error:", err);
    return { error: "Failed to update config." };
  }
}

// ============================================================
// Dashboard widget data
// ============================================================

export async function getForecastDashboardWidget(): Promise<{
  data: {
    thisMonth: { revenue: number; profit: number; margin: number } | null;
    nextMonth: { revenue: number; profit: number; margin: number } | null;
    trend: "up" | "down" | "flat";
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: latest } = await supabase
      .from("revenue_forecasts")
      .select("forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(1)
      .single();

    if (!latest) return { data: null, error: null };

    const { data: monthlyForecasts } = await supabase
      .from("revenue_forecasts")
      .select("*")
      .eq("forecast_date", latest.forecast_date)
      .eq("period_type", "monthly")
      .order("period_start", { ascending: true })
      .limit(2);

    if (!monthlyForecasts || monthlyForecasts.length === 0) return { data: null, error: null };

    const thisMonth = monthlyForecasts[0];
    const nextMonth = monthlyForecasts[1] ?? null;

    const thisMonthData = {
      revenue: thisMonth.total_projected_revenue,
      profit: thisMonth.projected_profit,
      margin: thisMonth.total_projected_revenue > 0
        ? Math.round((thisMonth.projected_profit / thisMonth.total_projected_revenue) * 100)
        : 0,
    };

    const nextMonthData = nextMonth ? {
      revenue: nextMonth.total_projected_revenue,
      profit: nextMonth.projected_profit,
      margin: nextMonth.total_projected_revenue > 0
        ? Math.round((nextMonth.projected_profit / nextMonth.total_projected_revenue) * 100)
        : 0,
    } : null;

    const trend = nextMonthData
      ? nextMonthData.revenue > thisMonthData.revenue ? "up"
        : nextMonthData.revenue < thisMonthData.revenue ? "down"
        : "flat"
      : "flat";

    return {
      data: { thisMonth: thisMonthData, nextMonth: nextMonthData, trend },
      error: null,
    };
  } catch (err) {
    console.error("getForecastDashboardWidget error:", err);
    return { data: null, error: "Failed to load forecast widget." };
  }
}

// ============================================================
// Export forecasts as CSV
// ============================================================

export async function exportForecastsCsv(): Promise<{
  data: string | null;
  error: string | null;
}> {
  try {
    const { data, error } = await getLatestForecasts();
    if (error || !data) return { data: null, error: error ?? "No data." };

    const all = [...data.monthly, ...data.quarterly];
    if (all.length === 0) return { data: null, error: "No forecast data." };

    const headers = [
      "Period Type", "Period Start", "Period End",
      "Committed Revenue", "Pipeline Revenue", "Total Revenue",
      "Coach Costs", "Profit", "Margin %",
    ];

    const rows = all.map((f) => [
      f.period_type,
      f.period_start,
      f.period_end,
      f.committed_revenue.toFixed(2),
      f.pipeline_revenue.toFixed(2),
      f.total_projected_revenue.toFixed(2),
      f.projected_coach_costs.toFixed(2),
      f.projected_profit.toFixed(2),
      f.total_projected_revenue > 0
        ? ((f.projected_profit / f.total_projected_revenue) * 100).toFixed(1)
        : "0.0",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    return { data: csv, error: null };
  } catch (err) {
    console.error("exportForecastsCsv error:", err);
    return { data: null, error: "Failed to export." };
  }
}
