import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Package,
  Trophy,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  BookableSession,
  Booking,
  BookingChildEntry,
  PackageBalance,
  Package as PackageType,
  WaitlistEntry,
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

  // Fetch all data in parallel
  const [
    waitlistResult,
    upcomingResult,
    pastResult,
    packageBalancesResult,
  ] = await Promise.all([
    // Waitlist offers
    supabase
      .from("waitlist")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "offered")
      .gt("offer_expires_at", now)
      .order("offer_expires_at", { ascending: true }),

    // Upcoming bookings
    supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "confirmed")
      .gte("bookable_sessions.date", today)
      .order("created_at", { ascending: true }),

    // Past bookings (for stats + recent activity)
    supabase
      .from("bookings")
      .select("*, bookable_sessions(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "confirmed")
      .lt("bookable_sessions.date", today)
      .order("created_at", { ascending: false }),

    // Package balances
    supabase
      .from("package_balances")
      .select("*, packages(*)")
      .eq("parent_id", parentProfile.id)
      .eq("status", "active"),
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
  const packageBalances = (packageBalancesResult.data ?? []) as Array<
    Record<string, unknown> & PackageBalance
  >;

  // Filter upcoming to only those with a valid future session date
  const upcomingBookings = allUpcoming.filter((b) => {
    const session = (b as Record<string, unknown>).bookable_sessions as BookableSession | null;
    return session && session.date >= today;
  });

  // Filter past to only those with a valid past session date
  const pastBookings = allPast.filter((b) => {
    const session = (b as Record<string, unknown>).bookable_sessions as BookableSession | null;
    return session && session.date < today;
  });

  // Quick stats
  const totalAttended = pastBookings.length;
  const uniqueSports = new Set(
    pastBookings
      .map((b) => {
        const session = (b as Record<string, unknown>).bookable_sessions as BookableSession | null;
        return session?.sport;
      })
      .filter(Boolean)
  );

  // Recent activity (last 3 completed)
  const recentActivity = pastBookings.slice(0, 3);

  return (
    <div className="space-y-6 pb-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">
          Hi {parentProfile.first_name}!
        </h1>
        <p className="text-[#666666] mt-1">
          Here&apos;s what&apos;s happening with your kids&apos; sessions
        </p>
      </div>

      {/* Waitlist Offers */}
      {waitlistOffers.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#E8712A]">
            <AlertCircle className="inline h-4 w-4 mr-1 -mt-0.5" />
            Spots Available — Act Fast!
          </h2>
          {waitlistOffers.map((entry) => {
            const session = (entry as Record<string, unknown>)
              .bookable_sessions as BookableSession | null;
            if (!session) return null;
            return (
              <div
                key={entry.id}
                className="rounded-xl border-2 border-[#E8712A] bg-orange-50 p-5 shadow-sm"
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
                  <Link href={`/parent/book/${session.id}?waitlist=${entry.id}`}>
                    <Button className="bg-[#E8712A] hover:bg-[#d4651f] text-white min-h-[44px] min-w-[44px]">
                      Confirm Spot
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming Bookings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Upcoming Sessions
          </h2>
          <Link
            href="/parent/bookings"
            className="text-sm text-[#E8712A] hover:underline font-medium"
          >
            View all
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="rounded-xl border border-orange-100 bg-white p-8 shadow-sm text-center">
            <Calendar className="h-10 w-10 text-orange-200 mx-auto mb-3" />
            <p className="text-[#1A1A1A] font-medium">No upcoming sessions</p>
            <p className="text-sm text-[#666666] mt-1 mb-4">
              Browse available sessions and book a spot for your kids
            </p>
            <Link href="/parent/book">
              <Button className="bg-[#E8712A] hover:bg-[#d4651f] text-white min-h-[44px]">
                Browse &amp; Book
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingBookings.map((booking) => {
              const session = (booking as Record<string, unknown>)
                .bookable_sessions as BookableSession;
              const children = booking.children_json as BookingChildEntry[];
              const days = daysUntil(session.date);

              return (
                <Link
                  key={booking.id}
                  href={`/parent/bookings/${booking.id}`}
                  className="group rounded-xl border border-orange-100 bg-white p-5 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all"
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
                    {children.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {children.map((c) => c.child_name).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-orange-50 flex items-center justify-end text-xs font-medium text-[#E8712A] group-hover:underline">
                    View Details
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Package Balances + Quick Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Package Balances */}
        {packageBalances.length > 0 ? (
          packageBalances.map((bal) => {
            const pkg = (bal as Record<string, unknown>).packages as PackageType | null;
            const expiresDate = new Date(bal.expires_at);
            const daysToExpiry = Math.ceil(
              (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            const expiringSoon = daysToExpiry <= 7 && daysToExpiry > 0;
            const pct =
              bal.total_sessions > 0
                ? Math.round(
                    (bal.remaining_sessions / bal.total_sessions) * 100
                  )
                : 0;

            return (
              <div
                key={bal.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  expiringSoon
                    ? "border-amber-300 bg-amber-50/30"
                    : "border-orange-100"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Package className="h-5 w-5 text-[#E8712A]" />
                  <h3 className="font-semibold text-[#1A1A1A] text-sm">
                    {pkg?.name ?? "Session Package"}
                  </h3>
                </div>
                <p className="text-2xl font-bold text-[#1A1A1A]">
                  {bal.remaining_sessions}
                  <span className="text-sm font-normal text-[#666666]">
                    {" "}
                    / {bal.total_sessions} sessions
                  </span>
                </p>
                {/* Progress bar */}
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      expiringSoon ? "bg-amber-400" : "bg-[#E8712A]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p
                  className={`text-xs mt-2 ${
                    expiringSoon
                      ? "text-amber-600 font-medium"
                      : "text-[#666666]"
                  }`}
                >
                  {expiringSoon && (
                    <AlertCircle className="inline h-3 w-3 mr-1 -mt-0.5" />
                  )}
                  Expires{" "}
                  {expiresDate.toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-orange-200" />
              <h3 className="font-semibold text-[#1A1A1A] text-sm">
                Session Packages
              </h3>
            </div>
            <p className="text-sm text-[#666666] mb-3">
              Save with multi-session packages
            </p>
            <Link href="/parent/packages">
              <Button
                variant="outline"
                className="border-[#E8712A] text-[#E8712A] hover:bg-orange-50 min-h-[44px] text-sm"
              >
                Buy a Package
              </Button>
            </Link>
          </div>
        )}

        {/* Quick Stat: Sessions Attended */}
        <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-5 w-5 text-[#E8712A]" />
            <h3 className="font-semibold text-[#1A1A1A] text-sm">
              Sessions Attended
            </h3>
          </div>
          <p className="text-3xl font-bold text-[#1A1A1A] mt-2">
            {totalAttended}
          </p>
          <p className="text-xs text-[#666666] mt-1">Total completed sessions</p>
        </div>

        {/* Quick Stat: Sports Tried */}
        <div className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-5 w-5 text-[#E8712A]" />
            <h3 className="font-semibold text-[#1A1A1A] text-sm">
              Sports Tried
            </h3>
          </div>
          <p className="text-3xl font-bold text-[#1A1A1A] mt-2">
            {uniqueSports.size}
          </p>
          {uniqueSports.size > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from(uniqueSports)
                .slice(0, 4)
                .map((sport) => (
                  <Badge
                    key={sport as string}
                    variant="secondary"
                    className="bg-orange-50 text-[#E8712A] border-orange-200 text-xs"
                  >
                    {sport as string}
                  </Badge>
                ))}
              {uniqueSports.size > 4 && (
                <Badge
                  variant="secondary"
                  className="bg-gray-100 text-[#666666] text-xs"
                >
                  +{uniqueSports.size - 4} more
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            Recent Activity
          </h2>
          <div className="space-y-2">
            {recentActivity.map((booking) => {
              const session = (booking as Record<string, unknown>)
                .bookable_sessions as BookableSession;
              const children = booking.children_json as BookingChildEntry[];

              return (
                <div
                  key={booking.id}
                  className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm flex items-center gap-4"
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
                      {children.length > 0 && (
                        <span>
                          {children.map((c) => c.child_name).join(", ")}
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

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/parent/book"
          className="group flex items-center gap-3 rounded-xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">
              Book a Session
            </p>
            <p className="text-xs text-[#666666]">Browse available sessions</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>

        <Link
          href="/parent/kids"
          className="group flex items-center gap-3 rounded-xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">My Kids</p>
            <p className="text-xs text-[#666666]">Manage profiles</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>

        <Link
          href="/parent/bookings"
          className="group flex items-center gap-3 rounded-xl bg-white p-4 border border-orange-100 shadow-sm hover:shadow-md hover:border-[#E8712A]/30 transition-all min-h-[44px]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-[#E8712A] group-hover:bg-[#E8712A] group-hover:text-white transition-colors flex-shrink-0">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1A1A1A] text-sm">
              All Bookings
            </p>
            <p className="text-xs text-[#666666]">View booking history</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[#666666] group-hover:text-[#E8712A] transition-colors flex-shrink-0" />
        </Link>
      </div>
    </div>
  );
}
