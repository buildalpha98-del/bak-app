"use client";

// ============================================================
// Client portal — status pulse strips
// ============================================================
//
// Two strips:
//
//   ClientHomePulseStrip  — used on /client/[centreId] (dashboard).
//     Next session in N days · unread reports · unpaid invoices ·
//     feedback this term. Active items use restrained brand orange
//     (#0891B2), muted otherwise — calm surface when nothing needs
//     attention.
//
//   ClientPortalPulseStrip — generic per-page strip used on
//     /reports, /invoices, /feedback, /resources, /messages. The
//     consumer hands it the stats array it wants to render. Same
//     useCountUp tick-up and orange-on-active treatment as the home
//     strip, so the visual rhythm is consistent across the portal.

import { Fragment } from "react";
import Link from "@/components/ui/app-link";
import {
  CalendarClock,
  FileText,
  Receipt,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";
import type { ClientStatusPulse } from "@/lib/client/status-pulse-actions";

// ============================================================
// Home pulse strip
// ============================================================

interface ClientHomePulseStripProps {
  pulse: ClientStatusPulse;
  centreId: string;
}

export function ClientHomePulseStrip({
  pulse,
  centreId,
}: ClientHomePulseStripProps) {
  const nextSessionLabel = formatNextSessionLabel(pulse.nextSessionDays);

  return (
    <div className="rounded-2xl border bg-background px-4 py-3 transition-shadow hover:shadow-sm">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <NextSessionStat
          icon={CalendarClock}
          label={nextSessionLabel}
          active={pulse.nextSessionDays !== null}
          href={`/client/${centreId}/schedule`}
        />
        <Divider />
        <PulseStat
          icon={FileText}
          count={pulse.unreadReportsCount}
          label={
            pulse.unreadReportsCount === 1
              ? "new report"
              : "new reports"
          }
          href={`/client/${centreId}/reports`}
        />
        <Divider />
        <PulseStat
          icon={Receipt}
          count={pulse.unpaidInvoicesCount}
          label={
            pulse.unpaidInvoicesCount === 1
              ? "unpaid invoice"
              : "unpaid invoices"
          }
          href={`/client/${centreId}/invoices`}
        />
        <Divider />
        <PulseStat
          icon={MessageCircle}
          count={pulse.newFeedbackThisTermCount}
          label={
            pulse.newFeedbackThisTermCount === 1
              ? "feedback submitted"
              : "feedback submitted"
          }
          href={`/client/${centreId}/feedback`}
        />
      </ul>
    </div>
  );
}

// ============================================================
// Generic per-page strip
// ============================================================

export interface ClientPortalPulseStat {
  icon: LucideIcon;
  count: number;
  label: string;
  href?: string;
}

interface ClientPortalPulseStripProps {
  stats: ClientPortalPulseStat[];
}

export function ClientPortalPulseStrip({ stats }: ClientPortalPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3 transition-shadow hover:shadow-sm">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {stats.map((stat, idx) => (
          <Fragment key={stat.label}>
            {idx > 0 && <Divider />}
            <PulseStat
              icon={stat.icon}
              count={stat.count}
              label={stat.label}
              href={stat.href}
            />
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Internals
// ============================================================

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
  icon: LucideIcon;
  count: number;
  label: string;
  href?: string;
}) {
  const active = count > 0;
  const ticked = useCountUp(count);
  const inner = (
    <span className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      <Icon
        className={
          active
            ? "size-3.5 text-[#0891B2]"
            : "size-3.5 text-muted-foreground"
        }
      />
      <span
        className={
          active
            ? "text-base font-semibold tabular-nums text-[#0891B2]"
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
    </span>
  );
  return <li>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
}

function NextSessionStat({
  icon: Icon,
  label,
  active,
  href,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Icon
          className={
            active
              ? "size-3.5 text-[#0891B2]"
              : "size-3.5 text-muted-foreground"
          }
        />
        <span
          className={
            active
              ? "text-sm font-medium text-foreground group-hover:underline"
              : "text-sm text-muted-foreground group-hover:underline"
          }
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

function formatNextSessionLabel(days: number | null): string {
  if (days === null) return "no upcoming session";
  if (days <= 0) return "next session today";
  if (days === 1) return "next session tomorrow";
  if (days < 7) return `next session in ${days} days`;
  return `next session in ${days} days`;
}
