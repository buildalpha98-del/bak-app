"use client";

// ============================================================
// Parent portal — status pulse strips
// ============================================================
//
// Two strips share the same calm-by-default visual rhythm used in
// the client/coach/ops portals: rounded-2xl card, divider-separated
// stats, restrained brand orange (#E8712A) on active items only,
// useCountUp tick-up for numeric counts.
//
//   ParentHomePulseStrip    — /parent. Next session · unpaid bookings
//     · waitlist offers · new insights · expiring packages.
//   ParentBookingPulseStrip — /parent/book. Sessions today · next
//     available · on waitlist · packages ending soon.
//
// Both surfaces stay quiet when there's nothing to nudge — empty
// pulses render as muted text, no badges, no flashing. The home
// strip is the consumer-facing morale boost when everything is in
// order; the booking strip is purely informational and never
// solicits an action on its own.

import { Fragment } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CreditCard,
  BellRing,
  Sparkles,
  Package,
  type LucideIcon,
} from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";
import type {
  ParentStatusPulse,
  ParentBookingPulse,
} from "@/lib/parent/status-pulse-actions";

// ============================================================
// Home pulse strip — /parent
// ============================================================

interface ParentHomePulseStripProps {
  pulse: ParentStatusPulse;
}

export function ParentHomePulseStrip({ pulse }: ParentHomePulseStripProps) {
  const nextSessionLabel = formatNextSessionLabel(pulse.nextSessionDays);

  return (
    <div className="rounded-2xl border bg-background px-4 py-3 transition-shadow hover:shadow-sm">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <LabelStat
          icon={CalendarClock}
          label={nextSessionLabel}
          active={pulse.nextSessionDays !== null}
          href="/parent/bookings"
        />
        <Divider />
        <PulseStat
          icon={BellRing}
          count={pulse.waitlistOffersCount}
          label={
            pulse.waitlistOffersCount === 1
              ? "waitlist offer"
              : "waitlist offers"
          }
          href="/parent/bookings?tab=waitlist"
        />
        <Divider />
        <PulseStat
          icon={CreditCard}
          count={pulse.unpaidBookingsCount}
          label={
            pulse.unpaidBookingsCount === 1
              ? "unpaid booking"
              : "unpaid bookings"
          }
          href="/parent/bookings"
        />
        <Divider />
        <PulseStat
          icon={Sparkles}
          count={pulse.newInsightsCount}
          label={
            pulse.newInsightsCount === 1 ? "new insight" : "new insights"
          }
          href="/parent/kids"
        />
        <Divider />
        <PulseStat
          icon={Package}
          count={pulse.expiringPackagesCount}
          label={
            pulse.expiringPackagesCount === 1
              ? "pack ending soon"
              : "packs ending soon"
          }
          href="/parent/packages"
        />
      </ul>
    </div>
  );
}

// ============================================================
// Booking pulse strip — /parent/book
// ============================================================

interface ParentBookingPulseStripProps {
  pulse: ParentBookingPulse;
}

export function ParentBookingPulseStrip({
  pulse,
}: ParentBookingPulseStripProps) {
  const nextLabel = formatNextAvailableLabel(pulse.nextAvailableDays);

  return (
    <div className="rounded-2xl border bg-background px-4 py-3 transition-shadow hover:shadow-sm">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={CalendarClock}
          count={pulse.sessionsAvailableTodayCount}
          label={
            pulse.sessionsAvailableTodayCount === 1
              ? "session today"
              : "sessions today"
          }
        />
        <Divider />
        <LabelStat
          icon={CalendarClock}
          label={nextLabel}
          active={pulse.nextAvailableDays !== null}
        />
        <Divider />
        <PulseStat
          icon={BellRing}
          count={pulse.onWaitlistCount}
          label={pulse.onWaitlistCount === 1 ? "waitlist seat" : "waitlist seats"}
          href="/parent/bookings?tab=waitlist"
        />
        <Divider />
        <PulseStat
          icon={Package}
          count={pulse.packagesEndingSoonCount}
          label={
            pulse.packagesEndingSoonCount === 1
              ? "pack ending"
              : "packs ending"
          }
          href="/parent/packages"
        />
      </ul>
    </div>
  );
}

// ============================================================
// Generic per-page strip (parent variant)
// ============================================================

export interface ParentPulseStat {
  icon: LucideIcon;
  count: number;
  label: string;
  href?: string;
}

interface ParentPulseStripProps {
  stats: ParentPulseStat[];
}

export function ParentPulseStrip({ stats }: ParentPulseStripProps) {
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
    <span className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40">
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
    </span>
  );
  return <li>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
}

function LabelStat({
  icon: Icon,
  label,
  active,
  href,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  href?: string;
}) {
  const inner = (
    <span className="group inline-flex items-center gap-1.5 rounded-md -mx-1 px-1 transition hover:bg-muted/40">
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
            ? "text-sm font-medium text-foreground group-hover:underline"
            : "text-sm text-muted-foreground group-hover:underline"
        }
      >
        {label}
      </span>
    </span>
  );
  return <li>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
}

function formatNextSessionLabel(days: number | null): string {
  if (days === null) return "no upcoming session";
  if (days <= 0) return "next session today";
  if (days === 1) return "next session tomorrow";
  return `next session in ${days} days`;
}

function formatNextAvailableLabel(days: number | null): string {
  if (days === null) return "no open spots";
  if (days <= 0) return "next opening today";
  if (days === 1) return "next opening tomorrow";
  return `next opening in ${days} days`;
}
