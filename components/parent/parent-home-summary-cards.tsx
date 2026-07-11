"use client";

// ============================================================
// Parent home — summary cards
// ============================================================
//
// Four lifetime/monthly stats animate in with useCountUp on first
// paint:
//
//   sessionsBooked   — every booking the parent has ever placed
//   sessionsCompleted — past confirmed bookings
//   spendMonthCents  — completed payments this month minus refunds
//   childCount       — kids on the profile (avatars row covers detail)
//
// The cards use the rounded-2xl + hover-lift treatment so the
// dashboard reads as warmer than the admin/ops tabular surfaces.

import { Calendar, Trophy, DollarSign, Users } from "lucide-react";
import { useCountUp } from "@/components/launch/use-count-up";

interface ParentHomeSummaryCardsProps {
  sessionsBooked: number;
  sessionsCompleted: number;
  spendMonthCents: number;
  childCount: number;
}

export function ParentHomeSummaryCards({
  sessionsBooked,
  sessionsCompleted,
  spendMonthCents,
  childCount,
}: ParentHomeSummaryCardsProps) {
  const booked = useCountUp(sessionsBooked);
  const completed = useCountUp(sessionsCompleted);
  const spendDollars = useCountUp(Math.round(spendMonthCents / 100));
  const kids = useCountUp(childCount);

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card
        icon={Calendar}
        label="Sessions booked"
        value={booked.toLocaleString("en-AU")}
        subtitle="All-time bookings"
      />
      <Card
        icon={Trophy}
        label="Sessions completed"
        value={completed.toLocaleString("en-AU")}
        subtitle="Lifetime attendance"
      />
      <Card
        icon={DollarSign}
        label="Spend this month"
        value={`$${spendDollars.toLocaleString("en-AU")}`}
        subtitle="Bookings & packs"
      />
      <Card
        icon={Users}
        label="Kids on profile"
        value={kids.toLocaleString("en-AU")}
        subtitle="Linked children"
      />
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-card p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#666666]">
          {label}
        </h3>
      </div>
      <p className="text-3xl font-bold text-[#1A1A1A] tabular-nums mt-1">
        {value}
      </p>
      <p className="text-xs text-[#666666] mt-1">{subtitle}</p>
    </div>
  );
}
