"use client";

import {
  Trophy,
  Star,
  TrendingUp,
  TrendingDown,
  Check,
  Target,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeDisplay } from "@/components/performance/badge-display";
import type { getCoachSelfPerformance } from "@/lib/performance/actions";

type CoachSelfPerformanceData = Awaited<ReturnType<typeof getCoachSelfPerformance>>;

// ============================================================
// Helpers
// ============================================================

function scoreColour(score: number): {
  ring: string;
  text: string;
  bg: string;
  label: string;
} {
  if (score >= 75) {
    return {
      ring: "ring-emerald-400",
      text: "text-emerald-600",
      bg: "bg-emerald-50",
      label: "Great",
    };
  }
  if (score >= 50) {
    return {
      ring: "ring-amber-400",
      text: "text-amber-600",
      bg: "bg-amber-50",
      label: "Good",
    };
  }
  return {
    ring: "ring-red-400",
    text: "text-red-600",
    bg: "bg-red-50",
    label: "Needs work",
  };
}

function formatMetricName(key: string): string {
  const MAP: Record<string, string> = {
    session_volume: "Sessions",
    feedback_rating: "Feedback",
    form_completion: "Forms",
    punctuality: "Punctuality",
    shift_reliability: "Reliability",
    assessment_thoroughness: "Assessments",
    equipment_responsibility: "Equipment",
    attendance_consistency: "Attendance",
  };
  return MAP[key] ?? key;
}

function metricDisplayValue(
  key: string,
  data: CoachSelfPerformanceData["current"]
): string {
  if (!data) return "—";
  const m = data.metrics_json as unknown as Record<
    string,
    Record<string, number | string | boolean>
  >;
  if (!m) return "—";

  switch (key) {
    case "session_volume":
      return `${m.session_volume?.count ?? 0} sessions`;
    case "feedback_rating":
      return m.feedback_rating?.average != null
        ? `${Number(m.feedback_rating.average).toFixed(1)} / 5`
        : "—";
    case "form_completion":
      return m.form_completion?.rate != null
        ? `${Math.round(Number(m.form_completion.rate))}%`
        : "—";
    case "punctuality":
      return m.punctuality?.average_minutes != null
        ? `${Number(m.punctuality.average_minutes).toFixed(1)} min avg late`
        : "—";
    case "shift_reliability":
      return m.shift_reliability?.rate != null
        ? `${Math.round(Number(m.shift_reliability.rate))}%`
        : "—";
    case "assessment_thoroughness":
      return m.assessment_thoroughness?.flagged ? "Needs variety" : "Good spread";
    case "equipment_responsibility":
      return m.equipment_responsibility?.issue_rate != null
        ? `${Math.round(Number(m.equipment_responsibility.issue_rate))}% issue rate`
        : "—";
    case "attendance_consistency":
      return m.attendance_consistency?.average_per_session != null
        ? `${Number(m.attendance_consistency.average_per_session).toFixed(1)} avg/session`
        : "—";
    default:
      return "—";
  }
}

function teamAvgDisplayValue(
  key: string,
  teamAverages: Record<string, number>
): string {
  const raw = teamAverages[key];
  if (raw == null) return "—";
  // Team averages are normalised 0-100; display as rounded score
  return `${Math.round(raw)}/100`;
}

// ============================================================
// Score Hero
// ============================================================

function ScoreHero({
  score,
  percentile,
}: {
  score: number;
  percentile: number;
}) {
  const { ring, text, bg, label } = scoreColour(score);

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div
        className={[
          "w-36 h-36 rounded-full ring-8 flex flex-col items-center justify-center",
          ring,
          bg,
        ].join(" ")}
      >
        <span className={["text-4xl font-extrabold font-heading", text].join(" ")}>
          {Math.round(score)}
        </span>
        <span className={["text-xs font-semibold uppercase tracking-wide", text].join(" ")}>
          {label}
        </span>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">
          Top {100 - percentile}% of coaches
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Overall performance score
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Metric Card
// ============================================================

interface MetricCardProps {
  metricKey: string;
  normValue: number;
  teamAvg: number;
  snapshot: CoachSelfPerformanceData["current"];
}

function MetricCard({ metricKey, normValue, teamAvg, snapshot }: MetricCardProps) {
  const isAbove = normValue >= teamAvg;
  const display = metricDisplayValue(metricKey, snapshot);
  const teamDisplay = teamAvgDisplayValue(metricKey, { [metricKey]: teamAvg });

  return (
    <Card className="border-border/60">
      <CardContent className="pt-4 pb-3 px-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {formatMetricName(metricKey)}
        </p>
        <p className="text-base font-bold text-foreground leading-tight">{display}</p>
        <div className="flex items-center gap-1.5">
          {isAbove ? (
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          )}
          <span
            className={[
              "text-xs font-medium",
              isAbove ? "text-emerald-600" : "text-amber-600",
            ].join(" ")}
          >
            {isAbove ? "Above average!" : "Room to grow"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Team avg: {teamDisplay}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// CoachSelfView
// ============================================================

export function CoachSelfView({ data }: { data: CoachSelfPerformanceData }) {
  const {
    current: snapshot,
    normalised,
    teamAverages,
    percentiles,
    badges,
    snapshots,
    highlights: feedbackHighlights,
  } = data;

  // Derive overall percentile (average across all metric percentiles)
  const percentileValues = Object.values(percentiles);
  const percentile = percentileValues.length > 0
    ? Math.round(percentileValues.reduce((a, b) => a + b, 0) / percentileValues.length)
    : 0;

  // Derive coachStats for badge progress display
  const metrics = snapshot?.metrics_json as unknown as Record<string, Record<string, unknown>> | null;
  const coachStats = metrics ? {
    totalSessions: (metrics.session_volume?.count as number) ?? 0,
    avgRating: (metrics.feedback_rating?.average as number) ?? 0,
    distinctSports: 0, // not tracked in snapshot
  } : undefined;

  // Transform snapshots into monthly trend data for the chart
  const monthlyTrend = snapshots.map((s) => ({
    month: new Date(s.period_start).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
    score: s.overall_score,
  }));

  const hasSnapshot = snapshot !== null;
  const metricKeys = normalised ? Object.keys(normalised) : [];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Score Hero ──────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardContent className="pt-2 pb-4">
          {hasSnapshot ? (
            <ScoreHero
              score={snapshot!.overall_score}
              percentile={percentile}
            />
          ) : (
            <div className="py-8 flex flex-col items-center gap-2 text-center">
              <Target className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">
                No performance data yet
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Your score will appear once your first performance snapshot has
                been generated. Keep completing sessions!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Badges ──────────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Badges
            {badges.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {badges.length} earned
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <BadgeDisplay
            badges={badges}
            showUnearned
            coachStats={coachStats}
          />
        </CardContent>
      </Card>

      {/* ── Metric Cards ────────────────────────────────────────────── */}
      {hasSnapshot && metricKeys.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Metric Breakdown
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {metricKeys.map((key) => (
              <MetricCard
                key={key}
                metricKey={key}
                normValue={normalised?.[key] ?? 0}
                teamAvg={teamAverages[key] ?? 0}
                snapshot={snapshot}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Monthly Trend Chart ─────────────────────────────────────── */}
      {monthlyTrend.length >= 2 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Score Trend (last 6 months)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={monthlyTrend}
                margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "#666" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10, fill: "#666" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                  formatter={(value: unknown) => [
                    `${value}/100`,
                    "Overall Score",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="overall_score"
                  stroke="#E8712A"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#E8712A", strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Highlights ──────────────────────────────────────── */}
      {feedbackHighlights.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            Recent Highlights
          </h2>
          <div className="space-y-3">
            {feedbackHighlights.map((item: { type: string; text: string }, idx: number) => (
              <Card
                key={idx}
                className="border-emerald-200 bg-emerald-50/60"
              >
                <CardContent className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-sm text-foreground">{item.text}</p>
                    <Badge className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shrink-0">
                      {item.type}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state for highlights ───────────────────────────────── */}
      {hasSnapshot && feedbackHighlights.length === 0 && (
        <Card className="border-border/60 bg-muted/30">
          <CardContent className="px-4 py-5 flex items-center gap-3">
            <TrendingDown className="w-8 h-8 text-muted-foreground/40 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No feedback highlights yet
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Positive comments from centres will appear here once they start
                rolling in.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
