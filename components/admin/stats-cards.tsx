"use client";

import { Users, ClipboardCheck, UserCheck, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminDashboardStats } from "@/lib/admin/dashboard-stats";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
  accentColor: string;
  stripeClass: string;
  index: number;
}

function StatCard({ icon: Icon, value, label, accentColor, stripeClass, index }: StatCardProps) {
  return (
    <Card className={`stat-card ${stripeClass} min-h-[44px] card-hover animate-fade-up stagger-${index + 1}`}>
      <CardContent className="flex items-center gap-4 py-5 pl-6">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm"
          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="scoreboard-number text-3xl font-bold animate-count-up">{value}</p>
          <p className="text-xs font-medium text-muted-foreground mt-0.5 uppercase tracking-wider">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsCardsProps {
  stats: AdminDashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      icon: Users,
      value: stats.totalActiveChildren,
      label: "Children Tracked",
      accentColor: "#E8712A",
      stripeClass: "",
    },
    {
      icon: ClipboardCheck,
      value: stats.assessmentsCompletedThisTerm,
      label: "Assessments This Term",
      accentColor: "#4CAF50",
      stripeClass: "stat-card-green",
    },
    {
      icon: UserCheck,
      value: stats.namedAttendanceSessions,
      label: "Named Attendance",
      accentColor: "#2962FF",
      stripeClass: "stat-card-blue",
    },
    {
      icon: Hash,
      value: stats.headcountOnlySessions,
      label: "Headcount Only",
      accentColor: "#FFD600",
      stripeClass: "stat-card-yellow",
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card, i) => (
        <StatCard key={card.label} {...card} index={i} />
      ))}
    </div>
  );
}
