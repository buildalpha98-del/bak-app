"use client";

// ============================================================
// Referrals — inline status pulse strip
// ============================================================
//
// Mirrors the marketing / bookings / reports pulse pattern. Four
// counts: active codes, conversions this week, rewards pending,
// config drift. Brand orange when a count is > 0 (config drift is
// red because it's a real problem), muted when zero.

import Link from "@/components/ui/app-link";
import { Link2, TrendingUp, Gift, AlertTriangle } from "lucide-react";
import type { ReferralsStatusPulse } from "@/lib/referrals/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface ReferralsStatusPulseStripProps {
  pulse: ReferralsStatusPulse;
  /** "/admin/referrals" — jump-links stay in scope. */
  basePath: string;
}

export function ReferralsStatusPulseStrip({
  pulse,
  basePath,
}: ReferralsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Link2}
          count={pulse.activeCodesCount}
          label={
            pulse.activeCodesCount === 1 ? "active code" : "active codes"
          }
          href={`${basePath}?tab=Parent+Referrals`}
        />
        <Divider />
        <PulseStat
          icon={TrendingUp}
          count={pulse.conversionsThisWeekCount}
          label="conversions this week"
          href={`${basePath}?tab=Parent+Referrals&range=this_week`}
        />
        <Divider />
        <PulseStat
          icon={Gift}
          count={pulse.pendingRewardsCount}
          label="rewards pending"
          href={`${basePath}?tab=Rewards&status=pending`}
        />
        <Divider />
        <PulseStat
          icon={AlertTriangle}
          count={pulse.configDriftCount}
          label={
            pulse.configDriftCount === 1
              ? "config drift"
              : "config gaps"
          }
          href={`${basePath}?tab=Configuration`}
          tone="red"
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
  tone?: "orange" | "red";
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  const activeText =
    tone === "red" ? "text-red-600" : "text-primary";
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
