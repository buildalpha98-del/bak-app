"use client";

import { useTransition, useState, useMemo } from "react";
import Link from "@/components/ui/app-link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  RefreshCw,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  Settings,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { toast } from "sonner";

import type { RevenueForecast } from "@/lib/types/database";
import { exportForecastsCsv } from "@/lib/forecasting/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCountUp } from "@/components/launch/use-count-up";

// ============================================================
// Helpers
// ============================================================

const ORANGE = "#E8712A";
const GRAY = "#6B7280";

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function periodLabel(f: RevenueForecast): string {
  const start = new Date(f.period_start);
  if (f.period_type === "quarterly") {
    const q = Math.ceil((start.getMonth() + 1) / 3);
    return `Q${q} ${start.getFullYear()}`;
  }
  return start.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
}

function margin(revenue: number, profit: number): number {
  return revenue > 0 ? (profit / revenue) * 100 : 0;
}

// Pipeline stages
const PIPELINE_STAGES = [
  { key: "cold_lead", label: "Cold Lead", colour: "#94A3B8" },
  { key: "contacted", label: "Contacted", colour: "#60A5FA" },
  { key: "interested", label: "Interested", colour: "#34D399" },
  { key: "free_trial", label: "Free Trial", colour: "#FBBF24" },
  { key: "proposal_sent", label: "Proposal Sent", colour: ORANGE },
] as const;

// ============================================================
// Component
// ============================================================

interface AnalyticsDashboardProps {
  monthly: RevenueForecast[];
  quarterly: RevenueForecast[];
}

export function AnalyticsDashboard({
  monthly,
  quarterly,
}: AnalyticsDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isRegenerating, setIsRegenerating] = useState(false);

  // URL-persisted view filters
  const periodFilter = searchParams.get("period") ?? "monthly";
  const focusFilter = searchParams.get("focus");

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // ── Summary metrics ──
  const thisMonth = monthly[0] ?? null;
  const nextMonth = monthly[1] ?? null;

  const thisMargin = thisMonth
    ? margin(thisMonth.total_projected_revenue, thisMonth.projected_profit)
    : 0;

  // Animated counts
  const thisMonthAnimated = useCountUp(
    Math.round(thisMonth?.total_projected_revenue ?? 0),
  );
  const nextMonthAnimated = useCountUp(
    Math.round(nextMonth?.total_projected_revenue ?? 0),
  );
  const marginAnimated = useCountUp(Math.round(thisMargin));

  const trend =
    thisMonth && nextMonth
      ? nextMonth.total_projected_revenue > thisMonth.total_projected_revenue
        ? "up"
        : nextMonth.total_projected_revenue <
            thisMonth.total_projected_revenue
          ? "down"
          : "flat"
      : "flat";

  // ── Chart data ──
  const projectionData = monthly.map((f) => ({
    label: periodLabel(f),
    committed: f.committed_revenue,
    total: f.total_projected_revenue,
  }));

  const costData = monthly.map((f) => ({
    label: periodLabel(f),
    revenue: f.total_projected_revenue,
    coachCosts: f.projected_coach_costs,
    margin: margin(f.total_projected_revenue, f.projected_profit),
  }));

  // ── Breakdown data from breakdown_json ──
  const breakdownByCentreType = useMemo(() => {
    if (!thisMonth?.breakdown_json) return [];
    const byCt = (thisMonth.breakdown_json as Record<string, unknown>)
      .by_centre_type as Record<string, { revenue: number; sessions: number }> | undefined;
    if (!byCt) return [];
    return Object.entries(byCt).map(([type, data]) => ({
      type: type === "childcare_centre" ? "Childcare Centre" : "School",
      revenue: data.revenue,
      sessions: data.sessions,
    }));
  }, [thisMonth]);

  const breakdownByCentre = useMemo(() => {
    if (!thisMonth?.breakdown_json) return [];
    const bc = (thisMonth.breakdown_json as Record<string, unknown>)
      .by_centre as { name: string; revenue: number; sessions: number }[] | undefined;
    if (!bc) return [];
    return [...bc].sort((a, b) => b.revenue - a.revenue);
  }, [thisMonth]);

  const breakdownByPricing = useMemo(() => {
    if (!thisMonth?.breakdown_json) return [];
    const bp = (thisMonth.breakdown_json as Record<string, unknown>)
      .by_pricing_model as Record<string, { revenue: number; sessions: number }> | undefined;
    if (!bp) return [];
    return Object.entries(bp).map(([model, data]) => ({
      model: model
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      revenue: data.revenue,
      sessions: data.sessions,
    }));
  }, [thisMonth]);

  // ── Pipeline ──
  const pipelineData = useMemo(() => {
    if (!thisMonth?.breakdown_json) return [];
    const pipeline = (thisMonth.breakdown_json as Record<string, unknown>)
      .pipeline as Record<string, { count: number; weighted_revenue: number }> | undefined;
    if (!pipeline) return [];
    return PIPELINE_STAGES.map((stage) => ({
      ...stage,
      count: pipeline[stage.key]?.count ?? 0,
      revenue: pipeline[stage.key]?.weighted_revenue ?? 0,
    }));
  }, [thisMonth]);

  const maxPipelineCount = Math.max(...pipelineData.map((s) => s.count), 1);

  // ── Coach costs ──
  const coachBreakdown = useMemo(() => {
    if (!thisMonth?.breakdown_json) return [];
    const coaches = (thisMonth.breakdown_json as Record<string, unknown>)
      .coach_costs as { name: string; sessions: number; cost: number }[] | undefined;
    if (!coaches) return [];
    return [...coaches].sort((a, b) => b.cost - a.cost);
  }, [thisMonth]);

  const avgCostPerSession = useMemo(() => {
    if (coachBreakdown.length === 0) return 0;
    const totalCost = coachBreakdown.reduce((acc, c) => acc + c.cost, 0);
    const totalSessions = coachBreakdown.reduce((acc, c) => acc + c.sessions, 0);
    return totalSessions > 0 ? totalCost / totalSessions : 0;
  }, [coachBreakdown]);

  // ── Handlers ──
  function handleExportCsv() {
    startTransition(async () => {
      const { data, error } = await exportForecastsCsv();
      if (error || !data) {
        toast.error(error ?? "Export failed.");
        return;
      }
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bak-forecast-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Forecast exported.");
    });
  }

  async function handleRegenerate() {
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/forecasts/generate", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Forecasts regenerated. Refresh to see updated data.");
    } catch {
      toast.error("Failed to regenerate forecasts.");
    } finally {
      setIsRegenerating(false);
    }
  }

  // ── Empty state ──
  if (monthly.length === 0 && quarterly.length === 0) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Analytics
          </p>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
            Revenue Analytics
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            No forecast data available yet.
          </p>
        </div>
        <Card className="rounded-2xl">
          <CardContent className="py-12 text-center">
            <BarChart3 className="mx-auto size-12 text-muted-foreground/40" />
            <p className="mt-4 text-muted-foreground">
              Generate your first forecast to see revenue projections, cost
              analysis, and pipeline insights.
            </p>
            <Button
              className="mt-6 rounded-2xl bg-primary hover:bg-primary/90 text-white"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Generate Forecast
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">
            Analytics
          </p>
          <h1 className="text-3xl font-bold font-heading text-foreground tracking-tight">
            Revenue Analytics
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Projected revenue, costs, and pipeline analysis
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            render={<Link href="/admin/settings/forecasting" />}
          >
            <Settings className="size-4" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-2xl"
            onClick={handleExportCsv}
            disabled={isPending}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
          <Button
            size="sm"
            className="rounded-2xl bg-primary hover:bg-primary/90 text-white"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Regenerate
          </Button>
        </div>
      </div>

      {/* ── Filter chip row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={periodFilter}
          onValueChange={(v) => updateParam("period", v)}
        >
          <SelectTrigger className="h-9 w-[180px] rounded-2xl">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
          </SelectContent>
        </Select>
        {focusFilter && (
          <span className="inline-flex items-center gap-2 rounded-2xl bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            Focus: {focusFilter === "loss" ? "loss months" : "overperforming"}
            <button
              type="button"
              onClick={() => updateParam("focus", null)}
              className="opacity-70 hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </span>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl card-hover">
          <CardHeader>
            <CardDescription>This Month Revenue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {thisMonth ? `$${thisMonthAnimated.toLocaleString()}` : "--"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Committed: {thisMonth ? fmtCurrency(thisMonth.committed_revenue) : "--"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl card-hover">
          <CardHeader>
            <CardDescription>Next Month Revenue</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {nextMonth ? `$${nextMonthAnimated.toLocaleString()}` : "--"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Committed: {nextMonth ? fmtCurrency(nextMonth.committed_revenue) : "--"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl card-hover">
          <CardHeader>
            <CardDescription>Profit Margin</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {thisMonth ? `${marginAnimated}%` : "--"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Profit: {thisMonth ? fmtCurrency(thisMonth.projected_profit) : "--"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl card-hover">
          <CardHeader>
            <CardDescription>Trend</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {trend === "up" && (
                <>
                  <TrendingUp className="size-6 text-emerald-600" />
                  <span className="text-emerald-600">Up</span>
                </>
              )}
              {trend === "down" && (
                <>
                  <TrendingDown className="size-6 text-red-600" />
                  <span className="text-red-600">Down</span>
                </>
              )}
              {trend === "flat" && (
                <>
                  <Minus className="size-6 text-muted-foreground" />
                  <span className="text-muted-foreground">Flat</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Month-on-month revenue direction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Revenue Projection Chart ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="size-5" />
            Revenue Projection
          </CardTitle>
          <CardDescription>
            Committed vs total projected revenue by month
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projectionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={projectionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => fmtCurrency(v)}
                />
                <Tooltip
                  formatter={(value) => fmtCurrency(Number(value))}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="committed"
                  name="Committed"
                  stroke={ORANGE}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total (incl. Pipeline)"
                  stroke={GRAY}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No projection data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Revenue vs Costs Chart ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            Revenue vs Coach Costs
          </CardTitle>
          <CardDescription>
            Monthly revenue compared to projected coach costs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {costData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) => fmtCurrency(v)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    fmtCurrency(Number(value)),
                    String(name),
                  ]}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill={ORANGE}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="coachCosts"
                  name="Coach Costs"
                  fill={GRAY}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No cost data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Breakdown Tables ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Revenue Breakdown</CardTitle>
          <CardDescription>
            Current month breakdown by centre type, individual centre, and
            pricing model
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="centre-type">
            <TabsList>
              <TabsTrigger value="centre-type">By Centre Type</TabsTrigger>
              <TabsTrigger value="centre">By Centre</TabsTrigger>
              <TabsTrigger value="pricing">By Pricing Model</TabsTrigger>
            </TabsList>

            <TabsContent value="centre-type">
              {breakdownByCentreType.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Centre Type</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownByCentreType.map((row) => (
                      <TableRow key={row.type}>
                        <TableCell className="font-medium">{row.type}</TableCell>
                        <TableCell className="text-right">{row.sessions}</TableCell>
                        <TableCell className="text-right">
                          {fmtCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No breakdown data available.
                </p>
              )}
            </TabsContent>

            <TabsContent value="centre">
              {breakdownByCentre.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Centre</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">
                        Projected Contribution
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownByCentre.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right">{row.sessions}</TableCell>
                        <TableCell className="text-right">
                          {fmtCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No centre breakdown data available.
                </p>
              )}
            </TabsContent>

            <TabsContent value="pricing">
              {breakdownByPricing.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pricing Model</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownByPricing.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell className="font-medium">{row.model}</TableCell>
                        <TableCell className="text-right">{row.sessions}</TableCell>
                        <TableCell className="text-right">
                          {fmtCurrency(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No pricing breakdown data available.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Pipeline Funnel ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="size-5" />
            Pipeline Funnel
          </CardTitle>
          <CardDescription>
            Leads by stage with weighted revenue estimates
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pipelineData.length > 0 && pipelineData.some((s) => s.count > 0) ? (
            <div className="space-y-3">
              {pipelineData.map((stage) => (
                <div key={stage.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">
                      {stage.count} leads &middot; {fmtCurrency(stage.revenue)}
                    </span>
                  </div>
                  <div className="h-6 w-full rounded-md bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-md transition-all"
                      style={{
                        width: `${Math.max(
                          (stage.count / maxPipelineCount) * 100,
                          stage.count > 0 ? 4 : 0
                        )}%`,
                        backgroundColor: stage.colour,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pipeline data available.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Coach Cost Breakdown ── */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Coach Cost Breakdown</CardTitle>
          <CardDescription>
            Projected coach costs for the current month
            {avgCostPerSession > 0 && (
              <span className="ml-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                Avg {fmtCurrency(avgCostPerSession)} / session
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coachBreakdown.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  <TableHead className="text-right">Projected Sessions</TableHead>
                  <TableHead className="text-right">Projected Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coachBreakdown.map((coach) => (
                  <TableRow key={coach.name}>
                    <TableCell className="font-medium">{coach.name}</TableCell>
                    <TableCell className="text-right">{coach.sessions}</TableCell>
                    <TableCell className="text-right">
                      {fmtCurrency(coach.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No coach cost data available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
