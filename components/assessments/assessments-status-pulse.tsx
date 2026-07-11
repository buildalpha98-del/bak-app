"use client";

// ============================================================
// Assessments — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children / performance pulse pattern.
// Four counts: templates without skills, children pending this term,
// coaches with un-submitted ratings this week, new templates published
// this week. Brand orange when a count is > 0, muted when zero.
// Numbers tick up via `useCountUp` to match the rest of the dashboard
// refresh.

import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  UserX,
  Sparkles,
} from "lucide-react";
import type { AssessmentsStatusPulse } from "@/lib/assessments/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface AssessmentsStatusPulseStripProps {
  pulse: AssessmentsStatusPulse;
  /** "/admin/assessments" or "/ops/assessments" — jump-links keep us in scope. */
  basePath: string;
}

export function AssessmentsStatusPulseStrip({
  pulse,
  basePath,
}: AssessmentsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.templatesWithoutSkillsCount}
          label={
            pulse.templatesWithoutSkillsCount === 1
              ? "template without skills"
              : "templates without skills"
          }
          // Jump filter — AssessmentListView reads ?skills=empty
          href={`${basePath}?skills=empty`}
        />
        <Divider />
        <PulseStat
          icon={ClipboardCheck}
          count={pulse.childrenPendingCount}
          label={
            pulse.childrenPendingCount === 1
              ? "child pending this term"
              : "children pending this term"
          }
          // Same surface — drills into the "ratings missing" lens.
          href={`${basePath}?pending=term`}
        />
        <Divider />
        <PulseStat
          icon={UserX}
          count={pulse.coachesUnsubmittedCount}
          label={
            pulse.coachesUnsubmittedCount === 1
              ? "coach silent this week"
              : "coaches silent this week"
          }
          href={`${basePath}?coaches=silent`}
        />
        <Divider />
        <PulseStat
          icon={Sparkles}
          count={pulse.newTemplatesThisWeekCount}
          label={
            pulse.newTemplatesThisWeekCount === 1
              ? "new this week"
              : "new this week"
          }
          href={`${basePath}?new=this_week`}
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
