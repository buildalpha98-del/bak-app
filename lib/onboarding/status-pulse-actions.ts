"use server";

// ============================================================
// Onboarding — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /ops/onboarding (and
// /admin's mirror, if we wire one). Four counts surface "what to
// look at first":
//
//   1. In progress         — `centre_onboarding_checklists.status='in_progress'`.
//      Total open onboardings (matches the existing widget headline).
//   2. Behind schedule >14d — open checklists where `started_at`
//      is older than 14 days. Maps to the existing "Stalled" badge.
//   3. Completed this week  — checklists with status='completed'
//      AND `completed_at >= Monday`. Lets ops feel the wins.
//   4. Waiting on email     — rows in `centre_onboarding_emails`
//      with `sent_at IS NULL` AND `error_text IS NULL` — i.e. queued
//      for the cron but not yet dispatched. Migration 049 made
//      sent_at nullable specifically for this state.
//
// Implementation notes:
//   - All four use `head: true` counts to skip row data.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page — mirrors the staff / centres / marketing
//     pulse patterns.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface OnboardingStatusPulse {
  inProgressCount: number;
  behindScheduleCount: number;
  completedThisWeekCount: number;
  waitingOnEmailCount: number;
}

export async function getOnboardingStatusPulse(): Promise<OnboardingStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const monday = getMonday(new Date());
    const mondayIso = monday.toISOString();

    // 14 days ago — anything older that is still "in_progress" is
    // behind schedule, in line with the existing widget's "Stalled"
    // threshold.
    const fourteenDaysAgoIso = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [inProgressRes, behindRes, completedRes, waitingRes] =
      await Promise.all([
        supabase
          .from("centre_onboarding_checklists")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress"),
        supabase
          .from("centre_onboarding_checklists")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress")
          .lt("started_at", fourteenDaysAgoIso),
        supabase
          .from("centre_onboarding_checklists")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("completed_at", mondayIso),
        supabase
          .from("centre_onboarding_emails")
          .select("id", { count: "exact", head: true })
          .is("sent_at", null)
          .is("error_text", null),
      ]);

    return {
      inProgressCount: inProgressRes.count ?? 0,
      behindScheduleCount: behindRes.count ?? 0,
      completedThisWeekCount: completedRes.count ?? 0,
      waitingOnEmailCount: waitingRes.count ?? 0,
    };
  } catch (err) {
    console.error("getOnboardingStatusPulse error:", err);
    return {
      inProgressCount: 0,
      behindScheduleCount: 0,
      completedThisWeekCount: 0,
      waitingOnEmailCount: 0,
    };
  }
}
