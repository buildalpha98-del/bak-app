"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HealthScore, HealthScoreConfig } from "@/lib/types/database";

// ============================================================
// Get health score config
// ============================================================

export async function getHealthScoreConfig(): Promise<{
  data: HealthScoreConfig[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("health_score_config")
      .select("*")
      .order("signal_name");

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getHealthScoreConfig error:", err);
    return { data: [], error: "Failed to load config." };
  }
}

// ============================================================
// Update health score config
// ============================================================

export async function updateHealthScoreConfig(
  configId: string,
  updates: {
    weight?: number;
    green_threshold?: number;
    amber_threshold?: number;
  }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("health_score_config")
      .update({
        ...updates,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", configId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("updateHealthScoreConfig error:", err);
    return { error: "Failed to update config." };
  }
}

// ============================================================
// Get health score history for a centre
// ============================================================

export async function getCentreHealthHistory(
  centreId: string,
  limit: number = 30
): Promise<{ data: HealthScore[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("health_scores")
      .select("*")
      .eq("centre_id", centreId)
      .order("calculated_at", { ascending: false })
      .limit(limit);

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCentreHealthHistory error:", err);
    return { data: [], error: "Failed to load health history." };
  }
}

// ============================================================
// Get health dashboard summary
// ============================================================

export async function getHealthDashboardSummary(): Promise<{
  data: {
    green: number;
    amber: number;
    red: number;
    redCentres: { id: string; name: string; score: number; lowestSignal: string }[];
    recentChanges: { id: string; name: string; from: string; to: string; score: number; changedAt: string }[];
  } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get centres with health scores
    const { data: centres } = await supabase
      .from("centres")
      .select("id, name, health_score, health_status, health_score_updated_at")
      .eq("contract_status", "active")
      .not("health_status", "is", null);

    if (!centres) return { data: null, error: "No data." };

    const green = centres.filter((c) => c.health_status === "green").length;
    const amber = centres.filter((c) => c.health_status === "amber").length;
    const red = centres.filter((c) => c.health_status === "red").length;

    // Red centres with their lowest signal
    const redCentres: { id: string; name: string; score: number; lowestSignal: string }[] = [];
    const redCentreList = centres.filter((c) => c.health_status === "red");

    for (const c of redCentreList) {
      const { data: latestScore } = await supabase
        .from("health_scores")
        .select("breakdown_json")
        .eq("centre_id", c.id)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .single();

      let lowestSignal = "Unknown";
      if (latestScore?.breakdown_json) {
        const breakdown = latestScore.breakdown_json as unknown as { signal_name: string; signal_score: number }[];
        if (Array.isArray(breakdown) && breakdown.length > 0) {
          const lowest = breakdown.reduce((min, s) => (s.signal_score < min.signal_score ? s : min));
          lowestSignal = formatSignalName(lowest.signal_name);
        }
      }

      redCentres.push({
        id: c.id,
        name: c.name,
        score: c.health_score ?? 0,
        lowestSignal,
      });
    }

    // Recent status changes (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get scores from last 7 days with previous score for comparison
    const recentChanges: { id: string; name: string; from: string; to: string; score: number; changedAt: string }[] = [];

    for (const c of centres) {
      const { data: recentScores } = await supabase
        .from("health_scores")
        .select("status, calculated_at")
        .eq("centre_id", c.id)
        .order("calculated_at", { ascending: false })
        .limit(2);

      if (recentScores && recentScores.length >= 2) {
        const latest = recentScores[0];
        const previous = recentScores[1];

        if (
          latest.status !== previous.status &&
          new Date(latest.calculated_at) >= sevenDaysAgo
        ) {
          recentChanges.push({
            id: c.id,
            name: c.name,
            from: previous.status,
            to: latest.status,
            score: c.health_score ?? 0,
            changedAt: latest.calculated_at,
          });
        }
      }
    }

    return {
      data: { green, amber, red, redCentres, recentChanges },
      error: null,
    };
  } catch (err) {
    console.error("getHealthDashboardSummary error:", err);
    return { data: null, error: "Failed to load summary." };
  }
}

function formatSignalName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
