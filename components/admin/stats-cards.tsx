"use client";

import { Users, ClipboardCheck, UserCheck, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AdminDashboardStats } from "@/lib/admin/dashboard-stats";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: number;
  label: string;
}

function StatCard({ icon: Icon, value, label }: StatCardProps) {
  return (
    <Card className="min-h-[44px]">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-orange-light)]">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface StatsCardsProps {
  stats: AdminDashboardStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Users}
        value={stats.totalActiveChildren}
        label="Children Tracked"
      />
      <StatCard
        icon={ClipboardCheck}
        value={stats.assessmentsCompletedThisTerm}
        label="Assessments This Term"
      />
      <StatCard
        icon={UserCheck}
        value={stats.namedAttendanceSessions}
        label="Named Attendance Sessions"
      />
      <StatCard
        icon={Hash}
        value={stats.headcountOnlySessions}
        label="Headcount-Only Sessions"
      />
    </div>
  );
}
