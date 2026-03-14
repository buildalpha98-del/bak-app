"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Users,
  BarChart3,
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
} from "recharts";

import type { CoachMetrics, CoachPerformanceSnapshot } from "@/lib/types/database";
import type { CoachBadge } from "@/lib/types/database";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CoachComparison } from "@/components/performance/coach-comparison";

// ============================================================
// Constants
// ============================================================

const ORANGE = "#E8712A";
const GRAY = "#6B7280";

interface MetricDef {
  normKey: string;
  label: string;
  format: (m: CoachMetrics) => string;
}

const METRIC_DEFS: MetricDef[] = [
  {
    normKey: "feedback_rating",
    label: "Feedback Rating",
    format: (m) => `${m.feedback_rating.average.toFixed(1)} / 5`,
  },
  {
    normKey: "shift_reliability",
    label: "Shift Reliability",
    format: (m) => `${m.shift_reliability.rate.toFixed(1)}%`,
  },
  {
    normKey: "form_completion",
    label: "Form Completion",
    format: (m) => `${m.form_completion.rate.toFixed(1)}%`,
  },
  {
    normKey: "punctuality",
    label: "Punctuality",
    format: (m) =>
      m.punctuality.average_minutes === 0
        ? "On time"
        : `${m.punctuality.average_minutes.toFixed(1)} min avg late`,
  },
  {
    normKey: "session_volume",
    label: "Session Volume",
    format: (m) => `${m.session_volume.count} sessions`,
  },
  {
    normKey: "assessment_thoroughness",
    label: "Assessment Thoroughness",
    format: (m) =>
      m.assessment_thoroughness.flagged
        ? "Flagged"
        : `Std dev ${m.assessment_thoroughness.std_dev.toFixed(2)}`,
  },
  {
    normKey: "equipment_responsibility",
    label: "Equipment Responsibility",
    format: (m) =>
      `${(m.equipment_responsibility.issue_rate * 100).toFixed(1)}% issue rate`,
  },
  {
    normKey: "attendance_consistency",
    label: "Attendance Consistency",
    format: (m) => {
      const t = m.attendance_consistency.trend;
      return t.charAt(0).toUpperCase() + t.slice(1);
    },
  },
];

// ============================================================
// Types
// ============================================================

interface DetailData {
  coach: { id: string; name: string; photo_url: string | null };
  current: CoachPerformanceSnapshot | null;
  normalised: Record<string, number> | null;
  snapshots: CoachPerformanceSnapshot[];
  badges: CoachBadge[];
  recentSessions: Array<{
    id: string;
    date: string;
    centre_name: string;
    sport: string;
    rating: number | null;
  }>;
  centreBreakdown: Array<{
    centre_name: string;
    avg_rating: number;
    session_count: number;
  }>;
  sportBreakdown: Array<{
    sport: string;
    avg_rating: number;
    session_count: number;
  }>;
}

interface CoachPerformanceDetailProps {
  detail: DetailData;
  teamAverages: Record<string, number>;
  allCoaches: Array<{ id: string; name: string; normalised: Record<string, number> }>;
}

// ============================================================
// Helpers
// ============================================================

function calcNorm(normKey: string, metrics: CoachMetrics): number {
  switch (normKey) {
    case "session_volume":
      return Math.min(100, (metrics.session_volume.count / 20) * 100);
    case "feedback_rating":
      return (metrics.feedback_rating.average / 5) * 100;
    case "form_completion":
      return metrics.form_completion.rate;
    case "punctuality":
      return Math.max(0, 100 - metrics.punctuality.average_minutes * 10);
    case "shift_reliability":
      return metrics.shift_reliability.rate;
    case "assessment_thoroughness":
      return Math.max(0, 100 - metrics.assessment_thoroughness.std_dev * 20);
    case "equipment_responsibility":
      return Math.max(
        0,
        100 - metrics.equipment_responsibility.issue_rate * 100
      );
    case "attendance_consistency":
      return metrics.attendance_consistency.trend === "growing"
        ? 90
        : metrics.attendance_consistency.trend === "stable"
          ? 70
          : 40;
    default:
      return 0;
  }
}

function scoreColour(score: number): string {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 75) return "border-green-500 bg-green-50";
  if (score >= 50) return "border-amber-400 bg-amber-50";
  return "border-red-400 bg-red-50";
}

function TrendIndicator({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-green-600 text-xs font-medium">
        <TrendingUp className="size-3" />+{delta.toFixed(0)}
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500 text-xs font-medium">
        <TrendingDown className="size-3" />
        {delta.toFixed(0)}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="size-3" />0
    </span>
  );
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null)
    return <span className="text-xs text-muted-foreground">No rating</span>;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`size-3 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted"
          }`}
        />
      ))}
    </span>
  );
}

// ============================================================
// Metric Card
// ============================================================

interface MetricCardProps {
  def: MetricDef;
  metrics: CoachMetrics;
  prevMetrics: CoachMetrics | null;
  teamAvg: number;
  sparklineData: Array<{ period: string; value: number }>;
}

function MetricCard({
  def,
  metrics,
  prevMetrics,
  teamAvg,
  sparklineData,
}: MetricCardProps) {
  const currentNorm = calcNorm(def.normKey, metrics);
  const prevNorm = prevMetrics ? calcNorm(def.normKey, prevMetrics) : null;
  const delta = prevNorm !== null ? currentNorm - prevNorm : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-medium uppercase tracking-wide">
          {def.label}
        </CardDescription>
        <CardTitle className="text-xl">{def.format(metrics)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Team avg: {teamAvg.toFixed(0)}</span>
          <TrendIndicator delta={delta} />
        </div>
        {sparklineData.length > 1 && (
          <ResponsiveContainer width="100%" height={40}>
            <LineChart data={sparklineData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={ORANGE}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Main component
// ============================================================

export function CoachPerformanceDetail({
  detail,
  teamAverages,
  allCoaches,
}: CoachPerformanceDetailProps) {
  const {
    coach,
    current,
    snapshots,
    badges,
    recentSessions,
    centreBreakdown,
    sportBreakdown,
  } = detail;

  const [compareOpen, setCompareOpen] = useState(false);

  const currentMetrics = current
    ? (current.metrics_json as CoachMetrics)
    : null;

  // Previous snapshot for trend: second-to-last in chronological snapshots array
  const prevSnapshot =
    snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const prevMetrics = prevSnapshot
    ? (prevSnapshot.metrics_json as CoachMetrics)
    : null;

  const overallScore = current?.overall_score ?? 0;
  const prevOverallScore =
    snapshots.length >= 2
      ? snapshots[snapshots.length - 2]?.overall_score ?? null
      : null;
  const overallDelta =
    prevOverallScore !== null ? overallScore - prevOverallScore : 0;

  // Build sparkline for a given normKey from historical snapshots
  function sparklineFor(normKey: string): Array<{ period: string; value: number }> {
    return snapshots.map((s) => ({
      period: s.period_start,
      value: calcNorm(normKey, s.metrics_json as CoachMetrics),
    }));
  }

  // Build normalised map for current coach to pass to comparison
  const currentNormalised = currentMetrics
    ? Object.fromEntries(
        METRIC_DEFS.map((d) => [
          d.normKey,
          calcNorm(d.normKey, currentMetrics),
        ])
      )
    : {};

  // Determine badge tier display
  const badgeCount = badges.length;
  const earnedTopPerformer = overallScore >= 90;
  const earnedHighPerformer = overallScore >= 75 && overallScore < 90;

  return (
    <div className="space-y-8">
      {/* ── Overall score header ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            {/* Score circle */}
            <div
              className={`flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-4 font-bold ${scoreBg(overallScore)}`}
            >
              <span className={`text-3xl ${scoreColour(overallScore)}`}>
                {overallScore}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{coach.name}</span>
                {earnedTopPerformer && (
                  <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400">
                    Top Performer
                  </Badge>
                )}
                {earnedHighPerformer && (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                    High Performer
                  </Badge>
                )}
                {overallScore >= 50 && overallScore < 75 && (
                  <Badge variant="secondary">Meeting Expectations</Badge>
                )}
                {overallScore < 50 && overallScore > 0 && (
                  <Badge variant="destructive">Needs Improvement</Badge>
                )}
                {badgeCount > 0 && (
                  <Badge variant="outline" className="gap-1">
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    {badgeCount} {badgeCount === 1 ? "badge" : "badges"}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Overall score</span>
                <TrendIndicator delta={overallDelta} />
                {teamAverages.overall_score !== undefined && (
                  <span className="text-muted-foreground/60">
                    Team avg: {Math.round(teamAverages.overall_score)}
                  </span>
                )}
              </div>

              {snapshots.length > 1 && (
                <ResponsiveContainer width="100%" height={48}>
                  <LineChart
                    data={snapshots.map((s) => ({
                      period: s.period_start,
                      value: s.overall_score,
                    }))}
                  >
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={ORANGE}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareOpen(true)}
                className="gap-1.5"
              >
                <Users className="size-4" />
                Compare
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Metric cards grid ── */}
      {currentMetrics ? (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Metric Breakdown</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METRIC_DEFS.map((def) => (
              <MetricCard
                key={def.normKey}
                def={def}
                metrics={currentMetrics}
                prevMetrics={prevMetrics}
                teamAvg={teamAverages[def.normKey] ?? 0}
                sparklineData={sparklineFor(def.normKey)}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No performance snapshot available yet for this coach.
          </CardContent>
        </Card>
      )}

      {/* ── Recent sessions table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5" />
            Recent Sessions
          </CardTitle>
          <CardDescription>Last 20 completed sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {recentSessions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Sport</TableHead>
                  <TableHead>Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {new Date(s.date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {s.centre_name}
                    </TableCell>
                    <TableCell className="text-sm">{s.sport}</TableCell>
                    <TableCell>
                      <StarRating rating={s.rating} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No completed sessions found.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Centre breakdown chart ── */}
      {centreBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Centre Breakdown</CardTitle>
            <CardDescription>
              Average feedback rating by centre (sorted by rating)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(160, centreBreakdown.length * 48)}
            >
              <BarChart
                layout="vertical"
                data={[...centreBreakdown].sort(
                  (a, b) => b.avg_rating - a.avg_rating
                )}
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#E5E7EB"
                />
                <XAxis
                  type="number"
                  domain={[0, 5]}
                  tick={{ fontSize: 12, fill: GRAY }}
                  tickCount={6}
                />
                <YAxis
                  type="category"
                  dataKey="centre_name"
                  width={140}
                  tick={{ fontSize: 12, fill: GRAY }}
                />
                <Tooltip
                  formatter={(value) => [Number(value).toFixed(1), "Avg Rating"]}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar
                  dataKey="avg_rating"
                  name="Avg Rating"
                  fill={ORANGE}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Sport breakdown chart ── */}
      {sportBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sport Breakdown</CardTitle>
            <CardDescription>
              Average feedback rating by sport (sorted by rating)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer
              width="100%"
              height={Math.max(160, sportBreakdown.length * 48)}
            >
              <BarChart
                layout="vertical"
                data={[...sportBreakdown].sort(
                  (a, b) => b.avg_rating - a.avg_rating
                )}
                margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#E5E7EB"
                />
                <XAxis
                  type="number"
                  domain={[0, 5]}
                  tick={{ fontSize: 12, fill: GRAY }}
                  tickCount={6}
                />
                <YAxis
                  type="category"
                  dataKey="sport"
                  width={120}
                  tick={{ fontSize: 12, fill: GRAY }}
                />
                <Tooltip
                  formatter={(value) => [Number(value).toFixed(1), "Avg Rating"]}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar
                  dataKey="avg_rating"
                  name="Avg Rating"
                  fill={GRAY}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Comparison dialog ── */}
      <CoachComparison
        open={compareOpen}
        onOpenChange={setCompareOpen}
        currentCoach={{
          id: coach.id,
          name: coach.name,
          normalised: currentNormalised,
        }}
        allCoaches={allCoaches}
      />
    </div>
  );
}
