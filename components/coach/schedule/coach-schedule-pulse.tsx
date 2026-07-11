"use client";

// ============================================================
// Coach Schedule — inline pulse strip
// ============================================================
//
// Three numbers a coach scans before diving into the schedule:
//
//   1. Today           — how many sessions I have today
//   2. To confirm      — pending_confirmation assignments
//   3. Past unconfirmed — pre-today sessions still pending — drift signal
//
// Brand orange when count > 0, muted otherwise. Mirrors the
// AssessmentsStatusPulseStrip pattern.

import Link from "next/link";
import { CalendarClock, ClipboardCheck, AlertTriangle } from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";

export interface CoachSchedulePulse {
  todayCount: number;
  toConfirmCount: number;
  pastUnconfirmedCount: number;
}

interface Props {
  pulse: CoachSchedulePulse;
}

export function CoachSchedulePulseStrip({ pulse }: Props) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={CalendarClock}
          count={pulse.todayCount}
          label={pulse.todayCount === 1 ? "today" : "today"}
          href="/coach/schedule"
        />
        <Divider />
        <PulseStat
          icon={ClipboardCheck}
          count={pulse.toConfirmCount}
          label={
            pulse.toConfirmCount === 1 ? "to confirm" : "to confirm"
          }
          href="/coach/schedule?filter=pending"
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.pastUnconfirmedCount}
          label={
            pulse.pastUnconfirmedCount === 1
              ? "past unconfirmed"
              : "past unconfirmed"
          }
          href="/coach/schedule?filter=overdue"
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
        className="group inline-flex min-h-[44px] items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40"
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
