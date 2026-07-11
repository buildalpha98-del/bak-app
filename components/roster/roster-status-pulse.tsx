"use client";

// ============================================================
// Roster — inline status pulse strip
// ============================================================
//
// Mirrors the `/admin/centres` pulse pattern but scoped to the active
// week. Four inline cells: drafts pending, shifts unassigned,
// coverage %, and projected wage. The first two are link-to-filter
// (they push a `?status=` param via the parent's filter state), the
// coverage cell is a tiny inline progress bar, and the wage cell is
// hidden entirely when the viewer lacks financial_access.
//
// Styling notes:
// - `rounded-2xl border` container with subtle vertical dividers
//   between cells (mirrors the centres pulse `gap-x-5`).
// - Brand orange (#E8712A) only when a count is positive; muted when
//   zero so a clean week looks calm rather than alarming.
// - Coverage uses `bg-secondary` track + `bg-primary` fill so the
//   restrained-orange rule applies (orange = positive accent).

import { FileEdit, UserX } from "lucide-react";
import type { RosterStatusPulse } from "@/lib/roster/status-pulse-actions";

interface RosterStatusPulseStripProps {
  pulse: RosterStatusPulse;
  /** Called with a `?status=` value (or null to clear). Drives the
   *  filter chip row's status state when the operator jumps from the
   *  pulse — keeps URL state authoritative. */
  onJumpToStatus: (status: "draft" | "unassigned") => void;
}

function fmtAud(amount: number): string {
  // Mirrors WeekCostChip.fmtAud — keeps the inline summary visually
  // consistent with the detailed tooltip elsewhere on the page.
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RosterStatusPulseStrip({
  pulse,
  onJumpToStatus,
}: RosterStatusPulseStripProps) {
  const showWage = pulse.projectedWage !== null;

  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseJumpStat
          icon={FileEdit}
          count={pulse.draftsCount}
          label={
            pulse.draftsCount === 1 ? "draft pending" : "drafts pending"
          }
          onClick={() => onJumpToStatus("draft")}
        />
        <Divider />
        <PulseJumpStat
          icon={UserX}
          count={pulse.unassignedCount}
          label={
            pulse.unassignedCount === 1
              ? "shift unassigned"
              : "shifts unassigned"
          }
          onClick={() => onJumpToStatus("unassigned")}
        />
        <Divider />
        <CoverageStat percent={pulse.coveragePercent} />
        {showWage && (
          <>
            <Divider />
            <WageStat amount={pulse.projectedWage!} />
          </>
        )}
      </ul>
    </div>
  );
}

function Divider() {
  // Hidden on the very narrow viewports where the row wraps; the row
  // gap takes over the visual separation in that mode. Mirrors the
  // centres pulse divider exactly.
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

function CoverageStat({ percent }: { percent: number }) {
  // Coverage is a passive read-out — never a link. The accompanying
  // progress bar is what makes the number meaningful at a glance; the
  // numeric label sits to the left so the eye lands on it first.
  return (
    <li
      className="inline-flex items-center gap-2"
      aria-label={`Roster coverage ${percent}%`}
    >
      <span className="text-base font-semibold tabular-nums text-foreground">
        {percent}%
      </span>
      <span className="text-sm text-muted-foreground">coverage</span>
      <span
        className="ml-1 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-secondary"
        aria-hidden
      >
        <span
          className="block h-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </span>
    </li>
  );
}

function WageStat({ amount }: { amount: number }) {
  // Hidden entirely (caller-controlled) when the viewer has no
  // financial_access. We deliberately use ≈ to signal this is a
  // projection, not a settled figure — same convention as WeekCostChip.
  const active = amount > 0;
  return (
    <li
      className="inline-flex items-center gap-1.5"
      aria-label={`Projected wage ${fmtAud(amount)} this week`}
    >
      <span className="text-sm text-muted-foreground">≈</span>
      <span
        className={
          active
            ? "text-base font-semibold tabular-nums text-primary"
            : "text-base font-semibold tabular-nums text-muted-foreground"
        }
      >
        {fmtAud(amount)}
      </span>
      <span className="text-sm text-muted-foreground">projected wage</span>
    </li>
  );
}
