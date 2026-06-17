"use server";

// ============================================================
// Churn dashboard — status pulse server action
// ============================================================
//
// Powers the inline "N at risk · M new events this week · K
// improving · F unchanged" strip above /admin/churn.
//
// Implementation notes:
//   - At risk: latest snapshot per centre with risk_level in
//     ('high','critical'). Calculated via getChurnDashboard's
//     latest-per-centre dedupe approach but simplified here.
//   - New events this week: churn_events where detected_at >= Monday.
//   - Improving: latest snapshot has risk_score 5+ points lower than
//     previous snapshot for same centre.
//   - Unchanged: latest snapshot within ±2 points of previous.
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface ChurnStatusPulse {
  atRiskCount: number;
  newEventsThisWeekCount: number;
  improvingCount: number;
  unchangedCount: number;
}

export async function getChurnStatusPulse(): Promise<ChurnStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    // Pull snapshots (sorted by date desc) so we can dedupe to
    // latest-per-centre + still see the previous snapshot for trend.
    const [{ data: snapshots }, eventsRes] = await Promise.all([
      supabase
        .from("churn_risk_indicators")
        .select("centre_id, risk_score, risk_level, snapshot_date")
        .order("snapshot_date", { ascending: false }),
      supabase
        .from("churn_events")
        .select("id", { count: "exact", head: true })
        .gte("detected_at", mondayIso),
    ]);

    type SnapshotRow = {
      centre_id: string;
      risk_score: number;
      risk_level: string;
      snapshot_date: string;
    };
    const snaps = (snapshots ?? []) as SnapshotRow[];

    // Build latest + previous per centre.
    const latestByCentre = new Map<
      string,
      { snap: SnapshotRow; prev: SnapshotRow | null }
    >();
    for (const snap of snaps) {
      const existing = latestByCentre.get(snap.centre_id);
      if (!existing) {
        latestByCentre.set(snap.centre_id, { snap, prev: null });
      } else if (!existing.prev) {
        existing.prev = snap;
      }
    }

    let atRisk = 0;
    let improving = 0;
    let unchanged = 0;
    for (const { snap, prev } of latestByCentre.values()) {
      if (snap.risk_level === "high" || snap.risk_level === "critical") {
        atRisk += 1;
      }
      if (prev) {
        const delta = snap.risk_score - prev.risk_score;
        if (delta <= -5) improving += 1;
        else if (Math.abs(delta) <= 2) unchanged += 1;
      } else {
        // No previous snapshot — treat as unchanged for the count.
        unchanged += 1;
      }
    }

    return {
      atRiskCount: atRisk,
      newEventsThisWeekCount: eventsRes.count ?? 0,
      improvingCount: improving,
      unchangedCount: unchanged,
    };
  } catch (err) {
    console.error("getChurnStatusPulse error:", err);
    return {
      atRiskCount: 0,
      newEventsThisWeekCount: 0,
      improvingCount: 0,
      unchangedCount: 0,
    };
  }
}
