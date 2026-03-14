import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Revenue Forecasting Engine
// ============================================================

interface ForecastBreakdown {
  byCentreType: { type: string; revenue: number; cost: number }[];
  byPricingModel: { model: string; revenue: number }[];
  byCentre: { centreId: string; centreName: string; revenue: number; cost: number }[];
  pipelineByStage: { stage: string; count: number; weightedRevenue: number }[];
  byCoach: { coachId: string; coachName: string; sessions: number; cost: number }[];
}

interface ForecastPeriod {
  periodType: "monthly" | "quarterly";
  periodStart: string;
  periodEnd: string;
  committedRevenue: number;
  pipelineRevenue: number;
  totalProjectedRevenue: number;
  projectedCoachCosts: number;
  projectedProfit: number;
  breakdown: ForecastBreakdown;
}

interface ForecastConfig {
  conversionRates: Record<string, number>;
  seasonalFactors: Record<string, number>;
  defaultSessionFrequency: Record<string, number>;
}

// ============================================================
// Load config from DB
// ============================================================

async function loadConfig(): Promise<ForecastConfig> {
  const supabase = createSupabaseAdmin();

  const { data: configs } = await supabase
    .from("forecast_config")
    .select("key, value");

  const configMap = new Map((configs ?? []).map((c) => [c.key, c.value]));

  return {
    conversionRates: (configMap.get("pipeline_conversion_rates") as Record<string, number>) ?? {
      cold_lead: 0.05, contacted: 0.10, interested: 0.20, free_trial: 0.50, proposal_sent: 0.70,
    },
    seasonalFactors: (configMap.get("seasonal_factors") as Record<string, number>) ?? {
      "1": 0.5, "2": 0.8, "3": 1.0, "4": 1.0, "5": 1.0, "6": 1.0,
      "7": 0.7, "8": 0.8, "9": 1.0, "10": 1.0, "11": 1.0, "12": 0.6,
    },
    defaultSessionFrequency: (configMap.get("default_session_frequency") as Record<string, number>) ?? {
      childcare_centre: 1, school: 2,
    },
  };
}

// ============================================================
// Calculate committed revenue from active centres
// ============================================================

async function calculateCommittedRevenue(
  periodStart: Date,
  periodEnd: Date,
  config: ForecastConfig
): Promise<{
  total: number;
  byCentreType: Map<string, number>;
  byPricingModel: Map<string, number>;
  byCentre: { centreId: string; centreName: string; revenue: number; cost: number }[];
  totalCoachCost: number;
  byCoach: Map<string, { name: string; sessions: number; cost: number }>;
}> {
  const supabase = createSupabaseAdmin();

  // Get active centres
  const { data: centres } = await supabase
    .from("centres")
    .select("id, name, type, pricing_model, agreed_rate, contract_status")
    .in("contract_status", ["active", "trial"]);

  // Get actual rostered sessions in the period
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, centre_id, coach_id, pay_rate_resolved, date, status, profiles!sessions_coach_id_fkey(name)")
    .gte("date", periodStart.toISOString().split("T")[0])
    .lte("date", periodEnd.toISOString().split("T")[0])
    .neq("status", "cancelled");

  // Get average coach rate
  const { data: payRates } = await supabase
    .from("pay_rates")
    .select("rate");

  const avgCoachRate = payRates && payRates.length > 0
    ? payRates.reduce((sum, r) => sum + r.rate, 0) / payRates.length
    : 40;

  const centreMap = new Map((centres ?? []).map((c) => [c.id, c]));
  const byCentreType = new Map<string, number>();
  const byPricingModel = new Map<string, number>();
  const byCentre: { centreId: string; centreName: string; revenue: number; cost: number }[] = [];
  const byCoach = new Map<string, { name: string; sessions: number; cost: number }>();
  let totalRevenue = 0;
  let totalCoachCost = 0;

  // Calculate weeks in period
  const weeksInPeriod = Math.ceil(
    (periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  // Calculate seasonal factor for this period (average of months covered)
  const months: number[] = [];
  const cursor = new Date(periodStart);
  while (cursor <= periodEnd) {
    months.push(cursor.getMonth() + 1);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const seasonalFactor = months.length > 0
    ? months.reduce((sum, m) => sum + (config.seasonalFactors[String(m)] ?? 1.0), 0) / months.length
    : 1.0;

  for (const centre of centres ?? []) {
    // Count actual sessions for this centre in the period
    const centreSessions = (sessions ?? []).filter((s) => s.centre_id === centre.id);

    let revenue: number;
    if (centreSessions.length > 0) {
      // Use actual session data
      revenue = centreSessions.length * (centre.agreed_rate ?? 160);
    } else {
      // Estimate from session frequency
      const freq = config.defaultSessionFrequency[centre.type] ?? 1;
      revenue = freq * weeksInPeriod * (centre.agreed_rate ?? 160) * seasonalFactor;
    }

    const coachCost = centreSessions.length > 0
      ? centreSessions.reduce((sum, s) => sum + (s.pay_rate_resolved ?? avgCoachRate), 0)
      : (config.defaultSessionFrequency[centre.type] ?? 1) * weeksInPeriod * avgCoachRate * seasonalFactor;

    totalRevenue += revenue;
    totalCoachCost += coachCost;

    byCentreType.set(centre.type, (byCentreType.get(centre.type) ?? 0) + revenue);
    byPricingModel.set(centre.pricing_model, (byPricingModel.get(centre.pricing_model) ?? 0) + revenue);
    byCentre.push({ centreId: centre.id, centreName: centre.name, revenue, cost: coachCost });

    // Track coach costs
    for (const session of centreSessions) {
      if (session.coach_id) {
        const coach = session.profiles as unknown as { name: string } | null;
        const existing = byCoach.get(session.coach_id) ?? { name: coach?.name ?? "Unknown", sessions: 0, cost: 0 };
        existing.sessions++;
        existing.cost += session.pay_rate_resolved ?? avgCoachRate;
        byCoach.set(session.coach_id, existing);
      }
    }
  }

  return { total: totalRevenue, byCentreType, byPricingModel, byCentre, totalCoachCost, byCoach };
}

// ============================================================
// Calculate pipeline revenue from CRM leads
// ============================================================

async function calculatePipelineRevenue(
  config: ForecastConfig
): Promise<{
  total: number;
  byStage: { stage: string; count: number; weightedRevenue: number }[];
}> {
  const supabase = createSupabaseAdmin();

  const activeStages = ["cold_lead", "contacted", "interested", "free_trial", "proposal_sent"];

  const { data: leads } = await supabase
    .from("leads")
    .select("stage, estimated_value, type")
    .in("stage", activeStages);

  const stageMap = new Map<string, { count: number; weightedRevenue: number }>();
  for (const stage of activeStages) {
    stageMap.set(stage, { count: 0, weightedRevenue: 0 });
  }

  let total = 0;

  for (const lead of leads ?? []) {
    const convRate = config.conversionRates[lead.stage] ?? 0;
    let estimatedValue = lead.estimated_value;

    if (!estimatedValue) {
      // Default estimate: session freq × average rate × 52 weeks
      const freq = config.defaultSessionFrequency[lead.type ?? "childcare_centre"] ?? 1;
      estimatedValue = freq * 160 * 52; // $160 average rate
    }

    const weighted = estimatedValue * convRate;
    total += weighted;

    const entry = stageMap.get(lead.stage)!;
    entry.count++;
    entry.weightedRevenue += weighted;
  }

  return {
    total,
    byStage: Array.from(stageMap.entries()).map(([stage, data]) => ({
      stage,
      ...data,
    })),
  };
}

// ============================================================
// Generate forecasts for all periods
// ============================================================

export async function generateForecasts(): Promise<{
  forecasts: ForecastPeriod[];
  error: string | null;
}> {
  try {
    const config = await loadConfig();
    const supabase = createSupabaseAdmin();
    const forecasts: ForecastPeriod[] = [];

    const now = new Date();

    // Monthly: next 3 months
    for (let i = 0; i < 3; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);

      const committed = await calculateCommittedRevenue(start, end, config);
      const pipeline = await calculatePipelineRevenue(config);

      // Scale pipeline to monthly (pipeline is annual estimate)
      const monthlyPipeline = pipeline.total / 12;

      const totalRevenue = committed.total + monthlyPipeline;
      const profit = totalRevenue - committed.totalCoachCost;

      const breakdown: ForecastBreakdown = {
        byCentreType: Array.from(committed.byCentreType.entries()).map(([type, revenue]) => ({
          type, revenue, cost: 0,
        })),
        byPricingModel: Array.from(committed.byPricingModel.entries()).map(([model, revenue]) => ({
          model, revenue,
        })),
        byCentre: committed.byCentre,
        pipelineByStage: pipeline.byStage,
        byCoach: Array.from(committed.byCoach.entries()).map(([coachId, data]) => ({
          coachId, coachName: data.name, sessions: data.sessions, cost: data.cost,
        })),
      };

      const period: ForecastPeriod = {
        periodType: "monthly",
        periodStart: start.toISOString().split("T")[0],
        periodEnd: end.toISOString().split("T")[0],
        committedRevenue: Math.round(committed.total * 100) / 100,
        pipelineRevenue: Math.round(monthlyPipeline * 100) / 100,
        totalProjectedRevenue: Math.round(totalRevenue * 100) / 100,
        projectedCoachCosts: Math.round(committed.totalCoachCost * 100) / 100,
        projectedProfit: Math.round(profit * 100) / 100,
        breakdown,
      };

      forecasts.push(period);

      // Store in DB
      await supabase.from("revenue_forecasts").insert({
        forecast_date: now.toISOString().split("T")[0],
        period_type: "monthly",
        period_start: period.periodStart,
        period_end: period.periodEnd,
        committed_revenue: period.committedRevenue,
        pipeline_revenue: period.pipelineRevenue,
        total_projected_revenue: period.totalProjectedRevenue,
        projected_coach_costs: period.projectedCoachCosts,
        projected_profit: period.projectedProfit,
        breakdown_json: breakdown as unknown as Record<string, unknown>,
      });
    }

    // Quarterly: next 4 quarters
    for (let i = 0; i < 4; i++) {
      const qMonth = Math.floor(now.getMonth() / 3) * 3 + i * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);
      const end = new Date(now.getFullYear(), qMonth + 3, 0);

      const committed = await calculateCommittedRevenue(start, end, config);
      const pipeline = await calculatePipelineRevenue(config);
      const quarterlyPipeline = pipeline.total / 4;

      const totalRevenue = committed.total + quarterlyPipeline;
      const profit = totalRevenue - committed.totalCoachCost;

      const breakdown: ForecastBreakdown = {
        byCentreType: Array.from(committed.byCentreType.entries()).map(([type, revenue]) => ({
          type, revenue, cost: 0,
        })),
        byPricingModel: Array.from(committed.byPricingModel.entries()).map(([model, revenue]) => ({
          model, revenue,
        })),
        byCentre: committed.byCentre,
        pipelineByStage: pipeline.byStage,
        byCoach: Array.from(committed.byCoach.entries()).map(([coachId, data]) => ({
          coachId, coachName: data.name, sessions: data.sessions, cost: data.cost,
        })),
      };

      const period: ForecastPeriod = {
        periodType: "quarterly",
        periodStart: start.toISOString().split("T")[0],
        periodEnd: end.toISOString().split("T")[0],
        committedRevenue: Math.round(committed.total * 100) / 100,
        pipelineRevenue: Math.round(quarterlyPipeline * 100) / 100,
        totalProjectedRevenue: Math.round(totalRevenue * 100) / 100,
        projectedCoachCosts: Math.round(committed.totalCoachCost * 100) / 100,
        projectedProfit: Math.round(profit * 100) / 100,
        breakdown,
      };

      forecasts.push(period);

      await supabase.from("revenue_forecasts").insert({
        forecast_date: now.toISOString().split("T")[0],
        period_type: "quarterly",
        period_start: period.periodStart,
        period_end: period.periodEnd,
        committed_revenue: period.committedRevenue,
        pipeline_revenue: period.pipelineRevenue,
        total_projected_revenue: period.totalProjectedRevenue,
        projected_coach_costs: period.projectedCoachCosts,
        projected_profit: period.projectedProfit,
        breakdown_json: breakdown as unknown as Record<string, unknown>,
      });
    }

    return { forecasts, error: null };
  } catch (err) {
    console.error("generateForecasts error:", err);
    return { forecasts: [], error: "Failed to generate forecasts." };
  }
}
