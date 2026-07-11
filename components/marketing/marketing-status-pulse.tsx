"use client";

// ============================================================
// Marketing — inline status pulse strip
// ============================================================
//
// Mirrors the bookings / reports / tasks pulse pattern. Four
// counts: pending testimonials, approved this week, stale cache,
// web enquiries this week. Brand orange when a count is > 0,
// muted when zero. Numbers tick up via `useCountUp` to match the
// rest of the dashboard refresh.

import Link from "next/link";
import { MessageSquareQuote, Check, RefreshCw, Globe } from "lucide-react";
import type { MarketingStatusPulse } from "@/lib/marketing/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface MarketingStatusPulseStripProps {
  pulse: MarketingStatusPulse;
  /** "/admin/marketing" — jump-links stay in scope. */
  basePath: string;
}

export function MarketingStatusPulseStrip({
  pulse,
  basePath,
}: MarketingStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={MessageSquareQuote}
          count={pulse.pendingTestimonialsCount}
          label={
            pulse.pendingTestimonialsCount === 1
              ? "testimonial pending"
              : "testimonials pending"
          }
          href={`${basePath}?tab=testimonials&filter=pending`}
        />
        <Divider />
        <PulseStat
          icon={Check}
          count={pulse.approvedThisWeekCount}
          label="approved this week"
          href={`${basePath}?tab=testimonials&filter=approved&range=this_week`}
        />
        <Divider />
        <PulseStat
          icon={RefreshCw}
          count={pulse.staleCacheCount}
          label={
            pulse.staleCacheCount === 1
              ? "cache stale (>24h)"
              : "caches stale (>24h)"
          }
          href={`${basePath}?tab=stats`}
        />
        <Divider />
        <PulseStat
          icon={Globe}
          count={pulse.webEnquiriesCount}
          label={
            pulse.webEnquiriesCount === 1
              ? "web enquiry this week"
              : "web enquiries this week"
          }
          // CRM with web source + this-week filter — enquiries surface
          // there once converted to leads.
          href="/admin/crm?source=web&range=this_week"
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
