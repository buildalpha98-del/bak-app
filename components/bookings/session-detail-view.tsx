"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Calendar,
  Clock,
  MapPin,
  Users,
  DollarSign,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookableSession, WaitlistEntry } from "@/lib/types/database";
import type { BookableSessionStatus } from "@/lib/types/enums";

interface SessionDetailViewProps {
  session: BookableSession;
  waitlist: WaitlistEntry[];
  basePath: string;
  onStatusChange: (
    status: BookableSessionStatus
  ) => Promise<{ error: string | null }>;
}

const statusBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "default",
  draft: "secondary",
  closed: "outline",
  cancelled: "destructive",
  completed: "secondary",
};

const waitlistBadgeVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  waiting: "secondary",
  offered: "default",
  accepted: "default",
  expired: "outline",
  cancelled: "destructive",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes));
  return date.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Not set";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function SessionDetailView({
  session,
  waitlist,
  basePath,
  onStatusChange,
}: SessionDetailViewProps) {
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capacityPercentage =
    session.max_capacity > 0
      ? Math.min(
          Math.round((session.current_bookings / session.max_capacity) * 100),
          100
        )
      : 0;

  async function handleStatusChange(newStatus: BookableSessionStatus) {
    setChangingStatus(newStatus);
    setError(null);
    try {
      const result = await onStatusChange(newStatus);
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setChangingStatus(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-centre sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" render={<Link href={basePath} />}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {session.title}
            </h1>
            <Badge
              variant={statusBadgeVariant[session.status] ?? "secondary"}
              className="mt-1"
            >
              {session.status.charAt(0).toUpperCase() +
                session.status.slice(1)}
            </Badge>
          </div>
        </div>
        <Button
          variant="outline"
          render={<Link href={`${basePath}/${session.id}/edit`} />}
        >
          <Edit className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-orange-100 bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Session Details</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">Date</dt>
              <dd className="text-[#1A1A1A]">{formatDate(session.date)}</dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">Time</dt>
              <dd className="text-[#1A1A1A]">
                {formatTime(session.start_time)} &ndash;{" "}
                {formatTime(session.end_time)}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">Location</dt>
              <dd className="text-[#1A1A1A]">
                {session.location_name}
                {session.location_address && (
                  <span className="block text-sm text-[#666666]">
                    {session.location_address}
                    {session.suburb ? `, ${session.suburb}` : ""}
                  </span>
                )}
              </dd>
            </div>
          </div>

          {session.sport && (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <dt className="text-sm font-medium text-[#666666]">Sport</dt>
                <dd className="text-[#1A1A1A]">{session.sport}</dd>
              </div>
            </div>
          )}

          {(session.age_group_min != null || session.age_group_max != null) && (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <dt className="text-sm font-medium text-[#666666]">
                  Age Group
                </dt>
                <dd className="text-[#1A1A1A]">
                  {session.age_group_min ?? "?"} – {session.age_group_max ?? "?"} years
                </dd>
              </div>
            </div>
          )}

          {session.coach_id && (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <dt className="text-sm font-medium text-[#666666]">Coach</dt>
                <dd className="text-[#1A1A1A]">{(session as any).coach_name || "Unassigned"}</dd>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">Price</dt>
              <dd className="text-[#1A1A1A]">
                ${(session.price_cents / 100).toFixed(2)}
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">
                Package Eligible
              </dt>
              <dd className="text-[#1A1A1A]">
                {session.package_eligible ? "Yes" : "No"}
              </dd>
            </div>
          </div>

          <div className="col-span-full flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <dt className="text-sm font-medium text-[#666666]">
                Booking Window
              </dt>
              <dd className="text-[#1A1A1A]">
                {formatDateTime(session.booking_opens_at)} &ndash;{" "}
                {formatDateTime(session.booking_closes_at)}
              </dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Capacity card */}
      <div className="rounded-xl border border-orange-100 bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Capacity</h2>
        </div>
        <p className="mb-2 text-sm text-[#666666]">
          {session.current_bookings} / {session.max_capacity} booked
        </p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${capacityPercentage}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-[#666666]">
          {capacityPercentage}%
        </p>
      </div>

      {/* Status actions */}
      <div className="rounded-xl border border-orange-100 bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Actions</h2>
        {error && (
          <p className="mb-3 text-sm text-red-600">{error}</p>
        )}
        <div className="flex flex-wrap gap-3">
          {session.status === "draft" && (
            <Button
              onClick={() => handleStatusChange("open" as BookableSessionStatus)}
              disabled={changingStatus !== null}
              className="bg-primary hover:bg-[#d4641f]"
            >
              {changingStatus === "open" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Open for Booking
            </Button>
          )}

          {session.status === "open" && (
            <Button
              variant="outline"
              onClick={() =>
                handleStatusChange("closed" as BookableSessionStatus)
              }
              disabled={changingStatus !== null}
            >
              {changingStatus === "closed" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Close Booking
            </Button>
          )}

          {session.status === "closed" && (
            <Button
              variant="outline"
              onClick={() =>
                handleStatusChange("open" as BookableSessionStatus)
              }
              disabled={changingStatus !== null}
            >
              {changingStatus === "open" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reopen
            </Button>
          )}

          {session.status !== "cancelled" && (
            <Button
              variant="destructive"
              onClick={() =>
                handleStatusChange("cancelled" as BookableSessionStatus)
              }
              disabled={changingStatus !== null}
            >
              {changingStatus === "cancelled" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Cancel Session
            </Button>
          )}
        </div>
      </div>

      {/* Waitlist section */}
      <div className="rounded-xl border border-orange-100 bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold">Waitlist</h2>
        {waitlist.length === 0 ? (
          <p className="text-sm text-[#666666]">
            No waitlist entries for this session.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Child</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Offered At</TableHead>
                  <TableHead>Expires At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.position}</TableCell>
                    <TableCell className="text-sm">
                      {(entry as any).child_name || "Unknown"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(entry as any).parent_name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          waitlistBadgeVariant[entry.status] ?? "secondary"
                        }
                      >
                        {entry.status.charAt(0).toUpperCase() +
                          entry.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(entry.offered_at)}</TableCell>
                    <TableCell>{formatDateTime(entry.offer_expires_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
