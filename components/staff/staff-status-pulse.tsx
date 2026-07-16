"use client";

// ============================================================
// Staff list — inline status pulse strip
// ============================================================
//
// Mirrors centres-status-pulse + crm-status-pulse — same row of
// inline counts above the filter chip bar, with jump-links that flip
// query params on this view rather than navigating away.
//
// Four counts: expired certs / pending verifications / not rostered
// this week / onboarding. Brand orange when a count is >0, muted
// when zero — a clean board reads calm rather than alarming. Number
// values tick up via `useCountUp` for the same first-paint warmth as
// the home dashboard cards.

import Link from "@/components/ui/app-link";
import { AlertTriangle, FileWarning, CalendarOff, UserCog } from "lucide-react";
import type { StaffStatusPulse } from "@/lib/staff/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface StaffStatusPulseStripProps {
  pulse: StaffStatusPulse;
  /** "/admin/staff" or "/ops/staff" — jump-links keep us in scope. */
  basePath: string;
}

export function StaffStatusPulseStrip({
  pulse,
  basePath,
}: StaffStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.expiredCertsCount}
          label={
            pulse.expiredCertsCount === 1
              ? "expired cert"
              : "expired certs"
          }
          href={`${basePath}?compliance=expired`}
        />
        <Divider />
        <PulseStat
          icon={FileWarning}
          count={pulse.pendingVerificationsCount}
          label={
            pulse.pendingVerificationsCount === 1
              ? "pending verification"
              : "pending verifications"
          }
          href={`${basePath}?compliance=pending`}
        />
        <Divider />
        <PulseStat
          icon={CalendarOff}
          count={pulse.notRosteredThisWeekCount}
          label="not rostered this week"
          href={`${basePath}?utilisation=zero`}
        />
        <Divider />
        <PulseStat
          icon={UserCog}
          count={pulse.onboardingCount}
          label="onboarding"
          href={`${basePath}?status=onboarding`}
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
