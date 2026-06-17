import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Package,
  Trophy,
  ArrowRight,
  AlertCircle,
  Gift,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ParentHomePulseStrip } from "@/components/parent/parent-status-pulse";
import { ParentHomeSummaryCards } from "@/components/parent/parent-home-summary-cards";
import { ParentChildAvatarsRow } from "@/components/parent/parent-child-avatars-row";
import { getParentStatusPulse } from "@/lib/parent/status-pulse-actions";
import { getCalendarToken } from "@/lib/calendar/actions";
import { CalendarSubscribeButton } from "@/components/calendar/calendar-subscribe-button";
import type {
  BookableSession,
  Booking,
  BookingChildEntry,
  WaitlistEntry,
  Child,
  ParentChild,
  Payment,
} from "@/lib/types/database";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m}${ampm}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function timeUntil(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export default async function ParentDashboard() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/parent-login");

  const { data: parentProfile } = await supabase
    .from("parent_profiles")
    .select("id, first_name, last_name")
    .eq("user_id", user.id)
    .single();

  if (!parentProfile) redirect("/parent/register");

  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    pulse,
    waitlistResult,
    upcomingResult,
    pastResult,
    childrenResult,
    monthPaymentsResult,
  ] = await Promise.all([
    getParentStatusPulse(),
    supabase
      .from("waitlist")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "offered")
      .gt("offer_expires_at", now)
      .order("offer_expires_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "confirmed")
      .gte("bookable_sessions.date", today)
      .order("created_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "confirmed")
      .lt("bookable_sessions.date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("parent_children")
      .select("*, children(*)")
      .eq("parent_id", parentProfile.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("amount_cents, status, refund_amount_cents")
      .eq("parent_id", parentProfile.id)
      .eq("status", "completed")
      .gte("created_at", monthStart.toISOString()),
  ]);

  const waitlistOffers = (waitlistResult.data ?? []) as Array<
    Record<string, unknown> & WaitlistEntry
  >;
  const allUpcoming = (upcomingResult.data ?? []) as Array<
    Record<string, unknown> & Booking
  >;
  const allPast = (pastResult.data ?? []) as Array<
    Record<string, unknown> & Booking
  >;
  const parentChildren = (childrenResult.data ?? []) as Array<
    Record<string, unknown> & ParentChild
  >;
  const monthPayments = (monthPaymentsResult.data ?? []) as Array<
    Pick<Payment, "amount_cents" | "status" | "refund_amount_cents">
  >;

  const upcomingBookings = allUpcoming.filter((b) => {
    const session = (b as Record<string, unknown>).bookable_sessions as
      | BookableSession
      | null;
    return session && session.date >= today;
  });

  const pastBookings = allPast.filter((b) => {
    const session = (b as Record<string, unknown>).bookable_sessions as
      | BookableSession
      | null;
    return session && session.date < today;
  });

  // Summary stats — booked, completed, spend this month, child count
  const totalBooked = allUpcoming.length + allPast.length;
  const totalCompleted = pastBookings.length;
  const totalSpendMonthCents = monthPayments.reduce(
    (sum, p) => sum + p.amount_cents - (p.refund_amount_cents ?? 0),
    0,
  );
  const children = parentChildren
    .map((pc) => (pc as Record<string, unknown>).children as Child | null)
    .filter((c): c is Child => Boolean(c));

  const recentActivity = pastBookings.slice(0, 3);

  const { token: parentCalToken } = await getCalendarToken(
    "parent",
    parentProfile.id,
  );
  const parentFeedUrl = parentCalToken
    ? `https://buildalphakids.app/api/calendar/parent/${parentCalToken}.ics`
    : null;

  return (
    <div className="space-y-6 pb-8">
      {/* Greeting + calendar subscribe */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">
            Hi {parentProfile.first_name}!
          </h1>
          <p className="text-[#666666]">
            Here&apos;s what&apos;s happening with your kids&apos; sessions.
          </p>
        </div>
        {parentFeedUrl && (
          <CalendarSubscribeButton
            feedUrl={parentFeedUrl}
            label="your family bookings"
          />
        )}
      </div>

      {/* Status pulse */}
      <ParentHomePulseStrip pulse={pulse} />

      {/* Child avatars row */}
      {children.length > 0 && (
        <ParentChildAvatarsRow children={children} />
      )}

      {/* Summary cards (count-up) */}
      <ParentHomeSummaryCards
        sessionsBooked={totalBooked}
        sessionsCompleted={totalCompleted}
        spendMonthCents={totalSpendMonthCents}
        childCount={children.length}
      />

      {/* Quick action row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/parent/book"
          className="group flex items-center gap-3 rounded-2xl bg-[#E8712A] p-4 text-white shadow-sm hover:shadow-md transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Book a session</p>
            <p className="text-xs text-white/80">Browse what&apos;s on</p>
          </div>
          <ArrowRight className="h-4 w-4 flex-shrink-0" />
        </Link>

        <Link
          href="/parent/bookings"
          className="group flex items-center gap-3 rounded-2xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">My bookings</p>
            <p className="text-xs text-[#666666]">Upcoming & past</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>

        <Link
          href="/parent/kids"
          className="group flex items-center gap-3 rounded-2xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">My kids</p>
            <p className="text-xs text-[#666666]">Profiles & progress</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>

        <Link
          href="/parent/packages"
          className="group flex items-center gap-3 rounded-2xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">Session packs</p>
            <p className="text-xs text-[#666666]">Save when you bundle</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>
      </div>

      {/* Waitlist Offers — urgent surface */}
      {waitlistOffers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E8712A]">
            <AlertCircle className="inline h-4 w-4 mr-1 -mt-0.5" />
            Spots available — act fast
          </h2>
          {waitlistOffers.map((entry) => {
            const session = (entry as Record<string, unknown>)
              .bookable_sessions as BookableSession | null;
            if (!session) return null;
            return (
              <div
                key={entry.id}
                className="rounded-2xl border-2 border-[#E8712A] bg-orange-50 p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#1A1A1A]">
                      {session.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#666666]">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(session.date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(session.start_time)} –{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[#E8712A]">
                      {entry.offer_expires_at
                        ? timeUntil(entry.offer_expires_at)
                        : "Limited time"}
                    </p>
                  </div>
                  <Button
                    className="bg-[#E8712A] hover:bg-[#d4651f] text-white min-h-[44px] min-w-[44px]"
                    render={
                      <Link
                        href={`/parent/book/${session.id}?waitlist=${entry.id}`}
                      />
                    }
                  >
                    Confirm spot
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming sessions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Upcoming sessions
          </h2>
          <Link
            href="/parent/bookings"
            className="text-sm text-[#E8712A] hover:underline font-medium"
          >
            View all
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="rounded-2xl border border-orange-100 bg-white p-8 shadow-sm text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#E8712A] mx-auto mb-3">
              <Calendar className="h-7 w-7" />
            </div>
            <p className="text-[#1A1A1A] font-medium">No upcoming sessions</p>
            <p className="text-sm text-[#666666] mt-1 mb-4">
              Browse available sessions and book a spot for your kids.
            </p>
            <Button
              className="bg-[#E8712A] hover:bg-[#d4651f] text-white min-h-[44px]"
              render={<Link href="/parent/book" />}
            >
              Browse &amp; book
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingBookings.slice(0, 6).map((booking) => {
              const session = (booking as Record<string, unknown>)
                .bookable_sessions as BookableSession;
              const childrenArr = booking.children_json as BookingChildEntry[];
              const days = daysUntil(session.date);

              return (
                <Link
                  key={booking.id}
                  href={`/parent/bookings/${booking.id}`}
                  className="group rounded-2xl border border-orange-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="font-semibold text-[#1A1A1A] truncate">
                        {session.title}
                      </p>
                      {session.sport && (
                        <Badge
                          variant="secondary"
                          className="bg-orange-50 text-[#E8712A] border-orange-200 text-xs"
                        >
                          {session.sport}
                        </Badge>
                      )}
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ml-2 ${
                        days === 0
                          ? "bg-[#E8712A] text-white"
                          : days <= 2
                            ? "bg-orange-100 text-[#E8712A]"
                            : "bg-gray-100 text-[#666666]"
                      }`}
                    >
                      {countdownLabel(session.date)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-[#666666]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{formatDate(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {formatTime(session.start_time)} –{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    {(session.location_name || session.location_address) && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {session.location_name ?? session.location_address}
                        </span>
                      </div>
                    )}
                    {childrenArr.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {childrenArr.map((c) => c.child_name).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-orange-50 flex items-center justify-end text-xs font-medium text-[#E8712A] group-hover:underline">
                    View details
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Recent activity
          </h2>
          <div className="space-y-2">
            {recentActivity.map((booking) => {
              const session = (booking as Record<string, unknown>)
                .bookable_sessions as BookableSession;
              const childrenArr = booking.children_json as BookingChildEntry[];

              return (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] flex-shrink-0">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#1A1A1A] text-sm truncate">
                      {session.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#666666]">
                      <span>{formatDate(session.date)}</span>
                      {session.sport && <span>{session.sport}</span>}
                      {childrenArr.length > 0 && (
                        <span>
                          {childrenArr.map((c) => c.child_name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Friendly footer surfaces — referrals + insights */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/parent/referrals"
          className="group flex items-start gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 hover:-translate-y-0.5 transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] flex-shrink-0">
            <Gift className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A]">
              Refer a friend, earn rewards
            </p>
            <p className="text-sm text-[#666666] mt-0.5">
              $5 credit per referral plus a free session after 3 sign-ups.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors mt-1.5 flex-shrink-0" />
        </Link>

        {children.length > 0 && (
          <Link
            href={`/parent/kids/${children[0].id}/insights`}
            className="group flex items-start gap-3 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 hover:-translate-y-0.5 transition-all"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[#1A1A1A]">
                See how your kids are growing
              </p>
              <p className="text-sm text-[#666666] mt-0.5">
                AI-powered development insights from our coaches.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors mt-1.5 flex-shrink-0" />
          </Link>
        )}
      </div>
    </div>
  );
}
