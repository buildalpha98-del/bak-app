"use server";

// ============================================================
// Ops Command Centre — status pulse server action
// ============================================================
//
// Powers the sticky context strip at the top of /ops with the three
// most urgent counts for Abdul's morning sweep. Each count is a
// jump-link that lands on the relevant view with the filter applied:
//
//   1. Shifts needing a coach today  — `sessions` today where coach_id
//      is null OR status='needs_replacement'. The single most urgent
//      ops signal — if it's not zero, today's roster doesn't run.
//   2. Unconfirmed shifts (≤48h)     — `sessions.status='pending_confirmation'`
//      in the next 48 hours, coach assigned but not confirmed. Drives
//      the auto-rerostering offer flow.
//   3. Equipment-issue tickets       — `equipment_logs.action='issue_flagged'`
//      where the linked task hasn't reached a final column. Proxy for
//      "stuff that's broken and not yet resolved".
//
// Implementation notes:
//   - All three counts use `head: true` to skip row data.
//   - Date math is Sydney-local — server timezone is unreliable.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page (matches the staff / centres / marketing
//     pulse patterns).

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface OpsCommandPulse {
  needsCoachTodayCount: number;
  unconfirmedShiftsCount: number;
  equipmentIssuesCount: number;
}

export async function getOpsCommandPulse(): Promise<OpsCommandPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    // Sydney-local today (AEDT/AEST). Mirrors getTodaysSessions().
    const now = new Date();
    const aestOffset = 11;
    const aest = new Date(now.getTime() + aestOffset * 60 * 60 * 1000);
    const today = aest.toISOString().split("T")[0];
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // 1. Shifts today that need a coach. Two routes — either no coach
    //    assigned at all, or explicitly marked needs_replacement. We
    //    issue two cheap counts and add them.
    const unassignedTodayPromise = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("date", today)
      .is("coach_id", null);

    const needsReplacementTodayPromise = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("date", today)
      .eq("status", "needs_replacement");

    // 2. Unconfirmed shifts in the next 48 hours.
    const unconfirmedPromise = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_confirmation")
      .gte("date", today)
      .lte("date", in48h)
      .not("coach_id", "is", null);

    // 3. Equipment issues. Fetch the issue-flagged logs (limited) and
    //    subtract the kits whose follow-up task is already in a final
    //    column. This mirrors getEquipmentIssues() but counts instead
    //    of returning rows.
    const equipmentLogsPromise = supabase
      .from("equipment_logs")
      .select("kit_id")
      .eq("action", "issue_flagged")
      .order("created_at", { ascending: false })
      .limit(50);

    const [
      unassignedRes,
      needsReplacementRes,
      unconfirmedRes,
      equipmentLogsRes,
    ] = await Promise.all([
      unassignedTodayPromise,
      needsReplacementTodayPromise,
      unconfirmedPromise,
      equipmentLogsPromise,
    ]);

    let equipmentIssuesCount = 0;
    const kitIds = [
      ...new Set(
        (equipmentLogsRes.data ?? []).map((l) => l.kit_id as string),
      ),
    ];
    if (kitIds.length > 0) {
      const { data: resolvedTasks } = await supabase
        .from("tasks")
        .select("linked_entity_id, column:task_columns!column_id(is_final)")
        .eq("linked_entity_type", "equipment_kit")
        .eq("source", "equipment_issue")
        .in("linked_entity_id", kitIds);

      const resolvedKitIds = new Set(
        (resolvedTasks ?? [])
          .filter((t: Record<string, unknown>) => {
            const col = t.column as unknown as Record<string, unknown> | null;
            return col?.is_final === true;
          })
          .map((t: Record<string, unknown>) => t.linked_entity_id as string),
      );

      equipmentIssuesCount = (equipmentLogsRes.data ?? []).filter(
        (l) => !resolvedKitIds.has(l.kit_id as string),
      ).length;
    }

    return {
      needsCoachTodayCount:
        (unassignedRes.count ?? 0) + (needsReplacementRes.count ?? 0),
      unconfirmedShiftsCount: unconfirmedRes.count ?? 0,
      equipmentIssuesCount,
    };
  } catch (err) {
    console.error("getOpsCommandPulse error:", err);
    return {
      needsCoachTodayCount: 0,
      unconfirmedShiftsCount: 0,
      equipmentIssuesCount: 0,
    };
  }
}
