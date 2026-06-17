"use client";

// ============================================================
// Churn — inline status pulse strip
// ============================================================

import Link from "next/link";
import { ShieldAlert, AlertTriangle, TrendingDown, Minus } from "lucide-react";
import type { ChurnStatusPulse } from "@/lib/churn/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface ChurnStatusPulseStripProps {
  pulse: ChurnStatusPulse;
  basePath: string;
}

export function ChurnStatusPulseStrip({
  pulse,
  basePath,
}: ChurnStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={ShieldAlert}
          count={pulse.atRiskCount}
          label={pulse.atRiskCount === 1 ? "centre at risk" : "centres at risk"}
          href={`${basePath}?tab=At+Risk&severity=high`}
          tone="red"
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.newEventsThisWeekCount}
          label="new events this week"
          href={`${basePath}?tab=Events&period=this_week`}
        />
        <Divider />
        <PulseStat
          icon={TrendingDown}
          count={pulse.improvingCount}
          label="improving"
          href={`${basePath}?tab=At+Risk&trend=improving`}
          tone="green"
        />
        <Divider />
        <PulseStat
          icon={Minus}
          count={pulse.unchangedCount}
          label="unchanged"
          href={`${basePath}?tab=At+Risk&trend=unchanged`}
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
  tone = "orange",
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
  tone?: "orange" | "red" | "green";
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  const activeText =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-green-600"
        : "text-[#E8712A]";
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40"
      >
        <Icon
          className={
            active
              ? `size-3.5 ${activeText}`
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? `text-base font-semibold tabular-nums ${activeText}`
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
