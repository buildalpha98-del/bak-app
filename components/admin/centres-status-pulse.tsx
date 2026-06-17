"use client";

// ============================================================
// Centres list — inline status pulse strip
// ============================================================
//
// Mirrors the admin home's sticky pulse pattern, but lives inline at
// the top of `/admin/centres`. Three small counts: at-risk centres,
// overdue invoices, behind-onboarding. Each count is a link that
// either filters this list or jumps to the relevant section.
//
// Styling notes:
// - `rounded-2xl border` container with subtle vertical dividers
//   between the three counts (mirrors the home pulse `gap-x-5`).
// - Brand orange (#E8712A) only when the count is positive; muted
//   when zero so a clean board looks calm rather than alarming.
// - This is a client component so the links honour Next routing
//   intercepts (useRouter prefetch) without a full page reload.

import Link from "next/link";
import { AlertTriangle, FileWarning, Compass } from "lucide-react";
import type { CentresStatusPulse } from "@/lib/centres/actions";

interface CentresStatusPulseStripProps {
  pulse: CentresStatusPulse;
  /** "/admin/centres" or "/ops/centres" — for the at-risk + onboarding jumps. */
  basePath: string;
}

export function CentresStatusPulseStrip({
  pulse,
  basePath,
}: CentresStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={AlertTriangle}
          count={pulse.atRiskCount}
          label={
            pulse.atRiskCount === 1 ? "centre at risk" : "centres at risk"
          }
          href={`${basePath}?status=active&risk=true`}
        />
        <Divider />
        <PulseStat
          icon={FileWarning}
          count={pulse.overdueInvoiceCount}
          label={
            pulse.overdueInvoiceCount === 1
              ? "invoice overdue"
              : "invoices overdue"
          }
          // Invoicing lives outside the centres area; the dashboard
          // home pulse uses the same /admin/invoicing?filter=overdue
          // URL so we match it for consistency.
          href="/admin/invoicing?filter=overdue"
        />
        <Divider />
        <PulseStat
          icon={Compass}
          count={pulse.behindOnboardingCount}
          label="behind on onboarding"
          href={`${basePath}?onboarding=behind`}
        />
      </ul>
    </div>
  );
}

function Divider() {
  // Hidden on the very narrow viewports where the row wraps; the row
  // gap takes over the visual separation in that mode.
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
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 transition hover:bg-muted/40"
      >
        <Icon
          className={
            active ? "size-3.5 text-[#E8712A]" : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-[#E8712A]"
              : "text-base font-semibold tabular-nums text-muted-foreground"
          }
        >
          {count}
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
