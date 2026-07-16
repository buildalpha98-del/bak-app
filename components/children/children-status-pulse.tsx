"use client";

// ============================================================
// Children list — inline status pulse strip
// ============================================================
//
// Mirrors staff-status-pulse + centres-status-pulse: a single row of
// inline counts above the filter chip bar, where each count is a
// jump-link that flips a query param on this view rather than
// navigating away. Brand orange when a count is >0, muted when zero —
// a clean board reads calm rather than alarming. Numbers tick up via
// `useCountUp` to match the home dashboard's first-paint warmth.

import Link from "@/components/ui/app-link";
import { Sparkles, Building2, ClipboardCheck, CalendarOff } from "lucide-react";
import type { ChildrenStatusPulse } from "@/lib/children/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface ChildrenStatusPulseStripProps {
  pulse: ChildrenStatusPulse;
  /** "/admin/children" or "/ops/children" — jump-links keep us in scope. */
  basePath: string;
}

export function ChildrenStatusPulseStrip({
  pulse,
  basePath,
}: ChildrenStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Sparkles}
          count={pulse.newThisWeekCount}
          label={
            pulse.newThisWeekCount === 1
              ? "new this week"
              : "new this week"
          }
          href={`${basePath}?new=this_week`}
        />
        <Divider />
        <PulseStat
          icon={Building2}
          count={pulse.noCentreCount}
          label="no centre linked"
          href={`${basePath}?centres=none`}
        />
        <Divider />
        <PulseStat
          icon={ClipboardCheck}
          count={pulse.assessmentsOverdueCount}
          label={
            pulse.assessmentsOverdueCount === 1
              ? "assessment overdue"
              : "assessments overdue"
          }
          href={`${basePath}?assessment=overdue`}
        />
        <Divider />
        <PulseStat
          icon={CalendarOff}
          count={pulse.inactive30dCount}
          label="inactive 30+ days"
          href={`${basePath}?inactive=30d`}
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
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
