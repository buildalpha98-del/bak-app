"use client";

// ============================================================
// Campaigns — inline status pulse strip
// ============================================================

import Link from "@/components/ui/app-link";
import { Megaphone, Mail, Clock, Ticket } from "lucide-react";
import type { CampaignsStatusPulse } from "@/lib/reengagement/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface CampaignsStatusPulseStripProps {
  pulse: CampaignsStatusPulse;
  basePath: string;
}

export function CampaignsStatusPulseStrip({
  pulse,
  basePath,
}: CampaignsStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Megaphone}
          count={pulse.activeCampaignsCount}
          label={
            pulse.activeCampaignsCount === 1 ? "active campaign" : "active campaigns"
          }
          href={`${basePath}?status=active`}
        />
        <Divider />
        <PulseStat
          icon={Mail}
          count={pulse.sendsThisWeekCount}
          label="sends this week"
          href={`${basePath}?tab=reporting`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.unsentCount}
          label={pulse.unsentCount === 1 ? "send pending" : "sends pending"}
          href={`${basePath}?send_status=pending`}
        />
        <Divider />
        <PulseStat
          icon={Ticket}
          count={pulse.expiringDiscountCodesCount}
          label="discount codes expiring (14d)"
          href={`${basePath}?tab=reporting&discounts=expiring`}
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
