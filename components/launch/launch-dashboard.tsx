"use client";

// ============================================================
// Admin home — Launch Dashboard
// ============================================================
//
// 5 rows:
//   1. KPI metric cards (Centres, Schools, Revenue, Coaches)
//   2. Monthly Revenue + Centre/School Growth charts
//   3. Revenue Split + Top Earners (replaced by Programme Mix when
//      the viewer doesn't have financial_access)
//   4. Coach Overview table
//   5. Recent Activity timeline + chip filter + view-all link
//
// Three behaviours wired in:
//   - Admin viewers see a pencil affordance on each KPI card with a
//     Y1 target; clicking opens an inline-edit popover.
//   - Numbers tick up from 0 → target on mount (useCountUp).
//   - When the viewer's `financial_access` is false, revenue is
//     hidden and the grid stays intact via fallback cards/columns.

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Building2,
  GraduationCap,
  DollarSign,
  Users,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Activity,
  TrendingUp,
} from "lucide-react";

// Recharts (~150kb) splits into its own chunk so the dashboard JS bundle
// stays small. Chart cards show a muted placeholder until the chunk
// streams in — usually faster than the data fetch behind them.
const ChartLoading = () => (
  <div className="h-full w-full animate-pulse rounded-lg bg-muted/30" />
);
const MonthlyRevenueChart = dynamic(
  () => import("./dashboard-charts").then((m) => m.MonthlyRevenueChart),
  { ssr: false, loading: ChartLoading }
);
const CentreGrowthChart = dynamic(
  () => import("./dashboard-charts").then((m) => m.CentreGrowthChart),
  { ssr: false, loading: ChartLoading }
);
const RevenueSplitPie = dynamic(
  () => import("./dashboard-charts").then((m) => m.RevenueSplitPie),
  { ssr: false, loading: ChartLoading }
);

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getRecentActivity,
  type DashboardMetrics,
  type ActivityItem,
} from "@/lib/launch/dashboard-actions";
import type { Profile } from "@/lib/types/database";
import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { Y1TargetEditPopover } from "@/components/admin/y1-target-edit-popover";
import { ComparisonBadge } from "@/components/shared/comparison-badge";
import { useCountUp } from "@/components/launch/use-count-up";

// ========================
// Palette
// ========================
//
// Brand orange is reserved for: primary KPI icon, status-pulse counts,
// active chips, save CTAs, today's timeline dots. Everywhere else uses
// neutral foreground / muted-foreground.

const BRAND = "#E8712A";
const BRAND_TINT = "#F4A87B";

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

function progressColour(pct: number): string {
  if (pct >= 50) return "bg-green-500";
  if (pct >= 25) return "bg-amber-500";
  return "bg-red-500";
}

// ========================
// Main Dashboard
// ========================

export interface LaunchDashboardProps {
  metrics: DashboardMetrics;
  initialActivity: ActivityItem[];
  profile: Pick<Profile, "role" | "financial_access" | "name">;
}

export function LaunchDashboard({
  metrics: initialMetrics,
  initialActivity,
  profile,
}: LaunchDashboardProps) {
  const [activity, setActivity] = useState(initialActivity);
  const [metrics, setMetrics] = useState(initialMetrics);

  const isAdmin = profile.role === "admin";
  const showFinancial = !!profile.financial_access;

  // Auto-refresh activity every 60 seconds (matches prior behaviour).
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await getRecentActivity(20);
      setActivity(fresh);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  function applyTarget(field: "centres" | "schools" | "revenue", newValue: number) {
    setMetrics((prev) => {
      switch (field) {
        case "centres":
          return { ...prev, centres: { ...prev.centres, target: newValue } };
        case "schools":
          return { ...prev, schools: { ...prev.schools, target: newValue } };
        case "revenue":
          return { ...prev, revenue: { ...prev.revenue, yearTarget: newValue } };
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Eyebrow + title */}
      <div>
        <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
          Launch dashboard
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Build Alpha Kids
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Year 1 targets: {metrics.centres.target} centres, {metrics.schools.target} schools,{" "}
          {fmtCurrency(metrics.revenue.yearTarget)} revenue
        </p>
      </div>

      {/* ROW 1 — KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Active Centres"
          numericValue={metrics.centres.active}
          target={metrics.centres.target}
          suffix={`/ ${metrics.centres.target}`}
          footer={`${metrics.centres.newThisMonth} new this month`}
          isPrimary
          editor={
            <Y1TargetEditPopover
              field="centres"
              label="Centres"
              current={metrics.centres.target}
              onSaved={(v) => applyTarget("centres", v)}
              enabled={isAdmin}
            />
          }
        />
        <MetricCard
          icon={GraduationCap}
          label="Active Schools"
          numericValue={metrics.schools.active}
          target={metrics.schools.target}
          suffix={`/ ${metrics.schools.target}`}
          footer={`${metrics.schools.totalEnrolledStudents} enrolled students`}
          editor={
            <Y1TargetEditPopover
              field="schools"
              label="Schools"
              current={metrics.schools.target}
              onSaved={(v) => applyTarget("schools", v)}
              enabled={isAdmin}
            />
          }
        />
        {showFinancial ? (
          <MetricCard
            icon={DollarSign}
            label="Revenue (YTD)"
            numericValue={metrics.revenue.thisYear}
            target={metrics.revenue.yearTarget}
            displayValue={fmtCurrency(metrics.revenue.thisYear)}
            displayValueFromTickedUp={(n) => fmtCurrency(n)}
            suffix={`/ ${fmtCurrency(metrics.revenue.yearTarget)}`}
            footer={
              metrics.revenue.isEstimate
                ? "Estimated from sessions"
                : `${fmtCurrency(metrics.revenue.thisMonth)} this month`
            }
            editor={
              <Y1TargetEditPopover
                field="revenue"
                label="Revenue"
                prefix="$"
                current={metrics.revenue.yearTarget}
                onSaved={(v) => applyTarget("revenue", v)}
                enabled={isAdmin}
              />
            }
          />
        ) : (
          <CentresHealthCard activeWeek={metrics.centres.sessionsThisWeek} totalCentres={metrics.centres.total} />
        )}
        <CoachesCard coaches={metrics.coaches} />
      </div>

      {/* ROW 2 — Charts */}
      <div
        className={
          showFinancial
            ? "grid grid-cols-1 gap-4 lg:grid-cols-2"
            : "grid grid-cols-1 gap-4"
        }
      >
        {showFinancial && (
          <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Monthly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                <MonthlyRevenueChart data={metrics.revenue.monthlyBreakdown} />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Centre &amp; School Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <CentreGrowthChart data={metrics.growth.monthlyBreakdown} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — Revenue Split + Top Earners, or Programme Mix */}
      {showFinancial ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Revenue Split</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px]">
                <RevenueSplitPie
                  childcare={metrics.revenue.childcareRevenue}
                  school={metrics.revenue.schoolRevenue}
                />
              </div>
              <div className="mt-2 flex justify-around text-sm">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Childcare</p>
                  <p className="font-semibold" style={{ color: BRAND }}>
                    {fmtCurrencyFull(metrics.revenue.childcareRevenue)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">School</p>
                  <p className="font-semibold text-foreground">
                    {fmtCurrencyFull(metrics.revenue.schoolRevenue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Top Earners This Term</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.topEntities.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No revenue data for this term yet.
                </p>
              ) : (
                <div className="-mx-2 overflow-x-auto px-2">
                  <table className="w-full min-w-[320px] text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Name</th>
                        <th className="pb-2 text-left font-medium">Type</th>
                        <th className="pb-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.topEntities.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="max-w-[180px] truncate py-2 font-medium">
                            {e.name || "—"}
                          </td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs">
                              {e.type === "school" ? "School" : "Centre"}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap py-2 text-right font-medium">
                            {fmtCurrencyFull(e.revenue)}
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
      ) : (
        <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              Programme Mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.programmeMix.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sessions logged this term yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {metrics.programmeMix.map((row, i) => {
                  const total = metrics.programmeMix.reduce(
                    (sum, r) => sum + r.sessionCount,
                    0,
                  );
                  const pct = total > 0 ? Math.round((row.sessionCount / total) * 100) : 0;
                  return (
                    <li key={row.sport} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-foreground">{row.sport}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {row.sessionCount} sessions ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-foreground/70"
                          style={{
                            width: `${pct}%`,
                            opacity: 1 - i * 0.1,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ROW 4 — Coach Overview */}
      <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader>
          <CardTitle className="text-base">Coach Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.coaches.list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No coaches yet.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="pb-2 text-left font-medium">Coach</th>
                    <th className="whitespace-nowrap pb-2 text-right font-medium">Sessions</th>
                    <th className="pb-2 text-center font-medium">Compliance</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.coaches.list.slice(0, 10).map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-3">
                        <Link
                          href={`/admin/staff/${c.id}`}
                          className="flex min-h-[44px] items-center font-medium hover:text-primary hover:underline"
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

      {/* ROW 5 — Activity timeline */}
      <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            Recent Activity
          </CardTitle>
          <Link
            href="/admin/activity"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View all activity →
          </Link>
        </CardHeader>
        <CardContent>
          <ActivityTimeline items={activity} maxItems={20} />
        </CardContent>
      </Card>
    </div>
  );
}

// ========================
// Sub-components
// ========================

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  numericValue: number;
  target?: number;
  /** When provided, used as the headline rather than the numeric value. */
  displayValue?: string;
  /** When provided, called with the ticked-up integer to render a custom label (e.g. fmtCurrency). */
  displayValueFromTickedUp?: (n: number) => string;
  suffix?: string;
  footer?: string;
  /** Render the brand-orange icon treatment (only on the lead KPI card). */
  isPrimary?: boolean;
  /** Pencil-edit popover, rendered top-right on group hover when present. */
  editor?: React.ReactNode;
  /** Comparison delta + label rendered next to the headline number. */
  comparison?: {
    delta: import("@/lib/comparison/delta").ComparisonDelta;
    label?: string;
  };
}

function MetricCard({
  icon: Icon,
  label,
  numericValue,
  target,
  displayValue,
  displayValueFromTickedUp,
  suffix,
  footer,
  isPrimary,
  editor,
  comparison,
}: MetricCardProps) {
  const ticked = useCountUp(numericValue);
  const pct = target ? Math.min(100, (numericValue / target) * 100) : 0;
  const headline = displayValueFromTickedUp
    ? displayValueFromTickedUp(ticked)
    : displayValue ?? ticked.toLocaleString("en-AU");

  return (
    <Card className="group/card relative rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
      {editor && (
        <div className="absolute right-2 top-2 z-10">{editor}</div>
      )}
      <CardContent className="py-4">
        <div className="mb-2 flex items-start justify-between">
          <div
            className={
              "flex size-10 items-center justify-center rounded-xl " +
              (isPrimary ? "bg-primary/10" : "bg-muted")
            }
          >
            <Icon
              className={
                "size-5 " + (isPrimary ? "text-primary" : "text-foreground")
              }
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{headline}</span>
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          {comparison && (
            <ComparisonBadge
              delta={comparison.delta}
              label={comparison.label}
              variant="inline"
              format="auto"
            />
          )}
        </div>
        {target ? (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={"h-full transition-all " + progressColour(pct)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}
        {footer && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function CoachesCard({ coaches }: { coaches: DashboardMetrics["coaches"] }) {
  const hasWarning = coaches.compliance.expiringSoon > 0 || coaches.compliance.expired > 0;
  const active = useCountUp(coaches.active);

  return (
    <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="py-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <Users className="size-5 text-foreground" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Active Coaches</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{active}</span>
          <span className="text-sm text-muted-foreground">/ {coaches.total}</span>
        </div>
        {hasWarning ? (
          <p className="mt-3 flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="size-3" />
            {coaches.compliance.expired > 0 && `${coaches.compliance.expired} expired`}
            {coaches.compliance.expired > 0 && coaches.compliance.expiringSoon > 0 && ", "}
            {coaches.compliance.expiringSoon > 0 &&
              `${coaches.compliance.expiringSoon} expiring soon`}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {coaches.avgSessionsPerWeek} sessions/coach/week avg
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CentresHealthCard({ activeWeek, totalCentres }: { activeWeek: number; totalCentres: number }) {
  const ticked = useCountUp(activeWeek);
  return (
    <Card className="rounded-2xl transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="py-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <Activity className="size-5 text-foreground" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Centres Active This Week</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{ticked}</span>
          <span className="text-sm text-muted-foreground">/ {totalCentres}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Centres with at least one session this week
        </p>
      </CardContent>
    </Card>
  );
}

function ComplianceIcon({ status }: { status: "clear" | "warning" | "alert" }) {
  if (status === "clear")
    return <CheckCircle2 className="mx-auto size-4 text-green-600" />;
  if (status === "warning")
    return <AlertTriangle className="mx-auto size-4 text-amber-600" />;
  return <AlertCircle className="mx-auto size-4 text-red-600" />;
}
