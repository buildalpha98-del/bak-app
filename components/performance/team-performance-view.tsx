"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getTeamPerformanceData,
  exportTeamPerformanceCsv,
} from "@/lib/performance/actions";
import type { CoachMetrics } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

interface CoachRow {
  id: string;
  name: string;
  photo_url: string | null;
  overall_score: number;
  metrics: CoachMetrics;
  normalised: Record<string, number>;
  badge_count: number;
}

interface TeamData {
  coaches: CoachRow[];
  averages: Record<string, number>;
}

interface TeamPerformanceViewProps {
  initialData: TeamData;
}

type SortKey =
  | "name"
  | "overall_score"
  | "sessions"
  | "feedback_rating"
  | "form_completion"
  | "punctuality"
  | "reliability";

// ============================================================
// Helpers
// ============================================================

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600 bg-emerald-50";
  if (score >= 50) return "text-amber-600 bg-amber-50";
  return "text-red-600 bg-red-50";
}

function scoreBorder(score: number): string {
  if (score >= 75) return "border-emerald-200";
  if (score >= 50) return "border-amber-200";
  return "border-red-200";
}

function trendIcon(trend: number) {
  if (trend > 0)
    return <TrendingUp className="inline h-3.5 w-3.5 text-emerald-600" />;
  if (trend < 0)
    return <TrendingDown className="inline h-3.5 w-3.5 text-red-500" />;
  return <Minus className="inline h-3.5 w-3.5 text-slate-400" />;
}

function StarRating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i < Math.round(value)
              ? "fill-amber-400 text-amber-400"
              : "fill-slate-200 text-slate-200"
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {value.toFixed(1)}
      </span>
    </span>
  );
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthInputValue(start: string): string {
  return start.slice(0, 7);
}

function periodFromMonth(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;
  return { start, end };
}

function periodFromLastMonths(months: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  start.setDate(1);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function sortCoaches(
  coaches: CoachRow[],
  key: SortKey,
  dir: "asc" | "desc"
): CoachRow[] {
  return [...coaches].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (key) {
      case "name":
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case "overall_score":
        aVal = a.overall_score;
        bVal = b.overall_score;
        break;
      case "sessions":
        aVal = a.metrics.session_volume.count;
        bVal = b.metrics.session_volume.count;
        break;
      case "feedback_rating":
        aVal = a.metrics.feedback_rating.average;
        bVal = b.metrics.feedback_rating.average;
        break;
      case "form_completion":
        aVal = a.metrics.form_completion.rate;
        bVal = b.metrics.form_completion.rate;
        break;
      case "punctuality":
        aVal = a.metrics.punctuality.average_minutes;
        bVal = b.metrics.punctuality.average_minutes;
        break;
      case "reliability":
        aVal = a.metrics.shift_reliability.rate;
        bVal = b.metrics.shift_reliability.rate;
        break;
      default:
        aVal = 0;
        bVal = 0;
    }

    if (aVal < bVal) return dir === "asc" ? -1 : 1;
    if (aVal > bVal) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ============================================================
// Expanded row detail
// ============================================================

function ExpandedMetrics({
  metrics,
  normalised,
}: {
  metrics: CoachMetrics;
  normalised: Record<string, number>;
}) {
  const rows: Array<{
    label: string;
    value: string;
    norm: number;
    trend?: number;
  }> = [
    {
      label: "Session Volume",
      value: `${metrics.session_volume.count} sessions`,
      norm: normalised.session_volume ?? 0,
      trend: metrics.session_volume.trend,
    },
    {
      label: "Feedback Rating",
      value: `${metrics.feedback_rating.average.toFixed(1)} / 5 (${metrics.feedback_rating.count} ratings)`,
      norm: normalised.feedback_rating ?? 0,
      trend: metrics.feedback_rating.trend,
    },
    {
      label: "Form Completion",
      value: `${metrics.form_completion.rate.toFixed(0)}% (${metrics.form_completion.actual}/${metrics.form_completion.expected})`,
      norm: normalised.form_completion ?? 0,
    },
    {
      label: "Punctuality",
      value: `${metrics.punctuality.average_minutes.toFixed(1)} min avg late (${metrics.punctuality.late_count} late)`,
      norm: normalised.punctuality ?? 0,
    },
    {
      label: "Shift Reliability",
      value: `${metrics.shift_reliability.rate.toFixed(0)}% (${metrics.shift_reliability.completed}/${metrics.shift_reliability.total})`,
      norm: normalised.shift_reliability ?? 0,
    },
    {
      label: "Assessment Thoroughness",
      value: `Std dev ${metrics.assessment_thoroughness.std_dev.toFixed(2)}, avg ${metrics.assessment_thoroughness.avg_rating.toFixed(1)}`,
      norm: normalised.assessment_thoroughness ?? 0,
    },
    {
      label: "Equipment Responsibility",
      value: `${(metrics.equipment_responsibility.issue_rate * 100).toFixed(1)}% issue rate (${metrics.equipment_responsibility.issues}/${metrics.equipment_responsibility.checkins})`,
      norm: normalised.equipment_responsibility ?? 0,
    },
    {
      label: "Attendance Consistency",
      value: `${metrics.attendance_consistency.trend} — avg ${metrics.attendance_consistency.average_per_session.toFixed(1)}/session`,
      norm: normalised.attendance_consistency ?? 0,
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 px-4 pb-4">
      {rows.map(({ label, value, norm, trend }) => (
        <div
          key={label}
          className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-1"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xs text-foreground">{value}</p>
          <div className="flex items-center gap-1">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200">
              <div
                className={`h-1.5 rounded-full ${
                  norm >= 75
                    ? "bg-emerald-500"
                    : norm >= 50
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, norm)}%` }}
              />
            </div>
            {trend !== undefined && trendIcon(trend)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Main component
// ============================================================

export function TeamPerformanceView({ initialData }: TeamPerformanceViewProps) {
  const [data, setData] = useState<TeamData>(initialData);
  const [periodStart, setPeriodStart] = useState(firstOfMonthString());
  const [periodEnd, setPeriodEnd] = useState(todayString());
  const [sortKey, setSortKey] = useState<SortKey>("overall_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  // ── Period helpers ──────────────────────────────────────────

  function applyPeriod(start: string, end: string) {
    setPeriodStart(start);
    setPeriodEnd(end);
    startTransition(async () => {
      const result = await getTeamPerformanceData(start, end);
      setData(result as TeamData);
    });
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { start, end } = periodFromMonth(e.target.value);
    applyPeriod(start, end);
  }

  // ── Sort helpers ───────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <ChevronDown className="inline h-3 w-3 text-slate-300" />;
    return sortDir === "asc" ? (
      <ChevronUp className="inline h-3 w-3 text-primary" />
    ) : (
      <ChevronDown className="inline h-3 w-3 text-primary" />
    );
  }

  // ── Row expand ─────────────────────────────────────────────

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Export ─────────────────────────────────────────────────

  async function handleExport() {
    setIsExporting(true);
    try {
      const csv = await exportTeamPerformanceCsv(periodStart, periodEnd);
      if (!csv) return;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-performance-${periodStart}-to-${periodEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  // ── Derived data ───────────────────────────────────────────

  const sorted = sortCoaches(data.coaches, sortKey, sortDir);

  const totalSessions = data.coaches.reduce(
    (acc, c) => acc + c.metrics.session_volume.count,
    0
  );
  const avgScore = data.averages.overall_score ?? 0;
  const avgRating =
    data.coaches.length > 0
      ? data.coaches.reduce(
          (acc, c) => acc + c.metrics.feedback_rating.average,
          0
        ) / data.coaches.length
      : 0;
  const avgFormRate =
    data.coaches.length > 0
      ? data.coaches.reduce(
          (acc, c) => acc + c.metrics.form_completion.rate,
          0
        ) / data.coaches.length
      : 0;

  const thClass =
    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground whitespace-nowrap">
            Month
          </label>
          <Input
            type="month"
            className="w-40 h-9 text-sm"
            value={monthInputValue(periodStart)}
            onChange={handleMonthChange}
            disabled={isPending}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const { start, end } = periodFromLastMonths(3);
            applyPeriod(start, end);
          }}
          disabled={isPending}
        >
          Last 3 months
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const { start, end } = periodFromLastMonths(6);
            applyPeriod(start, end);
          }}
          disabled={isPending}
        >
          Last 6 months
        </Button>
        <span className="text-xs text-muted-foreground">
          {periodStart} &rarr; {periodEnd}
        </span>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Refreshing&hellip;
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || data.coaches.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting\u2026" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Team avg score */}
        <Card className={`border ${scoreBorder(avgScore)}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Avg Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold ${scoreColor(avgScore).split(" ")[0]}`}
            >
              {data.coaches.length === 0 ? "\u2014" : Math.round(avgScore)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">out of 100</p>
          </CardContent>
        </Card>

        {/* Total sessions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0 ? "\u2014" : totalSessions}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              across all coaches
            </p>
          </CardContent>
        </Card>

        {/* Avg feedback rating */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="h-4 w-4" />
              Avg Feedback Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0 ? "\u2014" : avgRating.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">out of 5.0</p>
          </CardContent>
        </Card>

        {/* Avg form completion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Avg Form Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0
                ? "\u2014"
                : `${avgFormRate.toFixed(0)}%`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              forms submitted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Coach performance table */}
      {data.coaches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No performance data for this period.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th
                    className={thClass}
                    onClick={() => handleSort("name")}
                  >
                    Coach <SortIcon col="name" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("overall_score")}
                  >
                    Score <SortIcon col="overall_score" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("sessions")}
                  >
                    Sessions <SortIcon col="sessions" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("feedback_rating")}
                  >
                    Avg Rating <SortIcon col="feedback_rating" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("form_completion")}
                  >
                    Form % <SortIcon col="form_completion" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("punctuality")}
                  >
                    Punctuality <SortIcon col="punctuality" />
                  </th>
                  <th
                    className={thClass}
                    onClick={() => handleSort("reliability")}
                  >
                    Reliability <SortIcon col="reliability" />
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((coach) => {
                  const expanded = expandedRows.has(coach.id);
                  return (
                    <>
                      <tr
                        key={coach.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => toggleRow(coach.id)}
                      >
                        {/* Coach name + avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                              {coach.photo_url ? (
                                <Image
                                  src={coach.photo_url}
                                  alt={coach.name}
                                  width={32}
                                  height={32}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-xs font-bold">
                                  {coach.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-foreground leading-tight">
                                {coach.name}
                              </p>
                              {coach.badge_count > 0 && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">
                                  {coach.badge_count} badge
                                  {coach.badge_count !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            {expanded ? (
                              <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* Overall score */}
                        <td className="px-4 py-3">
                          <Badge
                            className={`font-bold text-sm px-2 py-0.5 ${scoreColor(coach.overall_score)} border-0`}
                          >
                            {Math.round(coach.overall_score)}
                          </Badge>
                        </td>

                        {/* Sessions */}
                        <td className="px-4 py-3 text-foreground tabular-nums">
                          <span className="flex items-center gap-1">
                            {coach.metrics.session_volume.count}
                            {trendIcon(coach.metrics.session_volume.trend)}
                          </span>
                        </td>

                        {/* Avg rating */}
                        <td className="px-4 py-3">
                          <StarRating
                            value={coach.metrics.feedback_rating.average}
                          />
                        </td>

                        {/* Form completion */}
                        <td className="px-4 py-3 tabular-nums">
                          <span
                            className={
                              coach.metrics.form_completion.rate >= 80
                                ? "text-emerald-600"
                                : coach.metrics.form_completion.rate >= 60
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {coach.metrics.form_completion.rate.toFixed(0)}%
                          </span>
                        </td>

                        {/* Punctuality */}
                        <td className="px-4 py-3 tabular-nums">
                          <span
                            className={
                              coach.metrics.punctuality.average_minutes <= 2
                                ? "text-emerald-600"
                                : coach.metrics.punctuality.average_minutes <=
                                    5
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {coach.metrics.punctuality.average_minutes.toFixed(
                              1
                            )}{" "}
                            min
                          </span>
                        </td>

                        {/* Reliability */}
                        <td className="px-4 py-3 tabular-nums">
                          <span
                            className={
                              coach.metrics.shift_reliability.rate >= 90
                                ? "text-emerald-600"
                                : coach.metrics.shift_reliability.rate >= 75
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }
                          >
                            {coach.metrics.shift_reliability.rate.toFixed(0)}%
                          </span>
                        </td>

                        {/* Actions */}
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/admin/performance/${coach.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                            >
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expanded && (
                        <tr
                          key={`${coach.id}-expanded`}
                          className="bg-slate-50/50"
                        >
                          <td colSpan={8} className="pt-2">
                            <ExpandedMetrics
                              metrics={coach.metrics}
                              normalised={coach.normalised}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
