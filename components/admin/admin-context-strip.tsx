"use client";

// ============================================================
// Admin home — sticky context strip
// ============================================================
//
// Greets the viewer by first name + Sydney-local date on the left.
// On the right, a 3-stat "status pulse" shows the day's most
// actionable counts — each is a link that filters the relevant page.
//
// The strip is sticky so it stays in view while scrolling the rest of
// the dashboard; that's intentional because the pulse counts are the
// reason most admins open this page in the morning.

import Link from "next/link";
import type { AdminStatusPulse } from "@/lib/launch/dashboard-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface AdminContextStripProps {
  firstName: string;
  pulse: AdminStatusPulse;
  /** Override "now" for testing; defaults to current time. */
  now?: Date;
}

export function AdminContextStrip({ firstName, pulse, now }: AdminContextStripProps) {
  const date = now ?? new Date();
  const greeting = greetingFor(date);
  const dateLabel = formatSydneyDate(date);

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {dateLabel}
          </p>
          <p className="text-base font-medium text-foreground">
            {greeting},{" "}
            <span className="text-foreground">{firstName}</span>
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <PulseStat
            count={pulse.needsReplacementCount}
            label="shifts need a coach"
            href="/admin/roster?status=needs_replacement"
          />
          <PulseStat
            count={pulse.overdueInvoiceCount}
            label="invoices overdue"
            href="/admin/invoicing?filter=overdue"
          />
          <PulseStat
            count={pulse.leadsRepliedTodayCount}
            label="leads replied today"
            href="/admin/crm?filter=replied_today"
          />
        </ul>
      </div>
    </div>
  );
}

function PulseStat({
  count,
  label,
  href,
}: {
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
        className="group inline-flex items-baseline gap-1.5 rounded-md px-1 -mx-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
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

// ============================================================
// Time helpers — Sydney-local (Australia/Sydney) greeting + date
// ============================================================

function greetingFor(date: Date): string {
  const hour = sydneyHour(date);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function sydneyHour(date: Date): number {
  // Hour-in-day from the perspective of Sydney, regardless of where
  // the server runs.
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: false,
    timeZone: "Australia/Sydney",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const n = Number(hourPart);
  // Intl can return "24" for midnight in some runtimes; normalise.
  return Number.isFinite(n) ? n % 24 : 0;
}

function formatSydneyDate(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Sydney",
  }).format(date);
}
