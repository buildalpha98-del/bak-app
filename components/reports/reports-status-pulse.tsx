"use client";

// ============================================================
// Reports — inline status pulse strip
// ============================================================
//
// Mirrors the forms / training / programs pulse pattern. Four
// counts: drafts, sent this week, overdue, centres without report.
// Brand orange when a count is > 0, muted when zero. Numbers tick
// up via `useCountUp` to match the rest of the dashboard refresh.

import Link from "next/link";
import {
  FileEdit,
  Send,
  Clock,
  Building2,
} from "lucide-react";
import type { ReportsStatusPulse } from "@/lib/reports/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface ReportsStatusPulseStripProps {
  pulse: ReportsStatusPulse;
  /** "/admin/reports" or "/ops/reports" — jump-links stay in scope. */
  basePath: string;
}

export function ReportsStatusPulseStrip({
  pulse,
  basePath,
}: ReportsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={FileEdit}
          count={pulse.draftsCount}
          label={pulse.draftsCount === 1 ? "draft" : "drafts"}
          href={`${basePath}?status=draft`}
        />
        <Divider />
        <PulseStat
          icon={Send}
          count={pulse.sentThisWeekCount}
          label="sent this week"
          href={`${basePath}?status=sent&range=this_week`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.overdueCount}
          label="overdue"
          href={`${basePath}?overdue=yes`}
        />
        <Divider />
        <PulseStat
          icon={Building2}
          count={pulse.centresWithoutReportCount}
          label={
            pulse.centresWithoutReportCount === 1
              ? "centre without report"
              : "centres without report"
          }
          href={`${basePath}?missing_report=yes`}
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
