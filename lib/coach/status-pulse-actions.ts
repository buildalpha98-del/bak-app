"use server";

// ============================================================
// Coach home — status pulse server action
// ============================================================
//
// Mirrors the admin / ops command-centre pulses. Surfaces the four
// counts that drive a coach's morning sweep on the home screen:
//
//   1. Shifts today                — `sessions` with date = today and
//                                    coach_id = me (any non-cancelled
//                                    status). Drives the "what's on my
//                                    plate right now" greeting line.
//   2. Shifts to confirm           — `sessions.status='pending_confirmation'`
//                                    assigned to me. Single tap from the
//                                    home strip into the bulk-confirm
//                                    dialog on /coach/schedule.
//   3. Overdue forms               — sessions in the past for me that
//                                    are completed but have no matching
//                                    `form_submissions` row. Proxy for
//                                    "I need to submit a form on a
//                                    session that's already done".
//   4. Unread announcements        — announcements visible to coaches
//                                    where I have no `announcement_reads`
//                                    row for them.
//
// Implementation notes:
//   - All counts run in parallel and use `head: true` where possible.
//   - Dates are Sydney-local (Australia/Sydney) — mirrors the rest of
//     the coach surface (see `getTodaysSessions`).
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the strip.
//   - This is the ONLY place we read pulse counts from. Other pages
//     can reuse the result by accepting it as an `initialData` prop.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CoachStatusPulse {
  shiftsTodayCount: number;
  shiftsToConfirmCount: number;
  overdueFormsCount: number;
  unreadAnnouncementsCount: number;
}

function sydneyTodayStr(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Sydney",
  });
}

export async function getCoachStatusPulse(
  coachId: string,
): Promise<CoachStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();

    // 1. Shifts today (any active status).
    const shiftsTodayPromise = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("date", today)
      .neq("status", "cancelled");

    // 2. Shifts assigned to me awaiting confirmation.
    const shiftsToConfirmPromise = supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .eq("status", "pending_confirmation");

    // 3. Completed past sessions without a form submission. We fetch
    //    the past completed sessions (capped at 50 — anything older
    //    isn't really "actionable") and then a single lookup of
    //    submission session_ids to subtract.
    const recentCompletedPromise = supabase
      .from("sessions")
      .select("id")
      .eq("coach_id", coachId)
      .eq("status", "completed")
      .lt("date", today)
      .order("date", { ascending: false })
      .limit(50);

    // 4. Unread announcements visible to coaches.
    const announcementsPromise = supabase
      .from("announcements")
      .select("id, announcement_reads!left(user_id)")
      .in("audience", ["all", "ops_and_coaches", "coaches_only"])
      .order("created_at", { ascending: false })
      .limit(50);

    const [
      shiftsTodayRes,
      shiftsToConfirmRes,
      recentCompletedRes,
      announcementsRes,
    ] = await Promise.all([
      shiftsTodayPromise,
      shiftsToConfirmPromise,
      recentCompletedPromise,
      announcementsPromise,
    ]);

    // Overdue forms count
    let overdueFormsCount = 0;
    const completedSessionIds = (recentCompletedRes.data ?? []).map(
      (r) => r.id as string,
    );
    if (completedSessionIds.length > 0) {
      const { data: submittedRows } = await supabase
        .from("form_submissions")
        .select("session_id")
        .in("session_id", completedSessionIds)
        .eq("submitted_by", coachId);
      const submittedSet = new Set(
        (submittedRows ?? []).map((r) => r.session_id as string),
      );
      overdueFormsCount = completedSessionIds.filter(
        (sid) => !submittedSet.has(sid),
      ).length;
    }

    // Unread announcements
    const announcements = (announcementsRes.data ?? []) as Array<{
      id: string;
      announcement_reads: Array<{ user_id: string }> | null;
    }>;
    const unreadAnnouncementsCount = announcements.filter((a) => {
      const reads = a.announcement_reads ?? [];
      return !reads.some((r) => r.user_id === coachId);
    }).length;

    return {
      shiftsTodayCount: shiftsTodayRes.count ?? 0,
      shiftsToConfirmCount: shiftsToConfirmRes.count ?? 0,
      overdueFormsCount,
      unreadAnnouncementsCount,
    };
  } catch (err) {
    console.error("getCoachStatusPulse error:", err);
    return {
      shiftsTodayCount: 0,
      shiftsToConfirmCount: 0,
      overdueFormsCount: 0,
      unreadAnnouncementsCount: 0,
    };
  }
}

// ============================================================
// Schedule-page-specific pulse
// ============================================================

export interface CoachSchedulePulse {
  todayCount: number;
  toConfirmCount: number;
  pastUnconfirmedCount: number;
}

/**
 * Three counts shown above the coach schedule:
 *   - today           shifts today (any active status)
 *   - to confirm      pending_confirmation assigned to me
 *   - past unconfirmed past sessions still pending_confirmation
 *                     (drift signal — should always be zero)
 */
export async function getCoachSchedulePulse(
  coachId: string,
): Promise<CoachSchedulePulse> {
  try {
    const supabase = await createSupabaseServerClient();
    const today = sydneyTodayStr();

    const [todayRes, toConfirmRes, pastUnconfirmedRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("date", today)
        .neq("status", "cancelled"),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "pending_confirmation"),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId)
        .eq("status", "pending_confirmation")
        .lt("date", today),
    ]);

    return {
      todayCount: todayRes.count ?? 0,
      toConfirmCount: toConfirmRes.count ?? 0,
      pastUnconfirmedCount: pastUnconfirmedRes.count ?? 0,
    };
  } catch (err) {
    console.error("getCoachSchedulePulse error:", err);
    return {
      todayCount: 0,
      toConfirmCount: 0,
      pastUnconfirmedCount: 0,
    };
  }
}
