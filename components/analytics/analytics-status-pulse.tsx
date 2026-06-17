"use client";

// ============================================================
// Analytics — inline status pulse strip
// ============================================================

import Link from "next/link";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import type { AnalyticsStatusPulse } from "@/lib/forecasting/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface AnalyticsStatusPulseStripProps {
  pulse: AnalyticsStatusPulse;
  basePath?: string;
}

export function AnalyticsStatusPulseStrip({
  pulse,
  basePath = "/admin/analytics",
}: AnalyticsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={RefreshCw}
          count={pulse.forecastIsStale ? pulse.forecastStaleDays : 0}
          label={pulse.forecastIsStale ? "days since refresh" : "forecast fresh"}
          href={`${basePath}/settings`}
          alwaysShow
          // Stale = active orange. Fresh = a muted "fresh" status (no count).
          activeOverride={pulse.forecastIsStale}
          hideCount={!pulse.forecastIsStale}
        />
        <Divider />
        <PulseStat
          icon={TrendingDown}
          count={pulse.negativeMarginMonthsCount}
          label="loss months ahead"
          href={`${basePath}?focus=loss`}
        />
        <Divider />
        <PulseStat
          icon={TrendingUp}
          count={pulse.overperformingMonthsCount}
          label="overperforming"
          href={`${basePath}?focus=overperforming`}
        />
        <Divider />
        <PulseStat
          icon={BarChart3}
          count={pulse.monthsAheadGenerated}
          label="months projected"
          href={basePath}
        />
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <li aria-hidden className="hidden h-4 w-px bg-border sm:inline-block" />
  );
}

function PulseStat({
  icon: Icon,
  count,
  label,
  href,
  alwaysShow,
  activeOverride,
  hideCount,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
  alwaysShow?: boolean;
  activeOverride?: boolean;
  hideCount?: boolean;
}) {
  const active = activeOverride ?? count > 0;
  const ticked = useCountUp(count);
  if (!alwaysShow && count === 0) {
    // Still render the muted version so the strip rhythm stays consistent.
  }
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
        {!hideCount && (
          <span
            className={
              active
                ? "text-base font-semibold tabular-nums text-[#E8712A]"
                : "text-base font-semibold tabular-nums text-muted-foreground"
            }
          >
            {ticked}
          </span>
        )}
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
