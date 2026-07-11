"use client";

// ============================================================
// Parent — My Bookings (client surface)
// ============================================================
//
// Four tabs: Upcoming / Past / Cancelled / Waitlist with URL
// persistence so back/forward works. A parent pulse strip rides at
// the top of the page, computed from in-memory tab counts plus the
// data passed down — keeps everything reactive on cancel/cancel-
// waitlist without an extra round trip. UI uses the warmer rounded-
// 2xl + hover-lift treatment.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  getParentBookings,
  cancelBooking,
} from "@/lib/bookings/booking-actions";
import {
  getParentWaitlistEntries,
  cancelWaitlistEntry,
} from "@/lib/bookings/actions";
import { ParentPulseStrip } from "@/components/parent/parent-status-pulse";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  Booking,
  BookableSession,
  WaitlistEntry,
} from "@/lib/types/database";
import {
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Users,
  CreditCard,
  Package,
  AlertTriangle,
  Download,
  X,
  CalendarClock,
  BellRing,
} from "lucide-react";

type BookingWithSession = Booking & { session: BookableSession };
type WaitlistWithSession = WaitlistEntry & { session: BookableSession };

type TabKey = "upcoming" | "past" | "cancelled" | "waitlist";

const TABS: { key: TabKey; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "waitlist", label: "Waitlist" },
];

function isValidTab(value: string | null): value is TabKey {
  return (
    value === "upcoming" ||
    value === "past" ||
    value === "cancelled" ||
    value === "waitlist"
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const h = parseInt(hours, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${minutes}${suffix}`;
}

function generateICS(session: BookableSession): string {
  const startDate = session.date.replace(/-/g, "");
  const startTime = session.start_time.replace(/:/g, "").slice(0, 4) + "00";
  const endTime = session.end_time.replace(/:/g, "").slice(0, 4) + "00";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Build Alpha Kids//Booking//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Australia/Sydney",
    "BEGIN:STANDARD",
    "DTSTART:19700405T030000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
    "TZOFFSETFROM:+1100",
    "TZOFFSETTO:+1000",
    "TZNAME:AEST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19701004T020000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=10",
    "TZOFFSETFROM:+1000",
    "TZOFFSETTO:+1100",
    "TZNAME:AEDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Australia/Sydney:${startDate}T${startTime}`,
    `DTEND;TZID=Australia/Sydney:${startDate}T${endTime}`,
    `SUMMARY:${session.title}`,
    `LOCATION:${session.location_name ?? ""}${session.location_address ? ", " + session.location_address : ""}`,
    `DESCRIPTION:Build Alpha Kids session`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(session: BookableSession) {
  const ics = generateICS(session);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${session.title.replace(/\s+/g, "-")}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function isMoreThan24HoursBefore(sessionDate: string, sessionTime: string) {
  const sessionStart = new Date(`${sessionDate}T${sessionTime}`);
  const now = new Date();
  return sessionStart.getTime() - now.getTime() > 24 * 60 * 60 * 1000;
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setRemaining(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      );
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className="font-mono text-sm font-semibold text-primary">
      {remaining}
    </span>
  );
}

export default function ParentBookingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = isValidTab(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : "upcoming";

  const [bookings, setBookings] = useState<BookingWithSession[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingWaitlistId, setCancellingWaitlistId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [bookingsResult, waitlistResult] = await Promise.all([
        getParentBookings(),
        getParentWaitlistEntries(),
      ]);
      if (bookingsResult.data)
        setBookings(bookingsResult.data as BookingWithSession[]);
      if (waitlistResult.data) setWaitlist(waitlistResult.data);
    } catch {
      toast.error("Could not load your bookings. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function changeTab(next: TabKey) {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "upcoming") params.delete("tab");
    else params.set("tab", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPlus7 = new Date();
  todayPlus7.setDate(todayPlus7.getDate() + 7);
  todayPlus7.setHours(23, 59, 59, 999);

  const upcomingBookings = bookings.filter((b) => {
    const sessionDate = new Date(b.session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return (
      sessionDate >= today &&
      (b.status === "confirmed" || b.status === "pending_payment")
    );
  });

  const pastBookings = bookings.filter((b) => {
    const sessionDate = new Date(b.session.date);
    sessionDate.setHours(0, 0, 0, 0);
    return sessionDate < today && b.status === "confirmed";
  });

  const cancelledBookings = bookings.filter(
    (b) =>
      b.status === "cancelled" ||
      b.status === "refunded" ||
      b.status === "no_show",
  );

  // Derived pulse stats
  const todayCount = upcomingBookings.filter((b) => {
    const d = new Date(b.session.date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;
  const thisWeekCount = upcomingBookings.filter((b) => {
    const d = new Date(b.session.date);
    return d >= today && d <= todayPlus7;
  }).length;
  const waitlistOfferCount = waitlist.filter(
    (w) => w.status === "offered",
  ).length;
  const refundPendingCount = cancelledBookings.filter(
    (b) =>
      b.status === "cancelled" &&
      b.total_cents > 0 &&
      isMoreThan24HoursBefore(b.session.date, b.session.start_time),
  ).length;

  async function handleCancel(bookingId: string) {
    setCancellingId(bookingId);
    try {
      const result = await cancelBooking(
        bookingId,
        cancelReason || "Parent cancelled",
      );
      if (result.error) {
        toast.error("Could not cancel booking. Please try again.");
      } else {
        setBookings((prev) =>
          prev.map((b) =>
            b.id === bookingId
              ? {
                  ...b,
                  status: "cancelled" as Booking["status"],
                  cancelled_at: new Date().toISOString(),
                  cancellation_reason: cancelReason || "Parent cancelled",
                }
              : b,
          ),
        );
        setShowCancelDialog(null);
        setCancelReason("");
        toast.success("Booking cancelled successfully.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleCancelWaitlist(waitlistId: string) {
    setCancellingWaitlistId(waitlistId);
    try {
      const result = await cancelWaitlistEntry(waitlistId);
      if (result.error) {
        toast.error("Could not remove you from the waitlist. Please try again.");
      } else {
        setWaitlist((prev) => prev.filter((w) => w.id !== waitlistId));
        toast.success("Removed from waitlist.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCancellingWaitlistId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tabCounts: Record<TabKey, number> = {
    upcoming: upcomingBookings.length,
    past: pastBookings.length,
    cancelled: cancelledBookings.length,
    waitlist: waitlist.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">My bookings</h1>
        <p className="text-[#666666] mt-1">
          Manage your sessions, view history and track waitlist positions.
        </p>
      </div>

      {/* Pulse */}
      <ParentPulseStrip
        stats={[
          {
            icon: CalendarClock,
            count: todayCount,
            label: todayCount === 1 ? "session today" : "sessions today",
          },
          {
            icon: Calendar,
            count: thisWeekCount,
            label: "this week",
          },
          {
            icon: BellRing,
            count: waitlistOfferCount,
            label:
              waitlistOfferCount === 1 ? "waitlist offer" : "waitlist offers",
          },
          {
            icon: CreditCard,
            count: refundPendingCount,
            label:
              refundPendingCount === 1 ? "refund pending" : "refunds pending",
          },
        ]}
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => changeTab(tab.key)}
            className={`flex-1 min-w-[80px] min-h-[44px] rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-card text-primary shadow-sm"
                : "text-[#666666] hover:text-[#1A1A1A]"
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span
                className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === tab.key
                    ? "bg-orange-100 text-primary"
                    : "bg-gray-200 text-[#666666]"
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upcoming tab */}
      {activeTab === "upcoming" && (
        <div className="space-y-3">
          {upcomingBookings.length === 0 ? (
            <EmptyTab
              icon={Calendar}
              title="No upcoming bookings"
              body="You don't have any upcoming sessions. Browse what's on offer."
              cta={{ label: "Browse & book", href: "/parent/book" }}
            />
          ) : (
            upcomingBookings.map((booking) => {
              const session = booking.session;
              return (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-orange-100 bg-card p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#1A1A1A]">
                      {session.title}
                    </h3>
                    <Badge
                      variant="default"
                      className="bg-green-100 text-green-800 hover:bg-green-100"
                    >
                      Confirmed
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm text-[#666666]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{formatDate(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {formatTime(session.start_time)} &ndash;{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>
                        {session.location_name}
                        {session.suburb ? `, ${session.suburb}` : ""}
                      </span>
                    </div>
                    {booking.children_json &&
                      booking.children_json.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0" />
                          <span>
                            {booking.children_json
                              .map((c) => c.child_name)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                  </div>

                  {booking.payment_type && (
                    <div className="flex items-center gap-1.5 text-xs text-[#666666] pt-1 border-t border-orange-50">
                      {booking.payment_type === "package_redemption" ? (
                        <Package className="h-3.5 w-3.5" />
                      ) : (
                        <CreditCard className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {booking.payment_type === "package_redemption"
                          ? "Session pack"
                          : "Card payment"}
                        {booking.total_cents
                          ? ` — $${(booking.total_cents / 100).toFixed(2)}`
                          : ""}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] rounded-xl"
                      render={<Link href={`/parent/bookings/${booking.id}`} />}
                    >
                      View details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] rounded-xl"
                      onClick={() => downloadICS(session)}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Add to calendar
                    </Button>
                    {showCancelDialog !== booking.id && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="min-h-[44px] rounded-xl"
                        onClick={() => setShowCancelDialog(booking.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {showCancelDialog === booking.id && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-medium text-sm text-red-900">
                            Cancellation policy
                          </p>
                          <p className="text-sm text-red-800">
                            {isMoreThan24HoursBefore(
                              session.date,
                              session.start_time,
                            )
                              ? "Full refund if cancelled more than 24 hours before the session."
                              : "No refund within 24 hours of the session."}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`cancel-reason-${booking.id}`}
                          className="text-sm text-[#666666] block mb-1"
                        >
                          Reason (optional)
                        </label>
                        <textarea
                          id={`cancel-reason-${booking.id}`}
                          className="w-full rounded-xl border px-3 py-2 text-sm resize-none"
                          rows={2}
                          placeholder="Let us know why you're cancelling..."
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="min-h-[44px] rounded-xl"
                          disabled={cancellingId === booking.id}
                          onClick={() => handleCancel(booking.id)}
                        >
                          {cancellingId === booking.id && (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          )}
                          Confirm cancellation
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] rounded-xl"
                          onClick={() => {
                            setShowCancelDialog(null);
                            setCancelReason("");
                          }}
                        >
                          Keep booking
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Past tab */}
      {activeTab === "past" && (
        <div className="space-y-3">
          {pastBookings.length === 0 ? (
            <EmptyTab
              icon={Clock}
              title="No past sessions"
              body="Your completed sessions will appear here."
            />
          ) : (
            pastBookings.map((booking) => {
              const session = booking.session;
              return (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-orange-100 bg-card p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#1A1A1A]">
                      {session.title}
                    </h3>
                    <Badge
                      variant="secondary"
                      className="bg-gray-100 text-[#666666]"
                    >
                      Completed
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm text-[#666666]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{formatDate(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {formatTime(session.start_time)} &ndash;{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>
                        {session.location_name}
                        {session.suburb ? `, ${session.suburb}` : ""}
                      </span>
                    </div>
                    {booking.children_json &&
                      booking.children_json.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0" />
                          <span>
                            {booking.children_json
                              .map((c) => c.child_name)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                  </div>

                  {booking.children_json &&
                    booking.children_json.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-orange-50">
                        {booking.children_json.map((child) => (
                          <Button
                            key={child.child_id}
                            variant="outline"
                            size="sm"
                            className="min-h-[44px] text-primary border-primary/40 hover:bg-orange-50 rounded-xl"
                            render={
                              <Link
                                href={`/parent/kids/${child.child_id}/insights`}
                              />
                            }
                          >
                            View {child.child_name}&apos;s insights
                          </Button>
                        ))}
                      </div>
                    )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Cancelled tab */}
      {activeTab === "cancelled" && (
        <div className="space-y-3">
          {cancelledBookings.length === 0 ? (
            <EmptyTab
              icon={X}
              title="No cancelled bookings"
              body="Any cancelled bookings will appear here."
            />
          ) : (
            cancelledBookings.map((booking) => {
              const session = booking.session;
              return (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-orange-100 bg-card p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#1A1A1A]">
                      {session.title}
                    </h3>
                    <Badge
                      variant={
                        booking.status === "refunded" ? "outline" : "destructive"
                      }
                    >
                      {booking.status === "cancelled"
                        ? "Cancelled"
                        : booking.status === "refunded"
                          ? "Refunded"
                          : "No show"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm text-[#666666]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{formatDate(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {formatTime(session.start_time)} &ndash;{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    {booking.children_json &&
                      booking.children_json.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0" />
                          <span>
                            {booking.children_json
                              .map((c) => c.child_name)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                  </div>

                  <div className="pt-2 border-t border-orange-50 space-y-1">
                    {booking.cancellation_reason && (
                      <p className="text-sm text-[#666666]">
                        <span className="font-medium text-[#1A1A1A]">
                          Reason:
                        </span>{" "}
                        {booking.cancellation_reason}
                      </p>
                    )}
                    {booking.cancelled_at && (
                      <p className="text-xs text-[#666666]">
                        Cancelled on {formatDate(booking.cancelled_at)}
                      </p>
                    )}
                    {booking.status === "refunded" && (
                      <p className="text-sm text-green-700 font-medium">
                        Refund processed
                      </p>
                    )}
                    {booking.status === "cancelled" &&
                      booking.total_cents > 0 && (
                        <p className="text-xs text-[#666666]">
                          Original amount: $
                          {(booking.total_cents / 100).toFixed(2)}
                        </p>
                      )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Waitlist tab */}
      {activeTab === "waitlist" && (
        <div className="space-y-3">
          {waitlist.length === 0 ? (
            <EmptyTab
              icon={Users}
              title="Not on any waitlists"
              body="When a session is full, you can join the waitlist and we'll notify you the moment a spot opens."
            />
          ) : (
            waitlist.map((entry) => {
              const session = entry.session;
              const isOffered = entry.status === "offered";

              return (
                <div
                  key={entry.id}
                  className={`rounded-2xl border p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow ${
                    isOffered
                      ? "border-primary bg-orange-50"
                      : "border-orange-100 bg-card"
                  }`}
                >
                  {isOffered && (
                    <div className="flex flex-wrap items-center gap-2 text-primary font-semibold text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Spot available! Offer expires in:</span>
                      {entry.offer_expires_at && (
                        <CountdownTimer expiresAt={entry.offer_expires_at} />
                      )}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-[#1A1A1A]">
                      {session.title}
                    </h3>
                    <Badge
                      variant={isOffered ? "default" : "secondary"}
                      className={
                        isOffered
                          ? "bg-primary text-white hover:bg-primary"
                          : ""
                      }
                    >
                      {isOffered ? "Offered" : `#${entry.position} in queue`}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm text-[#666666]">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{formatDate(session.date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 shrink-0" />
                      <span>
                        {formatTime(session.start_time)} &ndash;{" "}
                        {formatTime(session.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>
                        {session.location_name}
                        {session.suburb ? `, ${session.suburb}` : ""}
                      </span>
                    </div>
                    {!isOffered && (
                      <p className="text-xs">
                        Position {entry.position} in the waitlist
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {isOffered && (
                      <Button
                        size="sm"
                        className="min-h-[44px] bg-primary hover:bg-[#d4651f] text-white rounded-xl"
                        render={
                          <Link
                            href={`/parent/book/${entry.bookable_session_id}?waitlist=${entry.id}`}
                          />
                        }
                      >
                        Confirm spot
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] rounded-xl"
                      disabled={cancellingWaitlistId === entry.id}
                      onClick={() => handleCancelWaitlist(entry.id)}
                    >
                      {cancellingWaitlistId === entry.id && (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      )}
                      Cancel waitlist
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-card border border-orange-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-primary mb-4">
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-[#1A1A1A]">{title}</h2>
      <p className="text-sm text-[#666666] mt-1 text-center max-w-sm">{body}</p>
      {cta && (
        <Button
          className="mt-4 bg-primary hover:bg-[#d4651f] text-white rounded-xl min-h-[44px]"
          render={<Link href={cta.href} />}
        >
          {cta.label}
        </Button>
      )}
    </div>
  );
}
