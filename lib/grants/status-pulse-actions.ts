"use server";

// ============================================================
// Grants — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/grants. Four
// counts surface "what to look at first":
//
//   1. Awaiting submission   — `grant_applications` rows still in
//      'planning' status. The "haven't pulled the trigger" cohort.
//   2. Expiring within 30d   — funded grants whose `funding_end_date`
//      lands within the next 30 days AND still has remaining balance.
//      Loss-avoidance signal — unspent grant money is gone money.
//   3. Stuck in planning     — planning-status rows older than 14
//      days. Conversion-velocity signal.
//   4. Approved this week    — applications whose status flipped to
//      approved (approved_date >= Monday). Velocity win signal.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface GrantsStatusPulse {
  awaitingSubmissionCount: number;
  expiringSoonCount: number;
  stuckInPlanningCount: number;
  approvedThisWeekCount: number;
}

export async function getGrantsStatusPulse(): Promise<GrantsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const thirtyDaysOut = new Date(now);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const thirtyDaysOutIso = thirtyDaysOut.toISOString().slice(0, 10);
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenDaysAgoIso = fourteenDaysAgo.toISOString();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString().slice(0, 10);

    const [planningRes, expiringRes, stuckRes, approvedThisWeekRes] =
      await Promise.all([
        supabase
          .from("grant_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "planning"),
        // Expiring soon — funded with remaining balance
        supabase
          .from("grant_applications")
          .select("amount_approved, amount_used, funding_end_date")
          .eq("status", "funded")
          .gte("funding_end_date", today)
          .lte("funding_end_date", thirtyDaysOutIso),
        supabase
          .from("grant_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "planning")
          .lt("created_at", fourteenDaysAgoIso),
        supabase
          .from("grant_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .gte("approved_date", mondayIso),
      ]);

    // Filter expiring rows down to those with remaining balance > 0
    const expiringSoonCount = (expiringRes.data ?? []).filter((row) => {
      const r = row as {
        amount_approved: number | null;
        amount_used: number | null;
      };
      const approved = Number(r.amount_approved ?? 0);
      const used = Number(r.amount_used ?? 0);
      return approved - used > 0;
    }).length;

    return {
      awaitingSubmissionCount: planningRes.count ?? 0,
      expiringSoonCount,
      stuckInPlanningCount: stuckRes.count ?? 0,
      approvedThisWeekCount: approvedThisWeekRes.count ?? 0,
    };
  } catch (err) {
    console.error("getGrantsStatusPulse error:", err);
    return {
      awaitingSubmissionCount: 0,
      expiringSoonCount: 0,
      stuckInPlanningCount: 0,
      approvedThisWeekCount: 0,
    };
  }
}
