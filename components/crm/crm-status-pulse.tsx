"use client";

// ============================================================
// CRM — inline status pulse strip
// ============================================================
//
// Mirrors the `/admin/centres` and `/admin/roster` pulse patterns,
// scoped to lead signals. Four inline cells: stale leads, overdue
// follow-ups, trials ending this week, hot leads. Each is a button
// that pushes a derived filter chip on the pipeline board (URL-state
// authoritative, parent drives the chip rendering).
//
// Styling notes:
// - `rounded-2xl border` container with subtle vertical dividers
//   between cells (matches centres + roster pulse `gap-x-5`).
// - Brand orange (#E8712A) only when count > 0; muted when zero so a
//   clean pipeline looks calm rather than alarming.

import { Clock, CalendarClock, Flame, AlarmClock } from "lucide-react";
import type { CrmStatusPulse } from "@/lib/crm/status-pulse-actions";

export type CrmPulseJump = "stale" | "overdue" | "trials_ending" | "hot";

interface CrmStatusPulseStripProps {
  pulse: CrmStatusPulse;
  /** Called with the jump key when the operator clicks a cell. The
   *  parent drives the URL + chip state — pulse stays presentational. */
  onJumpTo: (jump: CrmPulseJump) => void;
}

export function CrmStatusPulseStrip({
  pulse,
  onJumpTo,
}: CrmStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseJumpStat
          icon={Clock}
          count={pulse.staleCount}
          label={pulse.staleCount === 1 ? "stale lead" : "stale leads"}
          onClick={() => onJumpTo("stale")}
        />
        <Divider />
        <PulseJumpStat
          icon={AlarmClock}
          count={pulse.overdueFollowupCount}
          label={
            pulse.overdueFollowupCount === 1
              ? "overdue follow-up"
              : "overdue follow-ups"
          }
          onClick={() => onJumpTo("overdue")}
        />
        <Divider />
        <PulseJumpStat
          icon={CalendarClock}
          count={pulse.trialsEndingThisWeekCount}
          label={
            pulse.trialsEndingThisWeekCount === 1
              ? "trial ending this week"
              : "trials ending this week"
          }
          onClick={() => onJumpTo("trials_ending")}
        />
        <Divider />
        <PulseJumpStat
          icon={Flame}
          count={pulse.hotLeadsCount}
          label={pulse.hotLeadsCount === 1 ? "hot lead" : "hot leads"}
          onClick={() => onJumpTo("hot")}
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

function PulseJumpStat({
  icon: Icon,
  count,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  onClick: () => void;
}) {
  const active = count > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Icon
          className={
            active ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-primary"
              : "text-base font-semibold tabular-nums text-muted-foreground"
          }
        >
          {count}
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
      </button>
    </li>
  );
}
