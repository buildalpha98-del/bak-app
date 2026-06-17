"use server";

// ============================================================
// Equipment — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/equipment (and
// /ops/equipment). Four counts surface "what to look at first":
//
//   1. Damaged / missing — `equipment_inventory` rows where
//      `condition IN ('poor','retired')` PLUS `equipment_kits`
//      rows where `condition IN ('needs_attention','needs_replacement')`.
//      Hard signal of stock that needs sorting before a session
//      tries to use it.
//   2. Low-stock kits — distinct `equipment_kits.id` values whose
//      `equipment_items.quantity` sums to 0 OR any item row has
//      `quantity = 0`. Tells the ops team a kit can't be
//      dispatched without restocking first.
//   3. Overdue check-ins — kits where `location_type = 'coach'`,
//      the last `check_out` log is older than 14 days, and no
//      `check_in` has occurred since. Surfaces gear "lost in the
//      field" with the coach.
//   4. Unassigned kits — kits in `storage` with `condition = 'good'`
//      that are NOT linked to any upcoming session. Idle bench —
//      worth deploying to a coach or centre.
//
// Implementation notes:
//   - All Supabase calls fan out in parallel where possible.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - We pull the kits + items + logs sets once and bucket in
//     memory rather than per-row count queries.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EquipmentStatusPulse {
  damagedOrMissingCount: number;
  lowStockKitsCount: number;
  overdueCheckinsCount: number;
  unassignedKitsCount: number;
}

export async function getEquipmentStatusPulse(): Promise<EquipmentStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgoIso = fourteenDaysAgo.toISOString();

    // ============================================================
    // Fan out:
    //
    // 1. Damaged inventory — head count of inventory rows in poor /
    //    retired.
    // 2. Damaged kits — head count of kits in needs_attention /
    //    needs_replacement.
    // 3. Kits + items — pull for low-stock derivation. We want kits
    //    where the sum of item quantities is zero OR any item is
    //    quantity = 0.
    // 4. Coach-held kits — `location_type='coach'`. Used together
    //    with the recent log fetch to derive overdue check-ins.
    // 5. Storage kits — `location_type='storage' AND
    //    condition='good'`. Used together with upcoming session
    //    kit assignments to derive the unassigned set.
    // 6. Upcoming-session kit ids — sessions with
    //    `date >= today AND equipment_kit_id IS NOT NULL`.
    // 7. Equipment logs since 14d ago — used to derive the
    //    overdue-checkin bucket.
    // ============================================================

    const [
      damagedInventoryRes,
      damagedKitsRes,
      itemsRes,
      coachKitsRes,
      storageKitsRes,
      upcomingSessionsRes,
      recentLogsRes,
    ] = await Promise.all([
      supabase
        .from("equipment_inventory")
        .select("id", { count: "exact", head: true })
        .in("condition", ["poor", "retired"]),
      supabase
        .from("equipment_kits")
        .select("id", { count: "exact", head: true })
        .in("condition", ["needs_attention", "needs_replacement"]),
      supabase.from("equipment_items").select("kit_id, quantity"),
      supabase
        .from("equipment_kits")
        .select("id, location_id")
        .eq("location_type", "coach"),
      supabase
        .from("equipment_kits")
        .select("id")
        .eq("location_type", "storage")
        .eq("condition", "good"),
      supabase
        .from("sessions")
        .select("equipment_kit_id")
        .gte("date", today)
        .not("equipment_kit_id", "is", null),
      supabase
        .from("equipment_logs")
        .select("kit_id, action, created_at")
        .gte("created_at", fourteenDaysAgoIso)
        .in("action", ["check_out", "check_in"])
        .order("created_at", { ascending: false }),
    ]);

    const damagedInventoryCount = damagedInventoryRes.count ?? 0;
    const damagedKitsCount = damagedKitsRes.count ?? 0;
    const damagedOrMissingCount = damagedInventoryCount + damagedKitsCount;

    // (2) Low-stock kits — bucket items by kit_id and tag a kit as
    //     low-stock if it has any item with quantity = 0 OR the
    //     total quantity sums to zero.
    const kitItemTotals = new Map<string, { total: number; hasZero: boolean }>();
    for (const row of itemsRes.data ?? []) {
      const r = row as { kit_id: string; quantity: number };
      const existing = kitItemTotals.get(r.kit_id) ?? {
        total: 0,
        hasZero: false,
      };
      existing.total += r.quantity ?? 0;
      if ((r.quantity ?? 0) === 0) existing.hasZero = true;
      kitItemTotals.set(r.kit_id, existing);
    }
    let lowStockKitsCount = 0;
    for (const stats of kitItemTotals.values()) {
      if (stats.hasZero || stats.total === 0) lowStockKitsCount += 1;
    }

    // (3) Overdue check-ins — for each coach-held kit, look at the
    //     most recent log. If the last action was a check_out and
    //     it's older than 14 days (i.e. its created_at falls before
    //     the 14d window, OR it's the most recent log but no
    //     check_in followed), flag it.
    //
    //     We pulled logs from the last 14 days only. A kit whose
    //     last check_out is *outside* that window won't appear in
    //     `recentLogsRes` at all — that's our signal. So the rule
    //     becomes: a coach-held kit is overdue if it has zero
    //     entries in the last-14d log set.
    const kitsWithRecentLogs = new Set<string>();
    for (const row of recentLogsRes.data ?? []) {
      const r = row as { kit_id: string };
      kitsWithRecentLogs.add(r.kit_id);
    }
    let overdueCheckinsCount = 0;
    for (const row of coachKitsRes.data ?? []) {
      const r = row as { id: string };
      if (!kitsWithRecentLogs.has(r.id)) overdueCheckinsCount += 1;
    }

    // (4) Unassigned kits — storage + good - upcoming session links.
    const upcomingKitIds = new Set<string>();
    for (const row of upcomingSessionsRes.data ?? []) {
      const r = row as { equipment_kit_id: string | null };
      if (r.equipment_kit_id) upcomingKitIds.add(r.equipment_kit_id);
    }
    let unassignedKitsCount = 0;
    for (const row of storageKitsRes.data ?? []) {
      const r = row as { id: string };
      if (!upcomingKitIds.has(r.id)) unassignedKitsCount += 1;
    }

    return {
      damagedOrMissingCount,
      lowStockKitsCount,
      overdueCheckinsCount,
      unassignedKitsCount,
    };
  } catch (err) {
    console.error("getEquipmentStatusPulse error:", err);
    return {
      damagedOrMissingCount: 0,
      lowStockKitsCount: 0,
      overdueCheckinsCount: 0,
      unassignedKitsCount: 0,
    };
  }
}
