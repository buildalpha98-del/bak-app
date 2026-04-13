"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, GraduationCap, DollarSign, Users,
  CheckCircle2, AlertTriangle, AlertCircle,
  Calendar, CreditCard, UserPlus, Receipt, Clock,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRecentActivity } from "@/lib/launch/dashboard-actions";
import type { DashboardMetrics, ActivityItem } from "@/lib/launch/dashboard-actions";

// ========================
// Colour palette
// ========================

const COLOURS = {
  childcare: "#E8712A", // brand orange
  school: "#2962FF",
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  grey: "#94A3B8",
};

// ========================
// Helpers
// ========================

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCurrencyFull(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-AU");
}

function progressColour(pct: number): string {
  if (pct >= 50) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

// ========================
// Main Dashboard
// ========================

export function LaunchDashboard({
  metrics,
  initialActivity,
}: {
  metrics: DashboardMetrics;
  initialActivity: ActivityItem[];
}) {
  const [activity, setActivity] = useState(initialActivity);

  // Auto-refresh activity every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await getRecentActivity(20);
      setActivity(fresh);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
          Launch Dashboard
        </p>
        <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
          Build Alpha Kids
        </h1>
        <p className="mt-2 text-muted-foreground">
          Year 1 targets: 40 centres, 10 schools, $400K revenue
        </p>
      </div>

      {/* ROW 1 — Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Building2}
          label="Active Centres"
          value={metrics.centres.active}
          target={metrics.centres.target}
          suffix={`/ ${metrics.centres.target}`}
          footer={`${metrics.centres.newThisMonth} new this month`}
          iconBg="bg-orange-100"
          iconColor="text-[#E8712A]"
        />
        <MetricCard
          icon={GraduationCap}
          label="Active Schools"
          value={metrics.schools.active}
          target={metrics.schools.target}
          suffix={`/ ${metrics.schools.target}`}
          footer={`${metrics.schools.totalEnrolledStudents} enrolled students`}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <MetricCard
          icon={DollarSign}
          label="Revenue (YTD)"
          value={fmtCurrency(metrics.revenue.thisYear)}
          numericValue={metrics.revenue.thisYear}
          target={metrics.revenue.yearTarget}
          suffix={`/ ${fmtCurrency(metrics.revenue.yearTarget)}`}
          footer={metrics.revenue.isEstimate ? "Estimated from sessions" : `${fmtCurrency(metrics.revenue.thisMonth)} this month`}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <CoachesCard coaches={metrics.coaches} />
      </div>

      {/* ROW 2 — Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.revenue.monthlyBreakdown} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => fmtCurrency(v)} />
                  <Tooltip
                    formatter={(v) => fmtCurrencyFull(Number(v))}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="childcare" stackId="a" fill={COLOURS.childcare} name="Childcare" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="school" stackId="a" fill={COLOURS.school} name="School" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Growth line chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Centre &amp; School Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.growth.monthlyBreakdown} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="centres"
                    stroke={COLOURS.childcare}
                    strokeWidth={2}
                    name="Centres"
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="schools"
                    stroke={COLOURS.school}
                    strokeWidth={2}
                    name="Schools"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — Revenue Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Split</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Childcare", value: metrics.revenue.childcareRevenue },
                      { name: "School", value: metrics.revenue.schoolRevenue },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill={COLOURS.childcare} />
                    <Cell fill={COLOURS.school} />
                  </Pie>
                  <Tooltip formatter={(v) => fmtCurrencyFull(Number(v))} contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Breakdown below the chart for quick reading */}
            <div className="mt-2 flex justify-around text-sm">
              <div className="text-center">
                <p className="text-muted-foreground text-xs">Childcare</p>
                <p className="font-bold" style={{ color: COLOURS.childcare }}>
                  {fmtCurrencyFull(metrics.revenue.childcareRevenue)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground text-xs">School</p>
                <p className="font-bold" style={{ color: COLOURS.school }}>
                  {fmtCurrencyFull(metrics.revenue.schoolRevenue)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Earners This Term</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.topEntities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No revenue data for this term yet.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-sm min-w-[320px]">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left pb-2 font-medium">Name</th>
                      <th className="text-left pb-2 font-medium">Type</th>
                      <th className="text-right pb-2 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.topEntities.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2 font-medium truncate max-w-[180px]">{e.name || "—"}</td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {e.type === "school" ? "School" : "Centre"}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-medium whitespace-nowrap">{fmtCurrencyFull(e.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ROW 4 — Coach Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coach Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.coaches.list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No coaches yet.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[360px]">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left pb-2 font-medium">Coach</th>
                    <th className="text-right pb-2 font-medium whitespace-nowrap">Sessions</th>
                    <th className="text-center pb-2 font-medium">Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.coaches.list.slice(0, 10).map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3">
                        <Link
                          href={`/admin/staff/${c.id}`}
                          className="font-medium hover:text-primary hover:underline flex items-center min-h-[44px]"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-3 text-right">{c.sessionsThisWeek}</td>
                      <td className="py-3 text-center">
                        <ComplianceIcon status={c.complianceStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ROW 5 — Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No activity yet.
            </p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {activity.map((item: ActivityItem, i: number) => (
                <ActivityRow key={`${item.type}-${i}`} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ========================
// Sub-components
// ========================

function MetricCard({
  icon: Icon,
  label,
  value,
  numericValue,
  target,
  suffix,
  footer,
  iconBg,
  iconColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  numericValue?: number;
  target?: number;
  suffix?: string;
  footer?: string;
  iconBg: string;
  iconColor: string;
}) {
  const actualNum = numericValue ?? (typeof value === "number" ? value : 0);
  const pct = target ? Math.min(100, (actualNum / target) * 100) : 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-bold">{value}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
        </div>
        {target && (
          <div className="mt-3">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${progressColour(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {footer && <p className="text-xs text-muted-foreground mt-2">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function CoachesCard({ coaches }: { coaches: DashboardMetrics["coaches"] }) {
  const hasWarning = coaches.compliance.expiringSoon > 0 || coaches.compliance.expired > 0;

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Users className="h-5 w-5 text-purple-600" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Active Coaches</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-bold">{coaches.active}</span>
          <span className="text-sm text-muted-foreground">/ {coaches.total}</span>
        </div>
        {hasWarning ? (
          <p className="text-xs text-amber-700 mt-3 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {coaches.compliance.expired > 0 && `${coaches.compliance.expired} expired`}
            {coaches.compliance.expired > 0 && coaches.compliance.expiringSoon > 0 && ", "}
            {coaches.compliance.expiringSoon > 0 && `${coaches.compliance.expiringSoon} expiring soon`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-3">
            {coaches.avgSessionsPerWeek} sessions/coach/week avg
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceIcon({ status }: { status: "clear" | "warning" | "alert" }) {
  if (status === "clear")
    return <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />;
  if (status === "warning")
    return <AlertTriangle className="h-4 w-4 text-amber-600 mx-auto" />;
  return <AlertCircle className="h-4 w-4 text-red-600 mx-auto" />;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { icon: Icon, colour, bg } = getActivityStyle(item.type);
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${bg}`}>
        <Icon className={`h-4 w-4 ${colour}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{item.description}</p>
        <p className="text-xs text-muted-foreground">{timeAgo(item.timestamp)}</p>
      </div>
    </div>
  );
}

function getActivityStyle(type: ActivityItem["type"]): {
  icon: React.ComponentType<{ className?: string }>;
  colour: string;
  bg: string;
} {
  switch (type) {
    case "new_centre":
      return { icon: Building2, colour: "text-[#E8712A]", bg: "bg-orange-100" };
    case "new_booking":
      return { icon: Calendar, colour: "text-blue-600", bg: "bg-blue-100" };
    case "session_completed":
      return { icon: CheckCircle2, colour: "text-green-600", bg: "bg-green-100" };
    case "invoice_paid":
      return { icon: Receipt, colour: "text-emerald-600", bg: "bg-emerald-100" };
    case "new_coach":
      return { icon: UserPlus, colour: "text-purple-600", bg: "bg-purple-100" };
    default:
      return { icon: Clock, colour: "text-gray-600", bg: "bg-gray-100" };
  }
}
