"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LeadStage, LeadSource } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface PipelineMetrics {
  activeLeads: number;
  wonThisYear: number;
  weightedForecast: number;
  conversionRate: number;
  funnelData: { stage: string; count: number }[];
  sourceBreakdown: { source: string; count: number }[];
}

export interface PipelineSnapshot {
  activeLeads: number;
  weightedForecast: number;
  demosThisWeek: number;
  overdueFollowUps: number;
}

// ============================================================
// Full pipeline metrics (for metrics page)
// ============================================================

const ACTIVE_STAGES: LeadStage[] = [
  "cold_lead", "contacted", "interested", "free_trial", "proposal_sent",
];

const STAGE_LABELS: Record<string, string> = {
  cold_lead: "Cold Lead",
  contacted: "Contacted",
  interested: "Interested",
  free_trial: "Free Trial",
  proposal_sent: "Proposal Sent",
  won: "Won",
  lost: "Lost",
  churned: "Churned",
};

export async function getPipelineMetrics(): Promise<{
  data: PipelineMetrics | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: leads, error } = await supabase
      .from("leads")
      .select("stage, estimated_value, probability, source, stage_changed_at");

    if (error) return { data: null, error: error.message };
    if (!leads) return { data: null, error: "No data." };

    const currentYear = new Date().getFullYear();

    let activeLeads = 0;
    let wonThisYear = 0;
    let wonTotal = 0;
    let lostTotal = 0;
    let weightedForecast = 0;
    const stageCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};

    for (const lead of leads) {
      // Stage counts
      stageCounts[lead.stage] = (stageCounts[lead.stage] ?? 0) + 1;

      // Source counts
      if (lead.source) {
        sourceCounts[lead.source] = (sourceCounts[lead.source] ?? 0) + 1;
      }

      // Active leads
      if (ACTIVE_STAGES.includes(lead.stage as LeadStage)) {
        activeLeads++;
        const value = lead.estimated_value ?? 0;
        const prob = lead.probability ?? 0;
        weightedForecast += (value * prob) / 100;
      }

      // Won this year
      if (lead.stage === "won") {
        wonTotal++;
        if (lead.stage_changed_at) {
          const changedYear = new Date(lead.stage_changed_at).getFullYear();
          if (changedYear === currentYear) wonThisYear++;
        }
      }

      // Lost total
      if (lead.stage === "lost" || lead.stage === "churned") {
        lostTotal++;
      }
    }

    const conversionRate =
      wonTotal + lostTotal > 0
        ? Math.round((wonTotal / (wonTotal + lostTotal)) * 100)
        : 0;

    // Build ordered funnel data
    const allStages: LeadStage[] = [
      "cold_lead", "contacted", "interested", "free_trial", "proposal_sent", "won", "lost", "churned",
    ];
    const funnelData = allStages.map((stage) => ({
      stage: STAGE_LABELS[stage] ?? stage,
      count: stageCounts[stage] ?? 0,
    }));

    // Build source breakdown
    const SOURCE_LABELS: Record<string, string> = {
      manual: "Manual",
      csv_import: "CSV Import",
      web_form: "Web Form",
      referral: "Referral",
    };
    const sourceBreakdown = Object.entries(sourceCounts).map(([source, count]) => ({
      source: SOURCE_LABELS[source] ?? source,
      count,
    }));

    return {
      data: {
        activeLeads,
        wonThisYear,
        weightedForecast: Math.round(weightedForecast),
        conversionRate,
        funnelData,
        sourceBreakdown,
      },
      error: null,
    };
  } catch (err) {
    console.error("getPipelineMetrics error:", err);
    return { data: null, error: "Failed to load pipeline metrics." };
  }
}

// ============================================================
// Lightweight snapshot (for admin dashboard widget)
// ============================================================

export async function getPipelineSnapshot(): Promise<{
  data: PipelineSnapshot | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Active leads + weighted forecast
    const { data: activeLeads } = await supabase
      .from("leads")
      .select("estimated_value, probability")
      .in("stage", ACTIVE_STAGES);

    const activeCount = activeLeads?.length ?? 0;
    let forecast = 0;
    if (activeLeads) {
      for (const l of activeLeads) {
        forecast += ((l.estimated_value ?? 0) * (l.probability ?? 0)) / 100;
      }
    }

    // Demos this week
    const today = new Date();
    const weekFromNow = new Date();
    weekFromNow.setDate(today.getDate() + 7);

    const { data: demos } = await supabase
      .from("demo_sessions")
      .select("id")
      .eq("status", "scheduled")
      .gte("scheduled_date", today.toISOString().split("T")[0])
      .lte("scheduled_date", weekFromNow.toISOString().split("T")[0]);

    // Overdue tasks (CRM automation tasks past due date, not in final column)
    const { data: finalCols } = await supabase
      .from("task_columns")
      .select("id")
      .eq("is_final", true);

    const finalColIds = finalCols?.map((c) => c.id) ?? [];

    let overdueQuery = supabase
      .from("tasks")
      .select("id")
      .eq("source", "crm_automation")
      .lt("due_date", today.toISOString().split("T")[0]);

    if (finalColIds.length > 0) {
      for (const id of finalColIds) {
        overdueQuery = overdueQuery.neq("column_id", id);
      }
    }

    const { data: overdueTasks } = await overdueQuery;

    return {
      data: {
        activeLeads: activeCount,
        weightedForecast: Math.round(forecast),
        demosThisWeek: demos?.length ?? 0,
        overdueFollowUps: overdueTasks?.length ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("getPipelineSnapshot error:", err);
    return { data: null, error: "Failed to load pipeline snapshot." };
  }
}
