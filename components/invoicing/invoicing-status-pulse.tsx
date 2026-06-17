"use client";

// ============================================================
// Invoicing — inline status pulse strip
// ============================================================
//
// Mirrors the training / programs / equipment / documents pulse
// pattern. Four counts: overdue invoices, awaiting payment, flagged
// (coach) invoices, sent this week. Brand orange when > 0, muted when
// zero. Numbers tick up via `useCountUp`.

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Flag,
  Send,
} from "lucide-react";
import type { InvoicingStatusPulse } from "@/lib/invoicing/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface InvoicingStatusPulseStripProps {
  pulse: InvoicingStatusPulse;
  /** "/admin/invoicing" or "/ops/invoicing" — jump-links keep us in scope. */
  basePath: string;
}

export function InvoicingStatusPulseStrip({
  pulse,
  basePath,
}: InvoicingStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.overdueInvoicesCount}
          label={
            pulse.overdueInvoicesCount === 1
              ? "overdue invoice"
              : "overdue invoices"
          }
          href={`${basePath}/ageing?bucket=overdue`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.awaitingPaymentCount}
          label="awaiting payment"
          href={`${basePath}/outbound?status=sent`}
        />
        <Divider />
        <PulseStat
          icon={Flag}
          count={pulse.flaggedInvoicesCount}
          label={
            pulse.flaggedInvoicesCount === 1
              ? "flagged for review"
              : "flagged for review"
          }
          href={`${basePath}?tab=flagged`}
        />
        <Divider />
        <PulseStat
          icon={Send}
          count={pulse.sentThisWeekCount}
          label="sent this week"
          href={`${basePath}/outbound?sent=this_week`}
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
