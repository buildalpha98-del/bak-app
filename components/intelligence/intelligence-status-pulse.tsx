"use client";

// ============================================================
// Intelligence — inline status pulse strip
// ============================================================

import Link from "@/components/ui/app-link";
import {
  Building2,
  AlertTriangle,
  TrendingDown,
  Users,
} from "lucide-react";
import type { IntelligenceStatusPulse } from "@/lib/intelligence/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface IntelligenceStatusPulseStripProps {
  pulse: IntelligenceStatusPulse;
  basePath?: string;
}

export function IntelligenceStatusPulseStrip({
  pulse,
  basePath = "/admin/intelligence",
}: IntelligenceStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.openChurnRisksCount}
          label="open churn risks"
          href={`/admin/churn`}
        />
        <Divider />
        <PulseStat
          icon={TrendingDown}
          count={pulse.lowUtilisationCoachesCount}
          label="low-utilisation coaches"
          href={`${basePath}?tab=Financial`}
        />
        <Divider />
        <PulseStat
          icon={Building2}
          count={pulse.newCentresThisMonthCount}
          label="new centres this month"
          href={`${basePath}?tab=Growth`}
        />
        <Divider />
        <PulseStat
          icon={Users}
          count={pulse.newParentsThisMonthCount}
          label="new parents this month"
          href={`${basePath}?tab=Growth`}
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
