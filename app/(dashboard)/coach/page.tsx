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
import { CoachTodayDashboard } from "@/components/launch/coach-today-dashboard";
import { PendingActionsCard } from "@/components/coach/home/pending-actions-card";
import { LatestAnnouncement } from "@/components/coach/home/latest-announcement";
import { SwapRequestInbox } from "@/components/coach/schedule/swap-request-inbox";

export default async function CoachDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [todayRes, weekRes, nextSessionRes, pendingRes, announcementRes, swapInboxRes] =
    await Promise.all([
      getTodaysSessions(user.id),
      getWeekSessions(user.id),
      getCoachNextSession(user.id),
      getCoachPendingActions(user.id),
      getLatestAnnouncement(user.id),
      getIncomingSwapRequests(user.id),
    ]);

  // Get next session date for "no sessions today" state
  const nextSessionDate = nextSessionRes.data?.date ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Swap request inbox (above sessions) */}
      {swapInboxRes.data && swapInboxRes.data.length > 0 && (
        <div className="animate-fade-up">
          <SwapRequestInbox requests={swapInboxRes.data} />
        </div>
      )}

      {/* Today-first dashboard */}
      <div className="animate-fade-up stagger-1">
        <CoachTodayDashboard
          initialSessions={todayRes.data}
          weekDays={weekRes.data}
          coachId={user.id}
          nextSessionDate={nextSessionDate}
        />
      </div>

      {/* Pending Actions */}
      {pendingRes.data && (
        <div className="animate-fade-up stagger-2">
          <PendingActionsCard counts={pendingRes.data} />
        </div>
      )}

      {/* Latest Announcement */}
      <div className="animate-fade-up stagger-3">
        <LatestAnnouncement announcement={announcementRes.data ?? null} />
      </div>
    </div>
  );
}
