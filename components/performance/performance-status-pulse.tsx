"use client";

// ============================================================
// Performance — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children pulse pattern. Four counts:
// underperforming, top performers, zero feedback this period, new
// badges earned. Brand orange when a count is > 0, muted when zero.
// Numbers tick up via `useCountUp` to match the rest of the dashboard
// refresh.

import Link from "next/link";
import { AlertTriangle, Award, MessageSquareOff, Trophy } from "lucide-react";
import type { PerformanceStatusPulse } from "@/lib/performance/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface PerformanceStatusPulseStripProps {
  pulse: PerformanceStatusPulse;
  /** "/admin/performance" or "/ops/performance" — jumps stay in scope. */
  basePath: string;
}

export function PerformanceStatusPulseStrip({
  pulse,
  basePath,
}: PerformanceStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.underperformingCount}
          label={
            pulse.underperformingCount === 1
              ? "coach underperforming"
              : "coaches underperforming"
          }
          // Jump filter — TeamPerformanceView reads ?benchmark=below
          href={`${basePath}?benchmark=below`}
        />
        <Divider />
        <PulseStat
          icon={Trophy}
          count={pulse.topPerformerCount}
          label={
            pulse.topPerformerCount === 1
              ? "top performer"
              : "top performers"
          }
          href={`${basePath}?benchmark=above`}
        />
        <Divider />
        <PulseStat
          icon={MessageSquareOff}
          count={pulse.zeroFeedbackCount}
          label="without feedback"
          href={`${basePath}?feedback=zero`}
        />
        <Divider />
        <PulseStat
          icon={Award}
          count={pulse.newBadgesCount}
          label={
            pulse.newBadgesCount === 1
              ? "new badge"
              : "new badges"
          }
          // No filter — badges live in the leaderboard cards; scroll
          // them into view by hash so the operator can spot what's new.
          href={`${basePath}#badges`}
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
