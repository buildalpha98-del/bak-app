"use client";

// ============================================================
// Onboarding list — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children pulse strips. Each count is
// a jump-link that flips a URL filter param on the onboarding list,
// so a busy ops user can land on "behind schedule" without changing
// pages. Brand orange when a count is > 0, muted when zero — calm
// surface when there's no action to take.

import Link from "next/link";
import {
  CircleDashed,
  AlertTriangle,
  CheckCircle2,
  Mail,
} from "lucide-react";
import type { OnboardingStatusPulse } from "@/lib/onboarding/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface OnboardingStatusPulseStripProps {
  pulse: OnboardingStatusPulse;
  /** "/admin/onboarding" or "/ops/onboarding" — keeps jump-links in scope. */
  basePath: string;
}

export function OnboardingStatusPulseStrip({
  pulse,
  basePath,
}: OnboardingStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={CircleDashed}
          count={pulse.inProgressCount}
          label={pulse.inProgressCount === 1 ? "in progress" : "in progress"}
          href={`${basePath}?status=in_progress`}
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.behindScheduleCount}
          label="behind schedule"
          href={`${basePath}?status=behind`}
        />
        <Divider />
        <PulseStat
          icon={CheckCircle2}
          count={pulse.completedThisWeekCount}
          label="completed this week"
          href={`${basePath}?status=complete`}
        />
        <Divider />
        <PulseStat
          icon={Mail}
          count={pulse.waitingOnEmailCount}
          label={
            pulse.waitingOnEmailCount === 1
              ? "email waiting to send"
              : "emails waiting to send"
          }
          href={`${basePath}?queued=yes`}
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
