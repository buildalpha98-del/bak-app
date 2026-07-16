"use client";

// ============================================================
// Payroll — inline status pulse strip
// ============================================================

import Link from "@/components/ui/app-link";
import {
  Calculator,
  AlertCircle,
  Send,
  CheckCircle2,
} from "lucide-react";
import type { PayrollStatusPulse } from "@/lib/invoicing/payroll-status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface PayrollStatusPulseStripProps {
  pulse: PayrollStatusPulse;
  basePath?: string;
}

export function PayrollStatusPulseStrip({
  pulse,
  basePath = "/admin/payroll",
}: PayrollStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Calculator}
          count={pulse.awaitingCalculationCount}
          label={
            pulse.awaitingCalculationCount === 1
              ? "awaiting calculation"
              : "awaiting calculation"
          }
          href={`${basePath}?status=calculating`}
        />
        <Divider />
        <PulseStat
          icon={AlertCircle}
          count={pulse.awaitingApprovalCount}
          label="awaiting approval"
          href={`${basePath}?status=calculated`}
        />
        <Divider />
        <PulseStat
          icon={Send}
          count={pulse.approvedUnpaidCount}
          label="approved unpaid"
          href={`${basePath}?status=approved`}
        />
        <Divider />
        <PulseStat
          icon={CheckCircle2}
          count={pulse.paidThisFortnightCount}
          label="paid this fortnight"
          href={`${basePath}?status=paid`}
        />
      </ul>
    </div>
  );
}

function Divider() {
  return (
    <li aria-hidden className="hidden h-4 w-px bg-border sm:inline-block" />
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
