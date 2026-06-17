"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getBookingById, cancelBooking } from "@/lib/bookings/booking-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Booking, BookableSession } from "@/lib/types/database";
import {
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Users,
  CreditCard,
  Package,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

type BookingWithSession = Booking & { session: BookableSession };

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
  }
> = {
  confirmed: {
    label: "Confirmed",
    variant: "default",
    className: "bg-green-100 text-green-800 hover:bg-green-100",
  },
  pending_payment: {
    label: "Pending Payment",
    variant: "secondary",
    className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  },
  cancelled: {
    label: "Cancelled",
    variant: "destructive",
    className: "",
  },
  refunded: {
    label: "Refunded",
    variant: "outline",
    className: "bg-gray-100 text-gray-600",
  },
  no_show: {
    label: "No Show",
    variant: "destructive",
    className: "",
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
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

function isSessionUpcoming(date: string) {
  const sessionDate = new Date(date);
  sessionDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return sessionDate >= today;
}

function isMoreThan24HoursBefore(sessionDate: string, sessionTime: string) {
  const sessionStart = new Date(`${sessionDate}T${sessionTime}`);
  const now = new Date();
  return sessionStart.getTime() - now.getTime() > 24 * 60 * 60 * 1000;
}

function buildMapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<BookingWithSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelSection, setShowCancelSection] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await getBookingById(bookingId);
        if (result.error) {
          setError(result.error);
        } else if (result.data) {
          setBooking(result.data as BookingWithSession);
        } else {
          setError("Booking not found.");
        }
      } catch {
        setError("Failed to load booking.");
        toast.error("Could not load booking details. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookingId]);

  async function handleCancel() {
    if (!booking) return;
    setCancelling(true);
    try {
      const result = await cancelBooking(
        booking.id,
        cancelReason || "Parent cancelled"
      );
      if (result.error) {
        toast.error("Could not cancel this booking. Please try again.");
      } else {
        setBooking({
          ...booking,
          status: "cancelled" as Booking["status"],
          cancelled_at: new Date().toISOString(),
          cancellation_reason: cancelReason || "Parent cancelled",
        });
        setShowCancelSection(false);
        setCancelReason("");
        toast.success("Booking cancelled successfully.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="space-y-4">
        <Link href="/parent/bookings">
          <Button variant="ghost" size="sm" className="min-h-[44px]">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to bookings
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl bg-white border border-orange-100">
          <AlertTriangle className="h-10 w-10 text-[#E8712A] mb-3" />
          <h2 className="text-lg font-semibold text-[#1A1A1A]">
            {error ?? "Booking not found"}
          </h2>
          <p className="text-sm text-[#666666] mt-1">
            This booking may have been removed or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  const session = booking.session;
  const upcoming = isSessionUpcoming(session.date);
  const isConfirmed = booking.status === "confirmed";
  const statusConfig = STATUS_CONFIG[booking.status] ?? {
    label: booking.status,
    variant: "default" as const,
    className: "",
  };

  const mapsAddress = session.location_address
    ? `${session.location_name ?? ""} ${session.location_address}`.trim()
    : session.location_name ?? "";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back button */}
      <Link href="/parent/bookings">
        <Button variant="ghost" size="sm" className="min-h-[44px] -ml-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to bookings
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-bold text-[#1A1A1A]">{session.title}</h1>
        <Badge variant={statusConfig.variant} className={statusConfig.className}>
          {statusConfig.label}
        </Badge>
      </div>

      {/* Session Info */}
      <div className="rounded-2xl border border-orange-100 bg-white p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="font-semibold text-[#1A1A1A]">Session Details</h2>

        {session.description && (
          <p className="text-sm text-[#666666]">{session.description}</p>
        )}

        <div className="space-y-3 text-sm text-[#666666]">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 shrink-0 text-[#E8712A]" />
            <span>{formatDate(session.date)}</span>
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 shrink-0 text-[#E8712A]" />
            <span>
              {formatTime(session.start_time)} &ndash;{" "}
              {formatTime(session.end_time)}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 shrink-0 text-[#E8712A] mt-0.5" />
            <div>
              <p>{session.location_name}</p>
              {session.location_address && (
                <a
                  href={buildMapsUrl(mapsAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#E8712A] hover:underline text-xs"
                >
                  {session.location_address}
                  {session.suburb ? `, ${session.suburb}` : ""} — View on Maps
                </a>
              )}
            </div>
          </div>

          {session.sport && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 shrink-0 flex items-center justify-center">
                <span className="text-sm">&#9917;</span>
              </div>
              <Badge
                variant="outline"
                className="border-[#E8712A] text-[#E8712A]"
              >
                {session.sport}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Children Attending */}
      {booking.children_json && booking.children_json.length > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-white p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
            <Users className="h-5 w-5 text-[#E8712A]" />
            Children Attending
          </h2>
          <div className="space-y-2">
            {booking.children_json.map((child) => (
              <div
                key={child.child_id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50"
              >
                <span className="font-medium text-sm text-[#1A1A1A]">
                  {child.child_name}
                </span>
                <Badge variant="outline" className="text-xs">
                  {child.age_group}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Details */}
      <div className="rounded-2xl border border-orange-100 bg-white p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
        <h2 className="font-semibold text-[#1A1A1A] flex items-center gap-2">
          {booking.payment_type === "package_redemption" ? (
            <Package className="h-5 w-5 text-[#E8712A]" />
          ) : (
            <CreditCard className="h-5 w-5 text-[#E8712A]" />
          )}
          Payment Details
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#666666]">Total</span>
            <span className="font-semibold text-[#1A1A1A]">
              ${(booking.total_cents / 100).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#666666]">Payment Method</span>
            <span className="text-[#1A1A1A]">
              {booking.payment_type === "package_redemption"
                ? "Session Pack"
                : "Card Payment"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#666666]">Booked</span>
            <span className="text-[#1A1A1A]">
              {formatShortDate(booking.booked_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Status-specific sections */}
      {upcoming && isConfirmed && !showCancelSection && (
        <div className="rounded-2xl border border-orange-100 bg-white p-5 space-y-3 shadow-sm hover:shadow-md transition-shadow">
          <h2 className="font-semibold text-[#1A1A1A]">
            Cancel This Booking
          </h2>
          <p className="text-sm text-[#666666]">
            Full refund if cancelled more than 24 hours before the session. No
            refund within 24 hours.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="min-h-[44px]"
            onClick={() => setShowCancelSection(true)}
          >
            Cancel This Booking
          </Button>
        </div>
      )}

      {showCancelSection && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-sm text-red-900">
                Cancellation Policy
              </p>
              <p className="text-sm text-red-800">
                {isMoreThan24HoursBefore(session.date, session.start_time)
                  ? "Full refund if cancelled more than 24 hours before the session."
                  : "No refund within 24 hours of the session."}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="cancel-reason"
              className="text-sm text-[#666666] block mb-1"
            >
              Reason (optional)
            </label>
            <textarea
              id="cancel-reason"
              className="w-full rounded-md border px-3 py-2 text-sm resize-none"
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
              className="min-h-[44px]"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              Confirm Cancellation
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => {
                setShowCancelSection(false);
                setCancelReason("");
              }}
            >
              Keep Booking
            </Button>
          </div>
        </div>
      )}

      {!upcoming && isConfirmed && (
        <div className="rounded-xl border border-green-100 bg-green-50 p-5">
          <p className="text-sm text-green-800 font-medium">
            This session has been completed. Thank you for attending!
          </p>
        </div>
      )}

      {booking.status === "cancelled" && (
        <div className="rounded-xl border border-orange-100 bg-white p-5 space-y-2">
          <p className="text-sm font-medium text-[#1A1A1A]">
            This booking was cancelled
          </p>
          {booking.cancellation_reason && (
            <p className="text-sm text-[#666666]">
              Reason: {booking.cancellation_reason}
            </p>
          )}
          {booking.cancelled_at && (
            <p className="text-xs text-[#666666]">
              Cancelled on {formatShortDate(booking.cancelled_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
