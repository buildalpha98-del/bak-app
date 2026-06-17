"use client";

// ============================================================
// Coach Home — sticky greeting + status pulse strip
// ============================================================
//
// Mirrors AdminContextStrip / OpsContextStrip but tuned for mobile —
// stacks vertically on small screens with 44px touch targets on each
// pulse link. The greeting reads "Good morning, [first_name]" in
// Sydney-local time and surfaces the two most urgent counts on the
// right.
//
// Coaches don't get URL-persisted complex filters — keep their world
// simple. Each pulse stat is a single link with a single ?filter= param
// that the destination view already understands.

import Link from "next/link";
import {
  CalendarClock,
  ClipboardCheck,
  ClipboardX,
  Megaphone,
} from "lucide-react";
import type { CoachStatusPulse } from "@/lib/coach/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface CoachContextStripProps {
  firstName: string;
  pulse: CoachStatusPulse;
  /** Override "now" for testing; defaults to current time. */
  now?: Date;
}

export function CoachContextStrip({
  firstName,
  pulse,
  now,
}: CoachContextStripProps) {
  const date = now ?? new Date();
  const greeting = greetingFor(date);
  const dateLabel = formatSydneyDate(date);

  return (
    <div className="sticky top-0 z-30 -mx-4 mb-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {dateLabel}
          </p>
          <p className="text-base font-medium text-foreground">
            {greeting},{" "}
            <span className="text-[#E8712A]">{firstName}</span>
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1">
          <PulseStat
            icon={CalendarClock}
            count={pulse.shiftsTodayCount}
            label={
              pulse.shiftsTodayCount === 1 ? "shift today" : "shifts today"
            }
            href="/coach/schedule"
          />
          <PulseStat
            icon={ClipboardCheck}
            count={pulse.shiftsToConfirmCount}
            label={
              pulse.shiftsToConfirmCount === 1
                ? "shift to confirm"
                : "shifts to confirm"
            }
            href="/coach/schedule?filter=pending"
          />
          <PulseStat
            icon={ClipboardX}
            count={pulse.overdueFormsCount}
            label={
              pulse.overdueFormsCount === 1 ? "form overdue" : "forms overdue"
            }
            href="/coach/forms?filter=overdue"
          />
          <PulseStat
            icon={Megaphone}
            count={pulse.unreadAnnouncementsCount}
            label={
              pulse.unreadAnnouncementsCount === 1
                ? "announcement unread"
                : "announcements unread"
            }
            href="/coach/announcements?filter=unread"
          />
        </ul>
      </div>
    </div>
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
        className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 active:bg-muted/60"
      >
        <Icon
          className={
            active
              ? "size-3.5 text-[#E8712A]"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-[#E8712A]"
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
// Sydney-local time helpers (greeting + date label)
// ============================================================

function greetingFor(date: Date): string {
  const hour = sydneyHour(date);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function sydneyHour(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: false,
    timeZone: "Australia/Sydney",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const n = Number(hourPart);
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
