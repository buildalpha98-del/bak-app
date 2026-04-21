"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Brain,
  DollarSign,
  Building2,
  Users,
  Calendar,
  Star,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  BarChart3,
  PieChart,
  Activity,
  UserCheck,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  Bar,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  getOverviewKPIs,
  getCohortAnalysis,
  getDemandAnalysis,
  getFinancialIntelligence,
  getCoachUtilisation,
  getGrowthMetrics,
} from "@/lib/intelligence/actions";
import type {
  OverviewKPIs,
  CohortRow,
  DemandSportRow,
  DemandSuburbRow,
  DemandTimeSlot,
  DemandDayOfWeek,
  FinancialCentreRow,
  MonthlyRevenue,
  CoachUtilRow,
  GrowthPoint,
} from "@/lib/intelligence/actions";

// ============================================================
// Constants
// ============================================================

const TABS = ["Overview", "Cohorts", "Demand", "Financial", "Growth"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  Overview: <Activity className="h-4 w-4" />,
  Cohorts: <Users className="h-4 w-4" />,
  Demand: <BarChart3 className="h-4 w-4" />,
  Financial: <DollarSign className="h-4 w-4" />,
  Growth: <TrendingUp className="h-4 w-4" />,
};

const CHART_ORANGE = "#E8712A";
const CHART_BLUE = "#3B82F6";
const CHART_GREEN = "#10B981";
const CHART_PURPLE = "#8B5CF6";
const CHART_TEAL = "#14B8A6";

const BAR_COLOURS = [
  CHART_ORANGE,
  CHART_BLUE,
  CHART_GREEN,
  CHART_PURPLE,
  CHART_TEAL,
  "#F59E0B",
  "#EF4444",
  "#6366F1",
  "#EC4899",
  "#06B6D4",
];

// ============================================================
// Helpers
// ============================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

function changeIndicator(current: number, previous: number) {
  if (current === previous) return { icon: <Minus className="h-3 w-3" />, colour: "text-gray-500", text: "No change" };
  const pctChange = previous !== 0 ? Math.round(((current - previous) / Math.abs(previous)) * 100) : current > 0 ? 100 : 0;
  const isPositive = current > previous;
  return {
    icon: isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />,
    colour: isPositive ? "text-green-600" : "text-red-600",
    text: `${isPositive ? "+" : ""}${pctChange}% vs last month`,
  };
}

function retentionCellColour(percentage: number): string {
  if (percentage >= 80) return "bg-green-600 text-white";
  if (percentage >= 60) return "bg-green-400 text-white";
  if (percentage >= 40) return "bg-yellow-400 text-gray-900";
  if (percentage >= 20) return "bg-orange-400 text-white";
  return "bg-red-500 text-white";
}

function suburbHeatColour(value: number, max: number): string {
  if (max === 0) return "bg-gray-100";
  const ratio = value / max;
  if (ratio >= 0.8) return "bg-[#E8712A] text-white";
  if (ratio >= 0.6) return "bg-[#E8712A]/70 text-white";
  if (ratio >= 0.4) return "bg-[#E8712A]/40 text-gray-900";
  if (ratio >= 0.2) return "bg-[#E8712A]/20 text-gray-900";
  return "bg-[#E8712A]/5 text-gray-700";
}

// ============================================================
// KPI Card
// ============================================================

function KpiCard({
  title,
  value,
  icon,
  current,
  previous,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  current: number;
  previous: number;
}) {
  const change = changeIndicator(current, previous);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-[#666666]">{title}</p>
            <p className="text-2xl font-bold text-[#1A1A1A]">{value}</p>
          </div>
          <div className="rounded-lg bg-[#E8712A]/10 p-2.5 text-[#E8712A]">
            {icon}
          </div>
        </div>
        <div className={`mt-3 flex items-center gap-1 text-xs ${change.colour}`}>
          {change.icon}
          <span>{change.text}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab Components
// ============================================================

function OverviewTab({ kpis }: { kpis: OverviewKPIs }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        title="Revenue (This Month)"
        value={formatCurrency(kpis.totalRevenue)}
        icon={<DollarSign className="h-5 w-5" />}
        current={kpis.totalRevenue}
        previous={kpis.prevTotalRevenue}
      />
      <KpiCard
        title="Active Centres"
        value={kpis.activeCentres.toString()}
        icon={<Building2 className="h-5 w-5" />}
        current={kpis.activeCentres}
        previous={kpis.prevActiveCentres}
      />
      <KpiCard
        title="Active Parents"
        value={kpis.activeParents.toString()}
        icon={<Users className="h-5 w-5" />}
        current={kpis.activeParents}
        previous={kpis.prevActiveParents}
      />
      <KpiCard
        title="Avg Sessions / Week"
        value={kpis.avgSessionsPerWeek.toString()}
        icon={<Calendar className="h-5 w-5" />}
        current={kpis.avgSessionsPerWeek}
        previous={kpis.prevAvgSessionsPerWeek}
      />
      <KpiCard
        title="Avg Rating"
        value={`${kpis.avgRating} / 5`}
        icon={<Star className="h-5 w-5" />}
        current={kpis.avgRating}
        previous={kpis.prevAvgRating}
      />
      <KpiCard
        title="Lead Conversion Rate"
        value={`${kpis.conversionRate}%`}
        icon={<Target className="h-5 w-5" />}
        current={kpis.conversionRate}
        previous={kpis.prevConversionRate}
      />
    </div>
  );
}

function CohortsTab({ cohorts }: { cohorts: CohortRow[] }) {
  if (cohorts.length === 0) {
    return <EmptyState message="No cohort data available yet." />;
  }

  // Find max month offset across all cohorts
  const maxOffset = Math.max(
    ...cohorts.map((c) => Math.max(...Object.keys(c.retentionByMonth).map(Number)))
  );
  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Centre Cohort Retention</CardTitle>
        <CardDescription>
          How many centres from each monthly cohort remain active over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium text-[#666666]">
                  Cohort
                </th>
                <th className="px-3 py-2 text-left font-medium text-[#666666]">
                  Size
                </th>
                {offsets.map((o) => (
                  <th
                    key={o}
                    className="px-3 py-2 text-center font-medium text-[#666666]"
                  >
                    M{o}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohortMonth} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-[#1A1A1A]">
                    {formatMonth(cohort.cohortMonth)}
                  </td>
                  <td className="px-3 py-2 text-[#666666]">
                    {cohort.totalCentres}
                  </td>
                  {offsets.map((o) => {
                    const cell = cohort.retentionByMonth[o];
                    if (!cell) {
                      return (
                        <td key={o} className="px-3 py-2 text-center text-gray-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={o} className="px-1 py-1 text-center">
                        <div
                          className={`rounded px-2 py-1 text-xs font-medium ${retentionCellColour(cell.percentage)}`}
                          title={`${cell.count} of ${cohort.totalCentres}`}
                        >
                          {cell.percentage}%
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DemandTab({
  bySport,
  bySuburb,
  byHour,
  byDayOfWeek,
}: {
  bySport: DemandSportRow[];
  bySuburb: DemandSuburbRow[];
  byHour: DemandTimeSlot[];
  byDayOfWeek: DemandDayOfWeek[];
}) {
  const maxSuburbBookings = Math.max(...bySuburb.map((s) => s.bookingCount), 1);

  return (
    <div className="space-y-6">
      {/* Sport Popularity */}
      <Card>
        <CardHeader>
          <CardTitle>Sport Popularity</CardTitle>
          <CardDescription>Total bookings by sport</CardDescription>
        </CardHeader>
        <CardContent>
          {bySport.length === 0 ? (
            <EmptyState message="No booking data available." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySport.slice(0, 15)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="sport"
                    type="category"
                    width={75}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="bookingCount" name="Bookings" radius={[0, 4, 4, 0]}>
                    {bySport.slice(0, 15).map((_, i) => (
                      <Cell key={i} fill={BAR_COLOURS[i % BAR_COLOURS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suburb Demand */}
      <Card>
        <CardHeader>
          <CardTitle>Suburb Demand</CardTitle>
          <CardDescription>Sessions and bookings by suburb</CardDescription>
        </CardHeader>
        <CardContent>
          {bySuburb.length === 0 ? (
            <EmptyState message="No suburb data available." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-[#666666]">
                      Suburb
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[#666666]">
                      Sessions
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[#666666]">
                      Bookings
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[#666666]">
                      Intensity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bySuburb.slice(0, 20).map((row) => (
                    <tr key={row.suburb} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium text-[#1A1A1A]">
                        {row.suburb}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {row.sessionCount}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {row.bookingCount}
                      </td>
                      <td className="px-3 py-1">
                        <div
                          className={`inline-block rounded px-3 py-1 text-xs font-medium ${suburbHeatColour(row.bookingCount, maxSuburbBookings)}`}
                        >
                          {Math.round((row.bookingCount / maxSuburbBookings) * 100)}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time of Day */}
        <Card>
          <CardHeader>
            <CardTitle>Time of Day</CardTitle>
            <CardDescription>Bookings by hour</CardDescription>
          </CardHeader>
          <CardContent>
            {byHour.length === 0 ? (
              <EmptyState message="No time data available." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byHour}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={formatHour}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(h) => formatHour(h as number)}
                    />
                    <Bar
                      dataKey="bookingCount"
                      name="Bookings"
                      fill={CHART_ORANGE}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Day of Week */}
        <Card>
          <CardHeader>
            <CardTitle>Day of Week</CardTitle>
            <CardDescription>Bookings by day</CardDescription>
          </CardHeader>
          <CardContent>
            {byDayOfWeek.length === 0 ? (
              <EmptyState message="No day data available." />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDayOfWeek}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      dataKey="bookingCount"
                      name="Bookings"
                      fill={CHART_BLUE}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinancialTab({
  byCentre,
  monthlyRevenue,
  coachUtil,
}: {
  byCentre: FinancialCentreRow[];
  monthlyRevenue: MonthlyRevenue[];
  coachUtil: CoachUtilRow[];
}) {
  const [sortField, setSortField] = useState<keyof FinancialCentreRow>("revenue");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...byCentre].sort((a, b) => {
    const aVal = a[sortField] as number;
    const bVal = b[sortField] as number;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(field: keyof FinancialCentreRow) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  const sortIndicator = (field: keyof FinancialCentreRow) =>
    sortField === field ? (sortAsc ? " \u2191" : " \u2193") : "";

  return (
    <div className="space-y-6">
      {/* Revenue Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Trends</CardTitle>
          <CardDescription>Monthly revenue over time</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyRevenue.length === 0 ? (
            <EmptyState message="No revenue data available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value as number), "Revenue"]}
                    labelFormatter={(label) => formatMonth(String(label))}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={CHART_ORANGE}
                    strokeWidth={2}
                    dot={{ fill: CHART_ORANGE, r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profit Margins */}
      <Card>
        <CardHeader>
          <CardTitle>Profit Margins by Centre</CardTitle>
          <CardDescription>Top 10 centres by revenue with margins</CardDescription>
        </CardHeader>
        <CardContent>
          {byCentre.length === 0 ? (
            <EmptyState message="No financial data available." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCentre.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${v.toLocaleString()}`}
                  />
                  <YAxis
                    dataKey="centreName"
                    type="category"
                    width={95}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatCurrency(value as number),
                      String(name),
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_ORANGE} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="coachCosts" name="Coach Costs" fill={CHART_BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue per Centre Table */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue per Centre</CardTitle>
          <CardDescription>Click column headers to sort</CardDescription>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <EmptyState message="No centre revenue data available." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-[#666666]">
                      Centre
                    </th>
                    <SortableHeader
                      label="Revenue"
                      field="revenue"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                    <SortableHeader
                      label="Costs"
                      field="coachCosts"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                    <SortableHeader
                      label="Profit"
                      field="profit"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                    <SortableHeader
                      label="Margin"
                      field="margin"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                    <SortableHeader
                      label="Sessions"
                      field="sessionCount"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                    <SortableHeader
                      label="$/Session"
                      field="revenuePerSession"
                      current={sortField}
                      onSort={handleSort}
                      indicator={sortIndicator}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.centreId} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium text-[#1A1A1A]">
                        {row.centreName}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {formatCurrency(row.coachCosts)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={
                            row.profit >= 0 ? "text-green-600" : "text-red-600"
                          }
                        >
                          {formatCurrency(row.profit)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={
                            row.margin >= 50
                              ? "text-green-600"
                              : row.margin >= 20
                                ? "text-yellow-600"
                                : "text-red-600"
                          }
                        >
                          {row.margin}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {row.sessionCount}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {formatCurrency(row.revenuePerSession)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coach Utilisation */}
      <Card>
        <CardHeader>
          <CardTitle>Coach Utilisation</CardTitle>
          <CardDescription>
            Sessions, revenue, and utilisation rate per coach (last 90 days)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coachUtil.length === 0 ? (
            <EmptyState message="No coach data available." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-[#666666]">
                      Coach
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[#666666]">
                      Sessions
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[#666666]">
                      Revenue Generated
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-[#666666]">
                      Utilisation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coachUtil.map((row) => (
                    <tr key={row.coachId} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium text-[#1A1A1A]">
                        {row.coachName}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {row.sessionCount}
                      </td>
                      <td className="px-3 py-2 text-right text-[#666666]">
                        {formatCurrency(row.revenueGenerated)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-[#E8712A]"
                              style={{ width: `${row.utilisationRate}%` }}
                            />
                          </div>
                          <span
                            className={
                              row.utilisationRate >= 70
                                ? "text-green-600"
                                : row.utilisationRate >= 40
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          >
                            {row.utilisationRate}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GrowthTab({
  newCentres,
  newParents,
  bookingVolume,
  churnRate,
}: {
  newCentres: GrowthPoint[];
  newParents: GrowthPoint[];
  bookingVolume: GrowthPoint[];
  churnRate: GrowthPoint[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <GrowthChart
        title="New Centres per Month"
        description="Centre sign-ups over time"
        data={newCentres}
        colour={CHART_ORANGE}
        label="New Centres"
      />
      <GrowthChart
        title="New Parents per Month"
        description="Parent registrations over time"
        data={newParents}
        colour={CHART_BLUE}
        label="New Parents"
      />
      <GrowthChart
        title="Booking Volume"
        description="Total bookings per month"
        data={bookingVolume}
        colour={CHART_GREEN}
        label="Bookings"
      />
      <GrowthChart
        title="Churn Rate"
        description="Centre churn rate (%) per month"
        data={churnRate}
        colour="#EF4444"
        label="Churn %"
        isTrend
      />
    </div>
  );
}

// ============================================================
// Shared Components
// ============================================================

function GrowthChart({
  title,
  description,
  data,
  colour,
  label,
  isTrend = false,
}: {
  title: string;
  description: string;
  data: GrowthPoint[];
  colour: string;
  label: string;
  isTrend?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No data available yet." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {isTrend ? (
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip labelFormatter={(label) => formatMonth(String(label))} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name={label}
                    stroke={colour}
                    strokeWidth={2}
                    dot={{ fill: colour, r: 3 }}
                  />
                </LineChart>
              ) : (
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip labelFormatter={(label) => formatMonth(String(label))} />
                  <Bar
                    dataKey="count"
                    name={label}
                    fill={colour}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SortableHeader({
  label,
  field,
  current,
  onSort,
  indicator,
}: {
  label: string;
  field: keyof FinancialCentreRow;
  current: keyof FinancialCentreRow;
  onSort: (f: keyof FinancialCentreRow) => void;
  indicator: (f: keyof FinancialCentreRow) => string;
}) {
  return (
    <th
      className="cursor-pointer px-3 py-2 text-right font-medium text-[#666666] hover:text-[#E8712A]"
      onClick={() => onSort(field)}
    >
      {label}
      {indicator(field)}
    </th>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-[#666666]">
      {message}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [kpis, setKpis] = useState<OverviewKPIs | null>(null);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [demandData, setDemandData] = useState<{
    bySport: DemandSportRow[];
    bySuburb: DemandSuburbRow[];
    byHour: DemandTimeSlot[];
    byDayOfWeek: DemandDayOfWeek[];
  }>({ bySport: [], bySuburb: [], byHour: [], byDayOfWeek: [] });
  const [financialData, setFinancialData] = useState<{
    byCentre: FinancialCentreRow[];
    monthlyRevenue: MonthlyRevenue[];
  }>({ byCentre: [], monthlyRevenue: [] });
  const [coachUtil, setCoachUtil] = useState<CoachUtilRow[]>([]);
  const [growthData, setGrowthData] = useState<{
    newCentres: GrowthPoint[];
    newParents: GrowthPoint[];
    bookingVolume: GrowthPoint[];
    churnRate: GrowthPoint[];
  }>({ newCentres: [], newParents: [], bookingVolume: [], churnRate: [] });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, cohortRes, demandRes, financialRes, coachRes, growthRes] =
        await Promise.all([
          getOverviewKPIs(),
          getCohortAnalysis(),
          getDemandAnalysis(),
          getFinancialIntelligence(),
          getCoachUtilisation(),
          getGrowthMetrics(),
        ]);

      // Check for errors
      const errors = [
        kpiRes.error,
        cohortRes.error,
        demandRes.error,
        financialRes.error,
        coachRes.error,
        growthRes.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        setError(errors[0]!);
      }

      if (kpiRes.data) setKpis(kpiRes.data);
      setCohorts(cohortRes.data);
      setDemandData(demandRes.data);
      setFinancialData(financialRes.data);
      setCoachUtil(coachRes.data);
      setGrowthData(growthRes.data);
    } catch {
      toast.error("Could not load intelligence data. Please refresh.");
      setError("Failed to load intelligence data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="animate-fade-up space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[#E8712A]/10 p-2 text-[#E8712A]">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">
              Business Intelligence
            </h1>
            <p className="text-sm text-[#666666]">
              Analytics, cohorts, demand patterns, and financial insights
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-[#E8712A] text-[#E8712A]"
                : "text-[#666666] hover:text-[#1A1A1A]"
            }`}
          >
            {TAB_ICONS[tab]}
            {tab}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#E8712A]" />
        </div>
      )}

      {/* Tab Content */}
      {!loading && (
        <>
          {activeTab === "Overview" && kpis && <OverviewTab kpis={kpis} />}
          {activeTab === "Overview" && !kpis && (
            <EmptyState message="No overview data available." />
          )}

          {activeTab === "Cohorts" && <CohortsTab cohorts={cohorts} />}

          {activeTab === "Demand" && (
            <DemandTab
              bySport={demandData.bySport}
              bySuburb={demandData.bySuburb}
              byHour={demandData.byHour}
              byDayOfWeek={demandData.byDayOfWeek}
            />
          )}

          {activeTab === "Financial" && (
            <FinancialTab
              byCentre={financialData.byCentre}
              monthlyRevenue={financialData.monthlyRevenue}
              coachUtil={coachUtil}
            />
          )}

          {activeTab === "Growth" && (
            <GrowthTab
              newCentres={growthData.newCentres}
              newParents={growthData.newParents}
              bookingVolume={growthData.bookingVolume}
              churnRate={growthData.churnRate}
            />
          )}
        </>
      )}
    </div>
  );
}
