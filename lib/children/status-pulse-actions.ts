"use server";

// ============================================================
// Children list — status pulse server action
// ============================================================
//
// Powers the inline "N new this week · M no centre linked · K
// assessments overdue · F inactive 30+ days" strip above the children
// list. Each count is a link-to-jump that flips a query param on the
// list view so the operator can drill into the work.
//
// Implementation notes:
//   - `head: true` count queries wherever possible to avoid hauling
//     rows back across the wire for a pure aggregate.
//   - "Assessments overdue" requires both a current active `terms`
//     row AND a per-child skill_ratings absence — so we read the
//     active children id-set + active term id once, then count via a
//     "not in" pattern computed client-side.
//   - "Inactive 30+ days" requires the most-recent attendance row
//     per active child — pulled with `order: created_at desc` and
//     bucketed client-side (capped to keep wire payload tight).
//   - Errors swallow to zeros so a single broken query doesn't blank
//     the whole page; mirrors staff + centres pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";
import {
  resolveCompareWindow,
  countRowsInWindow,
} from "@/lib/comparison/pulse-helpers";
import type { PeriodKey } from "@/lib/comparison/period";

export interface ChildrenStatusPulse {
  newThisWeekCount: number;
  noCentreCount: number;
  assessmentsOverdueCount: number;
  inactive30dCount: number;
}

export async function getChildrenStatusPulse(): Promise<ChildrenStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    // ============================================================
    // Fan out the five queries in parallel:
    //
    // 1. "New this week" — head count on children.created_at >= Monday.
    // 2. Active children id list — needed by (3) and (4) to compute
    //    centre-link / attendance subtractions.
    // 3. centre_children active links — child_id only; we bucket to
    //    Set<child_id> client-side for the "no centre" count.
    // 4. Current active term (if any) — needed to scope (5).
    // 5. (after we know termId) skill_ratings for that term — child_id
    //    only; bucket and subtract to derive "assessments overdue".
    // 6. session_attendances created in the last 30 days — child_id +
    //    created_at; bucket to Set<child_id> for inactive-30d delta.
    // ============================================================

    const [
      newThisWeekRes,
      activeChildrenRes,
      centreLinksRes,
      activeTermRes,
      recentAttendanceRes,
    ] = await Promise.all([
      supabase
        .from("children")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("children")
        .select("id")
        .eq("status", "active"),
      supabase
        .from("centre_children")
        .select("child_id")
        .eq("status", "active"),
      supabase
        .from("terms")
        .select("id")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1),
      supabase
        .from("session_attendances")
        .select("child_id, created_at")
        .gte("created_at", thirtyDaysAgoIso),
    ]);

    const newThisWeekCount = newThisWeekRes.count ?? 0;

    // (2) Active children id set — used as the denominator for the
    // "no centre" and "inactive" derived counts. We exclude inactive
    // children up front so an archived row doesn't pull the overdue
    // count into the orange band.
    const activeChildren = activeChildrenRes.data ?? [];
    const activeChildIds = new Set<string>(
      activeChildren.map((c: { id: string }) => c.id),
    );

    // (3) "No centre linked" — children with zero `centre_children`
    // rows (status='active'). We start from the active set and
    // subtract every child_id that appears in the link table.
    const linkedIds = new Set<string>();
    for (const row of centreLinksRes.data ?? []) {
      const cid = (row as { child_id: string }).child_id;
      if (activeChildIds.has(cid)) linkedIds.add(cid);
    }
    let noCentreCount = 0;
    for (const id of activeChildIds) {
      if (!linkedIds.has(id)) noCentreCount += 1;
    }

    // (4)+(5) "Assessments overdue" — active children with no
    // skill_ratings row for the current active term. If no active term
    // exists, the count is 0 (nothing is overdue yet).
    let assessmentsOverdueCount = 0;
    const activeTermRow = (activeTermRes.data ?? [])[0] as
      | { id: string }
      | undefined;
    if (activeTermRow && activeChildIds.size > 0) {
      const { data: ratings } = await supabase
        .from("skill_ratings")
        .select("child_id")
        .eq("term_id", activeTermRow.id);
      const ratedIds = new Set<string>();
      for (const row of ratings ?? []) {
        const cid = (row as { child_id: string }).child_id;
        if (activeChildIds.has(cid)) ratedIds.add(cid);
      }
      for (const id of activeChildIds) {
        if (!ratedIds.has(id)) assessmentsOverdueCount += 1;
      }
    }

    // (6) "Inactive 30+ days" — active children whose most-recent
    // attendance row is older than 30 days. We have all rows in the
    // last 30 days from query (5); any active child NOT in this set
    // is by definition inactive-for-30+-days.
    const recentlyActiveIds = new Set<string>();
    for (const row of recentAttendanceRes.data ?? []) {
      const cid = (row as { child_id: string }).child_id;
      if (activeChildIds.has(cid)) recentlyActiveIds.add(cid);
    }
    let inactive30dCount = 0;
    for (const id of activeChildIds) {
      if (!recentlyActiveIds.has(id)) inactive30dCount += 1;
    }

    return {
      newThisWeekCount,
      noCentreCount,
      assessmentsOverdueCount,
      inactive30dCount,
    };
  } catch (err) {
    console.error("getChildrenStatusPulse error:", err);
    return {
      newThisWeekCount: 0,
      noCentreCount: 0,
      assessmentsOverdueCount: 0,
      inactive30dCount: 0,
    };
  }
}

// ============================================================
// Children pulse — compare variant
// ============================================================
//
// Only the time-windowed "new this week" count has a meaningful
// prior-period equivalent — the other three (no centre, overdue,
// inactive) are point-in-time states. The wrapper returns just the
// previous `newCount` so the UI can render a delta on that one card.

export async function getChildrenStatusPulseWithCompare(opts?: {
  compareTo?: PeriodKey;
}): Promise<{
  current: ChildrenStatusPulse;
  previous?: { newCount: number };
  compareLabel?: string;
}> {
  const current = await getChildrenStatusPulse();
  if (!opts?.compareTo) return { current };

  try {
    const win = await resolveCompareWindow(opts.compareTo);
    const newCount = await countRowsInWindow({
      table: "children",
      dateColumn: "created_at",
      startIso: win.startIso,
      endIso: win.endIso,
    });
    return {
      current,
      previous: { newCount },
      compareLabel: win.period.label,
    };
  } catch (err) {
    console.error("getChildrenStatusPulseWithCompare error:", err);
    return { current };
  }
}
