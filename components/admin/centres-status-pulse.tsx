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
import { computeDelta } from "@/lib/comparison/delta";
import { ComparisonBadge } from "@/components/shared/comparison-badge";

interface CentresStatusPulseStripProps {
  pulse: CentresStatusPulse;
  /** "/admin/centres" or "/ops/centres" — for the at-risk + onboarding jumps. */
  basePath: string;
  /** Optional prior-period counts; when present we render comparison badges. */
  previous?: CentresStatusPulse;
  /** Short label shown in the badge tooltip, e.g. "vs last week". */
  compareLabel?: string;
}

export function CentresStatusPulseStrip({
  pulse,
  basePath,
  previous,
  compareLabel,
}: CentresStatusPulseStripProps) {
  // Compute deltas once at the top so each PulseStat receives a
  // ready-made `delta` prop (keeps the badge rendering branch-free).
  // "Down is good" everywhere here — fewer at-risk / overdue /
  // behind centres is unambiguously better.
  const atRiskDelta = previous
    ? computeDelta(pulse.atRiskCount, previous.atRiskCount, {
        goodDirection: "down",
      })
    : undefined;
  const overdueDelta = previous
    ? computeDelta(pulse.overdueInvoiceCount, previous.overdueInvoiceCount, {
        goodDirection: "down",
      })
    : undefined;
  const behindDelta = previous
    ? computeDelta(pulse.behindOnboardingCount, previous.behindOnboardingCount, {
        goodDirection: "down",
      })
    : undefined;
  const badgeLabel = compareLabel ? `vs ${compareLabel}` : undefined;

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
          delta={atRiskDelta}
          badgeLabel={badgeLabel}
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
          href="/admin/invoicing?filter=overdue"
          delta={overdueDelta}
          badgeLabel={badgeLabel}
        />
        <Divider />
        <PulseStat
          icon={Compass}
          count={pulse.behindOnboardingCount}
          label="behind on onboarding"
          href={`${basePath}?onboarding=behind`}
          delta={behindDelta}
          badgeLabel={badgeLabel}
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
  delta,
  badgeLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  href: string;
  delta?: import("@/lib/comparison/delta").ComparisonDelta;
  badgeLabel?: string;
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
            active ? "size-3.5 text-primary" : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-base font-semibold tabular-nums text-primary"
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
        {delta ? (
          <ComparisonBadge delta={delta} label={badgeLabel} format="auto" />
        ) : null}
      </Link>
    </li>
  );
}
