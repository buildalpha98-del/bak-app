"use client";

// ============================================================
// Bookings — inline status pulse strip
// ============================================================
//
// Mirrors the forms / training / programs / assessments pulse
// pattern. Four counts: today's sessions, waitlist expiring (24h),
// packages running low, new bookings this week. Brand orange when
// a count is > 0, muted when zero. Numbers tick up via `useCountUp`
// to match the rest of the dashboard refresh.
//
// Jump-links route through the dashboard's tab URL state plus a
// secondary filter param so a click drops the operator straight
// into the work.

import Link from "next/link";
import { Calendar, Clock, Package, TrendingUp } from "lucide-react";
import type { BookingsStatusPulse } from "@/lib/bookings/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface BookingsStatusPulseStripProps {
  pulse: BookingsStatusPulse;
  /** "/admin/bookings" — jump-links stay in scope. */
  basePath: string;
}

export function BookingsStatusPulseStrip({
  pulse,
  basePath,
}: BookingsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Calendar}
          count={pulse.todaysSessionsCount}
          label={
            pulse.todaysSessionsCount === 1
              ? "session today"
              : "sessions today"
          }
          href={`${basePath}?tab=sessions&date=today`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.waitlistExpiringCount}
          label="waitlist expiring (24h)"
          href={`${basePath}?tab=sessions&waitlist=expiring`}
        />
        <Divider />
        <PulseStat
          icon={Package}
          count={pulse.packagesLowCount}
          label={
            pulse.packagesLowCount === 1
              ? "package running low"
              : "packages running low"
          }
          href={`${basePath}?tab=packages&low=yes`}
        />
        <Divider />
        <PulseStat
          icon={TrendingUp}
          count={pulse.newBookingsThisWeekCount}
          label="new bookings this week"
          href={`${basePath}?tab=bookings&range=this_week`}
        />
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <li
      aria-hidden
      className="hidden h-4 w-px bg-border sm:inline-block"
    />
  );
}

function PulseStat({
  icon: Icon,
  count,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40"
      >
        <Icon
          className={
            active
              ? "size-3.5 text-primary"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-primary"
              : "text-base font-semibold tabular-nums text-muted-foreground"
          }
        >
          {ticked}
        </span>
        <span
          className={
            active
              ? "text-sm text-foreground group-hover:underline"
              : "text-sm text-muted-foreground group-hover:underline"
          }
        >
          {label}
        </span>
      </Link>
    </li>
  );
}
