"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ShieldAlert,
  AlertTriangle,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  X,
} from "lucide-react";
import { getChurnStatusPulse } from "@/lib/churn/status-pulse-actions";
import type { ChurnStatusPulse } from "@/lib/churn/status-pulse-actions";
import { ChurnStatusPulseStrip } from "@/components/churn/churn-status-pulse";
import { useCountUp } from "@/components/launch/use-count-up";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Area,
  AreaChart,
} from "recharts";
import {
  getChurnDashboard,
  getChurnRiskOverview,
  getChurnTrends,
  resolveChurnEvent,
} from "@/lib/churn/actions";
import type { RiskLevel, ChurnEventType } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

type DashboardData = {
  centresByRisk: { low: number; medium: number; high: number; critical: number };
  recentEvents: {
    id: string;
    centre_id: string;
    centre_name: string;
    event_type: ChurnEventType;
    risk_score: number | null;
    risk_level: RiskLevel | null;
    notes: string | null;
    detected_at: string;
    resolved_at: string | null;
  }[];
  trendingRiskChanges: {
    centre_id: string;
    centre_name: string;
    previous_score: number;
    current_score: number;
    change: number;
    risk_level: RiskLevel;
  }[];
};

type CentreRisk = {
  centre_id: string;
  centre_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  health_score: number | null;
  days_since_last_feedback: number | null;
  days_since_last_communication: number | null;
  cancellation_rate: number | null;
  indicators_json: Record<string, unknown>;
  snapshot_date: string;
};

type TrendData = {
  avgRiskOverTime: { date: string; avgScore: number }[];
  distributionOverTime: {
    date: string;
    low: number;
    medium: number;
    high: number;
    critical: number;
  }[];
};

const TABS = ["Overview", "At Risk", "Events", "Trends"] as const;
type Tab = (typeof TABS)[number];

// ============================================================
// Helpers
// ============================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
}

const RISK_COLOURS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const RISK_BADGE_STYLES: Record<RiskLevel, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

const EVENT_BADGE_STYLES: Record<string, string> = {
  churned: "bg-red-100 text-red-800 border-red-200",
  at_risk: "bg-orange-100 text-orange-800 border-orange-200",
  recovered: "bg-green-100 text-green-800 border-green-200",
};

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="outline" className={RISK_BADGE_STYLES[level]}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </Badge>
  );
}

function EventBadge({ type }: { type: string }) {
  return (
    <Badge
      variant="outline"
      className={
        EVENT_BADGE_STYLES[type] ?? "bg-gray-100 text-gray-600 border-gray-200"
      }
    >
      {type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </Badge>
  );
}

function getTopRiskFactor(
  indicators: Record<string, unknown>
): string {
  try {
    const entries = Object.entries(indicators) as [
      string,
      { score: number; weight: number }
    ][];
    if (entries.length === 0) return "—";
    const sorted = entries.sort(
      ([, a], [, b]) => b.score * b.weight - a.score * a.weight
    );
    return sorted[0][0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "—";
  }
}

// ============================================================
// Component
// ============================================================

function AnimatedMetric({ value }: { value: number }) {
  const ticked = useCountUp(value);
  return <>{ticked}</>;
}

export default function AdminChurnPage() {
  const router = useRouter();
  const params = useSearchParams();

  const urlTab = params.get("tab");
  const initialTab: Tab = (TABS as readonly string[]).includes(urlTab ?? "")
    ? (urlTab as Tab)
    : "Overview";
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab);

  function setActiveTab(t: Tab) {
    setActiveTabState(t);
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (t === "Overview") sp.delete("tab");
    else sp.set("tab", t);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  useEffect(() => {
    if ((TABS as readonly string[]).includes(urlTab ?? "")) {
      setActiveTabState(urlTab as Tab);
    }
  }, [urlTab]);

  const severityFilter = params.get("severity");
  const trendFilter = params.get("trend"); // improving | unchanged
  const periodFilter = params.get("period"); // this_week
  const centreFilter = params.get("centre");

  function clearUrlParam(key: string) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [pulse, setPulse] = useState<ChurnStatusPulse>({
    atRiskCount: 0,
    newEventsThisWeekCount: 0,
    improvingCount: 0,
    unchangedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [centreRisks, setCentreRisks] = useState<CentreRisk[]>([]);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [dashResult, riskResult, trendsResult, p] = await Promise.all([
      getChurnDashboard(),
      getChurnRiskOverview(),
      getChurnTrends(),
      getChurnStatusPulse(),
    ]);
    setPulse(p);

    if (dashResult.error) {
      setError(dashResult.error);
      setLoading(false);
      return;
    }

    if (dashResult.data) setDashboard(dashResult.data as unknown as DashboardData);
    if (riskResult.data) setCentreRisks(riskResult.data);
    if (trendsResult.data) setTrends(trendsResult.data);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived filtered list for At Risk tab
  const filteredCentreRisks = useMemo(() => {
    let list = centreRisks;
    if (severityFilter === "high") {
      list = list.filter(
        (c) => c.risk_level === "high" || c.risk_level === "critical"
      );
    } else if (severityFilter === "critical") {
      list = list.filter((c) => c.risk_level === "critical");
    }
    if (centreFilter) {
      list = list.filter((c) => c.centre_id === centreFilter);
    }
    return list;
  }, [centreRisks, severityFilter, centreFilter]);

  // Derived filtered events
  const filteredEvents = useMemo(() => {
    if (!dashboard?.recentEvents) return [];
    let list = dashboard.recentEvents;
    if (periodFilter === "this_week") {
      const monday = new Date();
      monday.setDate(monday.getDate() - monday.getDay() || -6);
      monday.setHours(0, 0, 0, 0);
      const mondayIso = monday.toISOString();
      list = list.filter((e) => e.detected_at >= mondayIso);
    }
    return list;
  }, [dashboard, periodFilter]);

  async function handleResolve(eventId: string) {
    setResolvingId(eventId);
    const result = await resolveChurnEvent(eventId, "Resolved via admin dashboard");
    if (result.error) {
      toast.error("Could not resolve churn event. Please try again.");
    } else {
      toast.success("Churn event resolved.");
      await loadData();
    }
    setResolvingId(null);
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="h-8 w-64 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const riskCounts = dashboard?.centresByRisk ?? {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const totalCentres =
    riskCounts.low + riskCounts.medium + riskCounts.high + riskCounts.critical;

  const pieData = [
    { name: "Low", value: riskCounts.low, color: RISK_COLOURS.low },
    { name: "Medium", value: riskCounts.medium, color: RISK_COLOURS.medium },
    { name: "High", value: riskCounts.high, color: RISK_COLOURS.high },
    {
      name: "Critical",
      value: riskCounts.critical,
      color: RISK_COLOURS.critical,
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6 pb-8">
      <ChurnStatusPulseStrip pulse={pulse} basePath="/admin/churn" />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A1A1A]">
          Churn Risk Dashboard
        </h1>
        <p className="text-sm text-[#666666] mt-1">
          Monitor centre churn risk, track events, and identify trends
        </p>
      </div>

      {/* Jump-filter chips */}
      {(severityFilter || trendFilter || periodFilter || centreFilter) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          {severityFilter && (
            <FilterClearChip
              label={`Severity: ${severityFilter}`}
              onClear={() => clearUrlParam("severity")}
            />
          )}
          {trendFilter && (
            <FilterClearChip
              label={`Trend: ${trendFilter}`}
              onClear={() => clearUrlParam("trend")}
            />
          )}
          {periodFilter === "this_week" && (
            <FilterClearChip
              label="This week"
              onClear={() => clearUrlParam("period")}
            />
          )}
          {centreFilter && (
            <FilterClearChip
              label="Centre filter"
              onClear={() => clearUrlParam("centre")}
            />
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard
          icon={CheckCircle2}
          iconTone="text-green-600"
          label="Low Risk"
          value={riskCounts.low}
        />
        <KpiCard
          icon={Activity}
          iconTone="text-yellow-600"
          label="Medium Risk"
          value={riskCounts.medium}
        />
        <KpiCard
          icon={AlertTriangle}
          iconTone="text-orange-600"
          label="High Risk"
          value={riskCounts.high}
        />
        <KpiCard
          icon={ShieldAlert}
          iconTone="text-red-600"
          label="Critical Risk"
          value={riskCounts.critical}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-primary text-primary"
                  : "text-[#666666] hover:text-[#1A1A1A]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "Overview" && (
        <div className="space-y-6">
          {/* Risk Distribution Chart + Recent Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">
                Risk Distribution
              </h3>
              {totalCentres === 0 ? (
                <p className="text-sm text-[#666666] text-center py-12">
                  No risk data available yet
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Recent Alerts */}
            <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">
                Recent Alerts
              </h3>
              {!dashboard?.trendingRiskChanges?.length ? (
                <p className="text-sm text-[#666666] text-center py-12">
                  No recent risk changes
                </p>
              ) : (
                <div className="space-y-3 max-h-[280px] overflow-y-auto">
                  {dashboard.trendingRiskChanges.map((change) => (
                    <div
                      key={change.centre_id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {change.change > 0 ? (
                          <ArrowUpRight className="h-4 w-4 text-red-500" />
                        ) : (
                          <ArrowDownRight className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium text-[#1A1A1A]">
                            {change.centre_name}
                          </p>
                          <p className="text-xs text-[#666666]">
                            {change.previous_score} &rarr;{" "}
                            {change.current_score} (
                            {change.change > 0 ? "+" : ""}
                            {change.change})
                          </p>
                        </div>
                      </div>
                      <RiskBadge level={change.risk_level} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Risk Score Bar Chart */}
          {centreRisks.length > 0 && (
            <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
              <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">
                Risk Scores by Centre
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={centreRisks.slice(0, 20).map((c) => ({
                    name:
                      c.centre_name.length > 15
                        ? c.centre_name.slice(0, 15) + "..."
                        : c.centre_name,
                    score: c.risk_score,
                    fill: RISK_COLOURS[c.risk_level],
                  }))}
                  margin={{ top: 5, right: 20, bottom: 60, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="score" name="Risk Score">
                    {centreRisks.slice(0, 20).map((c, i) => (
                      <Cell
                        key={i}
                        fill={RISK_COLOURS[c.risk_level]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === "At Risk" && (
        <div className="rounded-2xl border bg-background overflow-hidden hover:shadow-md transition">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left px-4 py-3 font-medium text-[#666666]">
                    Centre
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[#666666]">
                    Risk Score
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[#666666]">
                    Level
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[#666666]">
                    Health
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-[#666666] hidden md:table-cell">
                    Days Since Feedback
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#666666] hidden lg:table-cell">
                    Top Risk Factor
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-[#666666]">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCentreRisks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-12 text-[#666666]"
                    >
                      No risk data available yet
                    </td>
                  </tr>
                ) : (
                  filteredCentreRisks.map((centre) => (
                    <tr
                      key={centre.centre_id}
                      className="border-b last:border-0 hover:bg-gray-50/50"
                    >
                      <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                        {centre.centre_name}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold text-white"
                          style={{
                            backgroundColor:
                              RISK_COLOURS[centre.risk_level],
                          }}
                        >
                          {centre.risk_score}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <RiskBadge level={centre.risk_level} />
                      </td>
                      <td className="px-4 py-3 text-center text-[#1A1A1A]">
                        {centre.health_score ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-[#1A1A1A] hidden md:table-cell">
                        {centre.days_since_last_feedback ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[#666666] hidden lg:table-cell">
                        {getTopRiskFactor(centre.indicators_json)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            (window.location.href = `/admin/centres/${centre.centre_id}`)
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "Events" && (
        <div className="space-y-4">
          {!filteredEvents.length ? (
            <div className="rounded-2xl border bg-background p-12 text-center hover:shadow-md transition">
              <Clock className="h-8 w-8 text-[#666666] mx-auto mb-3" />
              <p className="text-sm text-[#666666]">
                {periodFilter === "this_week"
                  ? "No churn events this week."
                  : "No churn events recorded yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border bg-background p-4 hover:shadow-md transition flex items-start gap-4"
                >
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 mt-1">
                    {event.event_type === "churned" ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : event.event_type === "recovered" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#1A1A1A]">
                        {event.centre_name}
                      </span>
                      <EventBadge type={event.event_type} />
                      {event.risk_level && (
                        <RiskBadge level={event.risk_level} />
                      )}
                    </div>
                    <p className="text-xs text-[#666666] mt-1">
                      {formatDate(event.detected_at)}
                      {event.risk_score !== null &&
                        ` · Risk score: ${event.risk_score}`}
                    </p>
                    {event.notes && (
                      <p className="text-xs text-[#666666] mt-1">
                        {event.notes}
                      </p>
                    )}
                    {event.resolved_at && (
                      <p className="text-xs text-green-600 mt-1">
                        Resolved {formatDate(event.resolved_at)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {!event.resolved_at && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs flex-shrink-0"
                      disabled={resolvingId === event.id}
                      onClick={() => handleResolve(event.id)}
                    >
                      {resolvingId === event.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Resolve"
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "Trends" && (
        <div className="space-y-6">
          {/* Average Risk Over Time */}
          <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">
              Average Risk Score Over Time
            </h3>
            {!trends?.avgRiskOverTime?.length ? (
              <p className="text-sm text-[#666666] text-center py-12">
                Not enough data to show trends yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trends.avgRiskOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip
                    labelFormatter={(label) => formatDate(label as string)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgScore"
                    name="Avg Risk Score"
                    stroke="#E8712A"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Distribution Over Time (Stacked Area) */}
          <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">
              Centres by Risk Level Over Time
            </h3>
            {!trends?.distributionOverTime?.length ? (
              <p className="text-sm text-[#666666] text-center py-12">
                Not enough data to show distribution trends yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trends.distributionOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatShortDate}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(label) => formatDate(label as string)}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="critical"
                    name="Critical"
                    stackId="1"
                    fill={RISK_COLOURS.critical}
                    stroke={RISK_COLOURS.critical}
                  />
                  <Area
                    type="monotone"
                    dataKey="high"
                    name="High"
                    stackId="1"
                    fill={RISK_COLOURS.high}
                    stroke={RISK_COLOURS.high}
                  />
                  <Area
                    type="monotone"
                    dataKey="medium"
                    name="Medium"
                    stackId="1"
                    fill={RISK_COLOURS.medium}
                    stroke={RISK_COLOURS.medium}
                  />
                  <Area
                    type="monotone"
                    dataKey="low"
                    name="Low"
                    stackId="1"
                    fill={RISK_COLOURS.low}
                    stroke={RISK_COLOURS.low}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconTone,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconTone: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border bg-background p-5 hover:shadow-md transition">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${iconTone}`} />
        <span className="text-xs font-medium text-[#666666]">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[#1A1A1A]">
        <AnimatedMetric value={value} />
      </p>
      <p className="text-xs text-[#666666] mt-0.5">centres</p>
    </div>
  );
}

function FilterClearChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
        aria-label="Clear filter"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
