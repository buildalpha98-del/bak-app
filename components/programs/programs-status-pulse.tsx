"use client";

// ============================================================
// Programmes — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children / performance / assessments
// pulse pattern. Four counts: missing skills, unused (never assigned
// to a session), stale (used to land but drifted), new this week.
// Brand orange when a count is > 0, muted when zero. Numbers tick up
// via `useCountUp` to match the rest of the dashboard refresh.

import Link from "next/link";
import {
  AlertTriangle,
  CircleDashed,
  Hourglass,
  Sparkles,
} from "lucide-react";
import type { ProgramsStatusPulse } from "@/lib/programs/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface ProgramsStatusPulseStripProps {
  pulse: ProgramsStatusPulse;
  /** "/admin/programs" or "/ops/programs" — jump-links keep us in scope. */
  basePath: string;
}

export function ProgramsStatusPulseStrip({
  pulse,
  basePath,
}: ProgramsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.programmesMissingSkillsCount}
          label={
            pulse.programmesMissingSkillsCount === 1
              ? "programme missing skills"
              : "programmes missing skills"
          }
          href={`${basePath}?skills=empty`}
        />
        <Divider />
        <PulseStat
          icon={CircleDashed}
          count={pulse.programmesUnusedCount}
          label={
            pulse.programmesUnusedCount === 1
              ? "unused programme"
              : "unused programmes"
          }
          href={`${basePath}?usage=unused`}
        />
        <Divider />
        <PulseStat
          icon={Hourglass}
          count={pulse.programmesStaleCount}
          label={
            pulse.programmesStaleCount === 1 ? "stale programme" : "stale programmes"
          }
          href={`${basePath}?usage=stale`}
        />
        <Divider />
        <PulseStat
          icon={Sparkles}
          count={pulse.programmesNewThisWeekCount}
          label="new this week"
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
