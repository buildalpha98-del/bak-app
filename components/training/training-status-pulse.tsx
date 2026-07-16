"use client";

// ============================================================
// Training — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children / performance / assessments
// / programmes pulse pattern. Four counts: overdue assignments,
// unassigned mandatory modules, new modules this week, coaches with
// zero completions. Brand orange when a count is > 0, muted when
// zero. Numbers tick up via `useCountUp` to match the rest of the
// dashboard refresh.

import Link from "@/components/ui/app-link";
import {
  AlertTriangle,
  ClipboardList,
  Sparkles,
  UserX,
} from "lucide-react";
import type { TrainingStatusPulse } from "@/lib/training/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface TrainingStatusPulseStripProps {
  pulse: TrainingStatusPulse;
  /** "/admin/training" or "/ops/training" — jump-links keep us in scope. */
  basePath: string;
}

export function TrainingStatusPulseStrip({
  pulse,
  basePath,
}: TrainingStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.overdueAssignmentsCount}
          label={
            pulse.overdueAssignmentsCount === 1
              ? "overdue assignment"
              : "overdue assignments"
          }
          href={`${basePath}?tab=modules&due=overdue`}
        />
        <Divider />
        <PulseStat
          icon={ClipboardList}
          count={pulse.unassignedMandatoryCount}
          label={
            pulse.unassignedMandatoryCount === 1
              ? "unassigned mandatory"
              : "unassigned mandatory"
          }
          href={`${basePath}?tab=modules&required=yes&status=published`}
        />
        <Divider />
        <PulseStat
          icon={UserX}
          count={pulse.coachesZeroCompletionsCount}
          label={
            pulse.coachesZeroCompletionsCount === 1
              ? "coach with zero completions"
              : "coaches with zero completions"
          }
          href={`${basePath}/assignments?coverage=untrained`}
        />
        <Divider />
        <PulseStat
          icon={Sparkles}
          count={pulse.newModulesThisWeekCount}
          label="new this week"
          href={`${basePath}?tab=modules&new=this_week`}
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
