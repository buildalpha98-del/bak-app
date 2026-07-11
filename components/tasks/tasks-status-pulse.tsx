"use client";

// ============================================================
// Tasks — inline status pulse strip
// ============================================================
//
// Mirrors the forms / training / programs pulse pattern. Four
// counts: overdue, due today, mine, unassigned. Brand orange when
// a count is > 0, muted when zero. Numbers tick up via `useCountUp`
// to match the rest of the dashboard refresh. Each count links to a
// query param the task list view picks up to apply the matching
// jump filter.

import Link from "next/link";
import { AlertCircle, Calendar, User, UserX } from "lucide-react";
import type { TasksStatusPulse } from "@/lib/tasks/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface TasksStatusPulseStripProps {
  pulse: TasksStatusPulse;
  /** "/admin/tasks" or "/ops/tasks" — keeps jump-links in scope. */
  basePath: string;
}

export function TasksStatusPulseStrip({
  pulse,
  basePath,
}: TasksStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertCircle}
          count={pulse.overdueCount}
          label={pulse.overdueCount === 1 ? "overdue" : "overdue"}
          href={`${basePath}?overdue=yes`}
        />
        <Divider />
        <PulseStat
          icon={Calendar}
          count={pulse.dueTodayCount}
          label="due today"
          href={`${basePath}?due=today`}
        />
        <Divider />
        <PulseStat
          icon={User}
          count={pulse.mineCount}
          label={pulse.mineCount === 1 ? "mine" : "mine"}
          href={`${basePath}?mine=yes`}
        />
        <Divider />
        <PulseStat
          icon={UserX}
          count={pulse.unassignedCount}
          label="unassigned"
          href={`${basePath}?unassigned=yes`}
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
