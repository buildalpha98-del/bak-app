"use client";

// ============================================================
// Equipment — inline status pulse strip
// ============================================================
//
// Mirrors the centres / staff / children / performance / assessments
// / programmes / training pulse pattern. Four counts: damaged-or-
// missing items, low-stock kits, overdue coach check-ins, and
// unassigned storage kits. Brand orange when a count is > 0, muted
// when zero. Numbers tick up via `useCountUp` to match the rest of
// the dashboard refresh.

import Link from "@/components/ui/app-link";
import { Wrench, PackageX, Clock, Warehouse } from "lucide-react";
import type { EquipmentStatusPulse } from "@/lib/equipment/status-pulse-actions";
import { useCountUp } from "@/components/launch/use-count-up";

interface EquipmentStatusPulseStripProps {
  pulse: EquipmentStatusPulse;
  /** "/admin/equipment" or "/ops/equipment" — jump-links keep us in scope. */
  basePath: string;
}

export function EquipmentStatusPulseStrip({
  pulse,
  basePath,
}: EquipmentStatusPulseStripProps) {
  return (
    <div className="rounded-2xl border bg-background px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <PulseStat
          icon={Wrench}
          count={pulse.damagedOrMissingCount}
          label={
            pulse.damagedOrMissingCount === 1
              ? "damaged or missing"
              : "damaged or missing"
          }
          href={`${basePath}?tab=inventory&condition=damaged`}
        />
        <Divider />
        <PulseStat
          icon={PackageX}
          count={pulse.lowStockKitsCount}
          label={
            pulse.lowStockKitsCount === 1
              ? "low-stock kit"
              : "low-stock kits"
          }
          href={`${basePath}?tab=kits&stock=low`}
        />
        <Divider />
        <PulseStat
          icon={Clock}
          count={pulse.overdueCheckinsCount}
          label={
            pulse.overdueCheckinsCount === 1
              ? "overdue check-in"
              : "overdue check-ins"
          }
          href={`${basePath}?tab=kits&location=coach&checkin=overdue`}
        />
        <Divider />
        <PulseStat
          icon={Warehouse}
          count={pulse.unassignedKitsCount}
          label={
            pulse.unassignedKitsCount === 1
              ? "unassigned kit"
              : "unassigned kits"
          }
          href={`${basePath}?tab=kits&location=storage&assigned=no`}
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
