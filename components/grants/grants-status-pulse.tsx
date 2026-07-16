"use client";

// ============================================================
// Grants — inline status pulse strip
// ============================================================
//
// Mirrors the established pulse pattern. Four counts: awaiting
// submission (planning), expiring within 30d with unused funds,
// stuck in planning (14+ days), approved this week.

import Link from "@/components/ui/app-link";
import {
  ClipboardList,
  Calendar,
  AlertTriangle,
  Award,
} from "lucide-react";
import type { GrantsStatusPulse } from "@/lib/grants/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface GrantsStatusPulseStripProps {
  pulse: GrantsStatusPulse;
  basePath?: string;
}

export function GrantsStatusPulseStrip({
  pulse,
  basePath = "/admin/grants",
}: GrantsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={ClipboardList}
          count={pulse.awaitingSubmissionCount}
          label="awaiting submission"
          href={`${basePath}?status=planning`}
        />
        <Divider />
        <PulseStat
          icon={Calendar}
          count={pulse.expiringSoonCount}
          label="expiring within 30 days"
          href={`${basePath}?status=funded&expiring=30`}
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.stuckInPlanningCount}
          label="stuck in planning"
          href={`${basePath}?status=planning&stale=14`}
        />
        <Divider />
        <PulseStat
          icon={Award}
          count={pulse.approvedThisWeekCount}
          label="approved this week"
          href={`${basePath}?status=approved&approved=this_week`}
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
