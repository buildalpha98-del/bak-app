import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getTodaysSessions,
  getWeekSessions,
} from "@/lib/launch/coach-dashboard-actions";
import {
  getCoachNextSession,
  getCoachPendingActions,
  getLatestAnnouncement,
} from "@/lib/sessions/coach-actions";
import { getIncomingSwapRequests } from "@/lib/sessions/shift-actions";
import { getCoachStatusPulse } from "@/lib/coach/status-pulse-actions";
import { CoachTodayDashboard } from "@/components/launch/coach-today-dashboard";
import { PendingActionsCard } from "@/components/coach/home/pending-actions-card";
import { LatestAnnouncement } from "@/components/coach/home/latest-announcement";
import { SwapRequestInbox } from "@/components/coach/schedule/swap-request-inbox";
import { CoachContextStrip } from "@/components/coach/home/coach-context-strip";
import { CoachQuickActions } from "@/components/coach/home/coach-quick-actions";
import { CoachSummaryCards } from "@/components/coach/home/coach-summary-cards";

export default async function CoachDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    todayRes,
    weekRes,
    nextSessionRes,
    pendingRes,
    announcementRes,
    swapInboxRes,
    pulse,
    profileRes,
  ] = await Promise.all([
    getTodaysSessions(user.id),
    getWeekSessions(user.id),
    getCoachNextSession(user.id),
    getCoachPendingActions(user.id),
    getLatestAnnouncement(user.id),
    getIncomingSwapRequests(user.id),
    getCoachStatusPulse(user.id),
    supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single(),
  ]);

  // Get next session date for "no sessions today" state
  const nextSessionDate = nextSessionRes.data?.date ?? null;

  // First name for greeting — fall back to email user part.
  const fullName = profileRes.data?.name ?? user.email ?? "Coach";
  const firstName = fullName.split(" ")[0] || "Coach";

  // Week count (excludes today — `getWeekSessions` already excludes today)
  const weekCount = (weekRes.data ?? []).reduce(
    (acc, d) => acc + d.sessions.length,
    0,
  );

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Sticky greeting + pulse */}
      <CoachContextStrip firstName={firstName} pulse={pulse} />

      {/* Swap request inbox (above sessions) */}
      {swapInboxRes.data && swapInboxRes.data.length > 0 && (
        <div className="animate-fade-up">
          <SwapRequestInbox requests={swapInboxRes.data} />
        </div>
      )}

      {/* Quick actions row */}
      <div className="animate-fade-up stagger-1">
        <CoachQuickActions
          shiftsCount={pulse.shiftsToConfirmCount || undefined}
          formsCount={pulse.overdueFormsCount || undefined}
        />
      </div>

      {/* Summary cards */}
      <div className="animate-fade-up stagger-2">
        <CoachSummaryCards
          todayCount={pulse.shiftsTodayCount}
          weekCount={weekCount}
          overdueFormsCount={pulse.overdueFormsCount}
          unreadAnnouncementsCount={pulse.unreadAnnouncementsCount}
        />
      </div>

      {/* Today-first dashboard */}
      <div className="animate-fade-up stagger-3">
        <CoachTodayDashboard
          initialSessions={todayRes.data}
          weekDays={weekRes.data}
          coachId={user.id}
          nextSessionDate={nextSessionDate}
        />
      </div>

      {/* Pending Actions */}
      {pendingRes.data && (
        <div className="animate-fade-up stagger-4">
          <PendingActionsCard counts={pendingRes.data} />
        </div>
      )}

      {/* Latest Announcement */}
      <div className="animate-fade-up stagger-5">
        <LatestAnnouncement announcement={announcementRes.data ?? null} />
      </div>
    </div>
  );
}
