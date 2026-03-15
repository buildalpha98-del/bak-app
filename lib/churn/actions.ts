"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChurnEvent, ChurnRiskIndicator } from "@/lib/types/database";
import type { ChurnEventType, RiskLevel } from "@/lib/types/enums";

// ============================================================
// Churn — server actions
// ============================================================

interface ChurnDashboardSummary {
  centresByRisk: { low: number; medium: number; high: number; critical: number };
  recentEvents: (ChurnEvent & { centre_name: string })[];
  trendingRiskChanges: {
    centre_id: string;
    centre_name: string;
    previous_score: number;
    current_score: number;
    change: number;
    risk_level: RiskLevel;
  }[];
}

/**
 * Dashboard summary: centres by risk level, recent churn events, trending risk changes.
 */
export async function getChurnDashboard(): Promise<{
  data: ChurnDashboardSummary | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  try {
    // Get latest snapshot per centre for risk level counts
    const { data: latestSnapshots, error: snapError } = await supabase
      .from("churn_risk_indicators")
      .select("centre_id, risk_score, risk_level, snapshot_date, centres!inner(name)")
      .order("snapshot_date", { ascending: false });

    if (snapError) throw snapError;

    // Deduplicate to latest per centre
    const latestByCenter = new Map<string, typeof latestSnapshots[0]>();
    for (const snap of latestSnapshots ?? []) {
      if (!latestByCenter.has(snap.centre_id)) {
        latestByCenter.set(snap.centre_id, snap);
      }
    }

    const centresByRisk = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const snap of latestByCenter.values()) {
      const level = snap.risk_level as RiskLevel;
      if (level in centresByRisk) centresByRisk[level]++;
    }

    // Recent churn events (last 30)
    const { data: recentEventsRaw, error: eventsError } = await supabase
      .from("churn_events")
      .select("*, centres!inner(name)")
      .order("detected_at", { ascending: false })
      .limit(30);

    if (eventsError) throw eventsError;

    const recentEvents = (recentEventsRaw ?? []).map((e) => ({
      ...e,
      centre_name: (e.centres as unknown as { name: string }).name,
      centres: undefined,
    }));

    // Trending risk changes: compare latest two snapshots per centre
    const trendingRiskChanges: ChurnDashboardSummary["trendingRiskChanges"] = [];
    for (const snap of latestByCenter.values()) {
      // Find previous snapshot for same centre
      const previousSnaps = (latestSnapshots ?? []).filter(
        (s) =>
          s.centre_id === snap.centre_id &&
          s.snapshot_date < snap.snapshot_date
      );
      if (previousSnaps.length > 0) {
        const prev = previousSnaps[0];
        const change = snap.risk_score - prev.risk_score;
        if (Math.abs(change) >= 5) {
          trendingRiskChanges.push({
            centre_id: snap.centre_id,
            centre_name: (snap.centres as unknown as { name: string }).name,
            previous_score: prev.risk_score,
            current_score: snap.risk_score,
            change,
            risk_level: snap.risk_level as RiskLevel,
          });
        }
      }
    }

    trendingRiskChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    return {
      data: { centresByRisk, recentEvents, trendingRiskChanges: trendingRiskChanges.slice(0, 20) },
      error: null,
    };
  } catch (err) {
    console.error("getChurnDashboard error:", err);
    return { data: null, error: "Failed to load churn dashboard" };
  }
}

/**
 * Churn events and risk snapshots for a specific centre.
 */
export async function getCentreChurnHistory(
  centreId: string
): Promise<{
  data: { events: ChurnEvent[]; snapshots: ChurnRiskIndicator[] } | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  try {
    const [eventsResult, snapshotsResult] = await Promise.all([
      supabase
        .from("churn_events")
        .select("*")
        .eq("centre_id", centreId)
        .order("detected_at", { ascending: false }),
      supabase
        .from("churn_risk_indicators")
        .select("*")
        .eq("centre_id", centreId)
        .order("snapshot_date", { ascending: false })
        .limit(90),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;

    return {
      data: {
        events: eventsResult.data ?? [],
        snapshots: snapshotsResult.data ?? [],
      },
      error: null,
    };
  } catch (err) {
    console.error("getCentreChurnHistory error:", err);
    return { data: null, error: "Failed to load centre churn history" };
  }
}

/**
 * All centres with their current risk levels, sorted by risk score descending.
 */
export async function getChurnRiskOverview(): Promise<{
  data: {
    centre_id: string;
    centre_name: string;
    risk_score: number;
    risk_level: RiskLevel;
    health_score: number | null;
    days_since_last_feedback: number | null;
    days_since_last_communication: number | null;
    cancellation_rate: number | null;
    indicators_json: Record<string, unknown>;
    snapshot_date: string;
  }[] | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data: snapshots, error } = await supabase
      .from("churn_risk_indicators")
      .select("*, centres!inner(name)")
      .order("snapshot_date", { ascending: false });

    if (error) throw error;

    // Deduplicate to latest per centre
    const latestByCenter = new Map<string, (typeof snapshots)[0]>();
    for (const snap of snapshots ?? []) {
      if (!latestByCenter.has(snap.centre_id)) {
        latestByCenter.set(snap.centre_id, snap);
      }
    }

    const result = Array.from(latestByCenter.values())
      .map((s) => ({
        centre_id: s.centre_id,
        centre_name: (s.centres as unknown as { name: string }).name,
        risk_score: s.risk_score,
        risk_level: s.risk_level as RiskLevel,
        health_score: s.health_score,
        days_since_last_feedback: s.days_since_last_feedback,
        days_since_last_communication: s.days_since_last_communication,
        cancellation_rate: s.cancellation_rate,
        indicators_json: s.indicators_json,
        snapshot_date: s.snapshot_date,
      }))
      .sort((a, b) => b.risk_score - a.risk_score);

    return { data: result, error: null };
  } catch (err) {
    console.error("getChurnRiskOverview error:", err);
    return { data: null, error: "Failed to load churn risk overview" };
  }
}

/**
 * Manually record a churn event for a centre.
 */
export async function recordChurnEvent(
  centreId: string,
  eventType: ChurnEventType,
  notes?: string
): Promise<{ data: ChurnEvent | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  try {
    // Get latest risk snapshot for this centre
    const { data: latestSnap } = await supabase
      .from("churn_risk_indicators")
      .select("risk_score, risk_level, indicators_json")
      .eq("centre_id", centreId)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .single();

    const { data: event, error } = await supabase
      .from("churn_events")
      .insert({
        centre_id: centreId,
        event_type: eventType,
        risk_score: latestSnap?.risk_score ?? null,
        risk_level: latestSnap?.risk_level ?? null,
        indicators: latestSnap?.indicators_json ?? {},
        notes: notes ?? null,
        detected_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return { data: event, error: null };
  } catch (err) {
    console.error("recordChurnEvent error:", err);
    return { data: null, error: "Failed to record churn event" };
  }
}

/**
 * Mark a churn event as resolved.
 */
export async function resolveChurnEvent(
  eventId: string,
  notes?: string
): Promise<{ data: ChurnEvent | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();

  try {
    const updatePayload: Record<string, unknown> = {
      resolved_at: new Date().toISOString(),
    };
    if (notes) {
      updatePayload.notes = notes;
    }

    const { data: event, error } = await supabase
      .from("churn_events")
      .update(updatePayload)
      .eq("id", eventId)
      .select()
      .single();

    if (error) throw error;

    return { data: event, error: null };
  } catch (err) {
    console.error("resolveChurnEvent error:", err);
    return { data: null, error: "Failed to resolve churn event" };
  }
}

/**
 * Get risk trend data for charts (average risk over time and distribution).
 */
export async function getChurnTrends(): Promise<{
  data: {
    avgRiskOverTime: { date: string; avgScore: number }[];
    distributionOverTime: { date: string; low: number; medium: number; high: number; critical: number }[];
  } | null;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();

  try {
    const { data: snapshots, error } = await supabase
      .from("churn_risk_indicators")
      .select("snapshot_date, risk_score, risk_level")
      .order("snapshot_date", { ascending: true });

    if (error) throw error;

    // Group by date
    const byDate = new Map<string, { scores: number[]; levels: RiskLevel[] }>();
    for (const snap of snapshots ?? []) {
      const date = snap.snapshot_date;
      if (!byDate.has(date)) {
        byDate.set(date, { scores: [], levels: [] });
      }
      const entry = byDate.get(date)!;
      entry.scores.push(snap.risk_score);
      entry.levels.push(snap.risk_level as RiskLevel);
    }

    const avgRiskOverTime: { date: string; avgScore: number }[] = [];
    const distributionOverTime: { date: string; low: number; medium: number; high: number; critical: number }[] = [];

    for (const [date, { scores, levels }] of byDate.entries()) {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      avgRiskOverTime.push({ date, avgScore: avg });

      const dist = { date, low: 0, medium: 0, high: 0, critical: 0 };
      for (const level of levels) {
        if (level in dist) dist[level]++;
      }
      distributionOverTime.push(dist);
    }

    return { data: { avgRiskOverTime, distributionOverTime }, error: null };
  } catch (err) {
    console.error("getChurnTrends error:", err);
    return { data: null, error: "Failed to load churn trends" };
  }
}
