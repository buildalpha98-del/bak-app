import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getCoachNextSession,
  getCoachPendingActions,
  getLatestAnnouncement,
} from "@/lib/sessions/coach-actions";
import { getIncomingSwapRequests } from "@/lib/sessions/shift-actions";
import { getCoachEarnings } from "@/lib/pay-rates/actions";
import { NextSessionCard } from "@/components/coach/home/next-session-card";
import { PendingActionsCard } from "@/components/coach/home/pending-actions-card";
import { LatestAnnouncement } from "@/components/coach/home/latest-announcement";
import { SwapRequestInbox } from "@/components/coach/schedule/swap-request-inbox";
import { EarningsWidget } from "@/components/pay-rates/earnings-widget";

export default async function CoachDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [nextSessionRes, pendingRes, announcementRes, swapInboxRes, earningsRes] =
    await Promise.all([
      getCoachNextSession(user.id),
      getCoachPendingActions(user.id),
      getLatestAnnouncement(user.id),
      getIncomingSwapRequests(user.id),
      getCoachEarnings(),
    ]);

  const firstError =
    nextSessionRes.error ||
    pendingRes.error ||
    announcementRes.error ||
    swapInboxRes.error ||
    earningsRes.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-foreground font-heading animate-fade-up">Home</h1>

      {/* Swap request inbox (above next session) */}
      {swapInboxRes.data && swapInboxRes.data.length > 0 && (
        <div className="animate-fade-up stagger-1">
          <SwapRequestInbox requests={swapInboxRes.data} />
        </div>
      )}

      {/* Hero: Next Session */}
      <div className="animate-fade-up stagger-1">
        <NextSessionCard session={nextSessionRes.data ?? null} />
      </div>

      {/* Pending Actions */}
      {pendingRes.data && (
        <div className="animate-fade-up stagger-2">
          <PendingActionsCard counts={pendingRes.data} />
        </div>
      )}

      {/* Earnings Widget */}
      <div className="animate-fade-up stagger-3">
        <EarningsWidget earnings={earningsRes.data ?? null} />
      </div>

      {/* Latest Announcement */}
      <div className="animate-fade-up stagger-4">
        <LatestAnnouncement announcement={announcementRes.data ?? null} />
      </div>
    </div>
  );
}
