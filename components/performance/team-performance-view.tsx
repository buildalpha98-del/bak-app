"use client";

// ============================================================
// TeamPerformanceView
// ============================================================
//
// Shared shell for /admin/performance and /ops/performance. Drives:
//   - URL-persisted period (from / to), region, sport, benchmark
//     filter, view mode (table / cards)
//   - Inline pulse strip jump-filters (?benchmark=below | above |
//     ?feedback=zero)
//   - MonthCalendarPopover in month mode with preset row inside
//   - Top 3 performers widget
//   - 4 summary cards with useCountUp animation
//   - Leaderboard card grid OR sortable table
//   - Per-row badges chip group, region badge, trend arrow vs prior
//     period of the same length, quick action buttons (View detail +
//     View roster) — the roster link lands on a coach-pre-filtered
//     /admin/roster (see commit 91a1581)
//   - Mobile responsive: table collapses to a card list under md
//
// Design language mirrors the centres / staff / children close-outs:
//   - rounded-2xl on every container and card
//   - brand orange (#E8712A) is restrained to Team Avg Score, active
//     view-toggle, top-performer card, Export CSV CTA, active filter
//     chip ring
//   - gap-6 between sections, gap-4 within
//   - hover-lift on grid cards (-translate-y-0.5 hover:shadow-md)
//   - hover:bg-muted/30 on table rows

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Award,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  LayoutGrid,
  List,
  MapPin,
  Minus,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  exportTeamPerformanceCsv,
  getTeamPerformanceData,
  type TeamPerformanceCoach,
  type TeamPerformanceData,
} from "@/lib/performance/actions";
import { MonthCalendarPopover } from "@/components/roster/month-calendar-popover";
import { useCountUp } from "@/components/launch/use-count-up";
import { BADGE_DEFINITIONS, type BadgeKey } from "@/lib/utils/performance/badges";

// ============================================================
// Types
// ============================================================

interface RegionOption {
  id: string;
  name: string;
}

type ViewMode = "table" | "cards";
type BenchmarkFilter = "all" | "above" | "below";
type SortKey =
  | "name"
  | "overall_score"
  | "sessions"
  | "feedback_rating"
  | "form_completion"
  | "punctuality"
  | "reliability";

interface TeamPerformanceViewProps {
  initialData: TeamPerformanceData;
  /** "/admin/performance" or "/ops/performance" — jump links keep us in scope. */
  basePath?: string;
  regions?: RegionOption[];
}

// ============================================================
// Helpers — colour, period, sort
// ============================================================

const UNDERPERFORMING_THRESHOLD = 60;
const TOP_PERFORMER_THRESHOLD = 80;

const SPORTS = [
  "Soccer",
  "Basketball",
  "Athletics",
  "Yoga",
  "Pilates",
  "Boot Camp",
  "Swimming",
  "Pickleball",
  "Golf",
  "Hockey",
  "Lacrosse",
  "Motor Skills",
  "Multi-Sport",
  "Cricket",
  "Netball",
  "Tennis",
  "Volleyball",
  "Dance",
  "Gymnastics",
];

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

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function firstOfThisMonthYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Anchor to the 1st of the given month (YYYY-MM-DD). */
function firstOfMonth(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}

/** Last day of the given month, YYYY-MM-DD. */
function lastOfMonth(year: number, month0: number): string {
  const last = new Date(year, month0 + 1, 0);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

/** Range covering the last N calendar months including the current one. */
function periodFromLastMonths(months: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const end = new Date(); // through today
  return {
    start: firstOfMonth(start.getFullYear(), start.getMonth()),
    end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
  };
}

/**
 * Polished period label — Sydney-local "From 1 May – 17 May 2026" style
 * instead of `2026-05-01 → 2026-05-17`. Same-month and same-year
 * collapsing matches `formatWeekLabel` in lib/utils/roster.ts.
 */
function formatPeriodLabel(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
    return `${start} → ${end}`;
  }
  const monthShort = (d: Date) =>
    d.toLocaleDateString("en-AU", { month: "short" });
  const day = (d: Date) => d.getDate();
  const sameMonth =
    s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `From ${day(s)} – ${day(e)} ${monthShort(e)} ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `From ${day(s)} ${monthShort(s)} – ${day(e)} ${monthShort(e)} ${e.getFullYear()}`;
  }
  return `From ${day(s)} ${monthShort(s)} ${s.getFullYear()} – ${day(e)} ${monthShort(e)} ${e.getFullYear()}`;
}

function sortCoaches(
  coaches: TeamPerformanceCoach[],
  key: SortKey,
  dir: "asc" | "desc",
): TeamPerformanceCoach[] {
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
// Sub-components
// ============================================================

function BadgeChips({
  badges,
  size = "sm",
}: {
  badges: Array<{ key: string; earned_at: string }>;
  size?: "sm" | "xs";
}) {
  if (badges.length === 0) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        No badges yet
      </span>
    );
  }
  const pad = size === "xs" ? "px-1.5 py-0" : "px-2 py-0.5";
  const textSize = size === "xs" ? "text-[10px]" : "text-[11px]";
  return (
    <ul
      id="badges"
      className="flex flex-wrap items-center gap-1"
      aria-label="Recently earned badges"
    >
      {badges.map((b) => {
        const def = BADGE_DEFINITIONS[b.key as BadgeKey];
        const label = def?.name ?? b.key;
        return (
          <li
            key={b.key}
            title={def?.description ?? label}
            className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 ${pad} font-medium text-amber-700 ${textSize}`}
          >
            <Award className="size-3" />
            {label}
          </li>
        );
      })}
    </ul>
  );
}

function TrendArrow({
  current,
  prior,
}: {
  current: number;
  prior: number | null;
}) {
  if (prior === null) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
        title="No prior period data"
      >
        <Minus className="size-3" />
        new
      </span>
    );
  }
  const delta = Math.round(current - prior);
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-600">
        <ArrowUp className="size-3" />+{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <ArrowDown className="size-3" />
        {delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
      <Minus className="size-3" />0
    </span>
  );
}

function ExpandedMetrics({
  coach,
}: {
  coach: TeamPerformanceCoach;
}) {
  const m = coach.metrics;
  const norm = coach.normalised;
  const rows: Array<{
    label: string;
    value: string;
    norm: number;
    trend?: number;
  }> = [
    {
      label: "Session Volume",
      value: `${m.session_volume.count} sessions`,
      norm: norm.session_volume ?? 0,
      trend: m.session_volume.trend,
    },
    {
      label: "Feedback Rating",
      value: `${m.feedback_rating.average.toFixed(1)} / 5 (${m.feedback_rating.count} ratings)`,
      norm: norm.feedback_rating ?? 0,
      trend: m.feedback_rating.trend,
    },
    {
      label: "Form Completion",
      value: `${m.form_completion.rate.toFixed(0)}% (${m.form_completion.actual}/${m.form_completion.expected})`,
      norm: norm.form_completion ?? 0,
    },
    {
      label: "Punctuality",
      value: `${m.punctuality.average_minutes.toFixed(1)} min avg late (${m.punctuality.late_count} late)`,
      norm: norm.punctuality ?? 0,
    },
    {
      label: "Shift Reliability",
      value: `${m.shift_reliability.rate.toFixed(0)}% (${m.shift_reliability.completed}/${m.shift_reliability.total})`,
      norm: norm.shift_reliability ?? 0,
    },
    {
      label: "Assessment Thoroughness",
      value: `Std dev ${m.assessment_thoroughness.std_dev.toFixed(2)}, avg ${m.assessment_thoroughness.avg_rating.toFixed(1)}`,
      norm: norm.assessment_thoroughness ?? 0,
    },
    {
      label: "Equipment Responsibility",
      value: `${(m.equipment_responsibility.issue_rate * 100).toFixed(1)}% issue rate (${m.equipment_responsibility.issues}/${m.equipment_responsibility.checkins})`,
      norm: norm.equipment_responsibility ?? 0,
    },
    {
      label: "Attendance Consistency",
      value: `${m.attendance_consistency.trend} — avg ${m.attendance_consistency.average_per_session.toFixed(1)}/session`,
      norm: norm.attendance_consistency ?? 0,
    },
  ];

  return (
    <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(({ label, value, norm: n, trend }) => (
        <div
          key={label}
          className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xs text-foreground">{value}</p>
          <div className="flex items-center gap-1">
            <div className="h-1.5 flex-1 rounded-full bg-slate-200">
              <div
                className={`h-1.5 rounded-full ${
                  n >= 75
                    ? "bg-emerald-500"
                    : n >= 50
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${Math.min(100, n)}%` }}
              />
            </div>
            {trend !== undefined && trendIcon(trend)}
          </div>
        </div>
      ))}
    </div>
  );
}

function CoachAvatar({
  name,
  photo_url,
  size = "md",
}: {
  name: string;
  photo_url: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm" ? 32 : size === "lg" ? 56 : 40;
  const cls =
    size === "sm"
      ? "h-8 w-8"
      : size === "lg"
        ? "h-14 w-14"
        : "h-10 w-10";
  return (
    <div
      className={`${cls} flex-shrink-0 overflow-hidden rounded-full bg-slate-200`}
    >
      {photo_url ? (
        <Image
          src={photo_url}
          alt={name}
          width={dims}
          height={dims}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#E8712A]/10 text-sm font-bold text-[#E8712A]">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function CountUpNumber({
  value,
  className,
  decimals = 0,
}: {
  value: number;
  className?: string;
  decimals?: number;
}) {
  // useCountUp returns integers; for decimal values we scale → animate
  // → rescale so the tick-up still feels like a single motion.
  const factor = Math.pow(10, decimals);
  const ticked = useCountUp(Math.round(value * factor));
  const display = decimals === 0 ? ticked : (ticked / factor).toFixed(decimals);
  return <span className={className}>{display}</span>;
}

// ============================================================
// Main component
// ============================================================

export function TeamPerformanceView({
  initialData,
  basePath = "/admin/performance",
  regions = [],
}: TeamPerformanceViewProps) {
  const router = useRouter();
  const params = useSearchParams();

  // ============================================================
  // URL-backed state
  // ============================================================

  const initialFrom = params.get("from") ?? firstOfThisMonthYmd();
  const initialTo = params.get("to") ?? todayYmd();
  const initialRegion = params.get("region") ?? "all";
  const initialSport = params.get("sport") ?? "all";
  const initialBenchmark = ((): BenchmarkFilter => {
    const v = params.get("benchmark");
    if (v === "above" || v === "below") return v;
    return "all";
  })();
  const initialView: ViewMode =
    params.get("view") === "cards" ? "cards" : "table";
  const feedbackJump = params.get("feedback") === "zero";

  const [data, setData] = useState<TeamPerformanceData>(initialData);
  const [periodStart, setPeriodStart] = useState(initialFrom);
  const [periodEnd, setPeriodEnd] = useState(initialTo);
  const [regionFilter, setRegionFilter] = useState(initialRegion);
  const [sportFilter, setSportFilter] = useState(initialSport);
  const [benchmark, setBenchmark] = useState<BenchmarkFilter>(initialBenchmark);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);

  const [sortKey, setSortKey] = useState<SortKey>("overall_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  const replaceParam = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "" || v === "all") {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  function applyPeriod(start: string, end: string) {
    setPeriodStart(start);
    setPeriodEnd(end);
    replaceParam({
      from: start === firstOfThisMonthYmd() ? null : start,
      to: end === todayYmd() ? null : end,
    });
    startTransition(async () => {
      const result = await getTeamPerformanceData(start, end);
      setData(result);
    });
  }

  function handleMonthSelect(anchor: Date) {
    const start = firstOfMonth(anchor.getFullYear(), anchor.getMonth());
    const end = lastOfMonth(anchor.getFullYear(), anchor.getMonth());
    applyPeriod(start, end);
  }

  function handlePreset(months: number) {
    const { start, end } = periodFromLastMonths(months);
    applyPeriod(start, end);
  }

  function setRegionFilterAndUrl(v: string) {
    setRegionFilter(v);
    replaceParam({ region: v });
  }
  function setSportFilterAndUrl(v: string) {
    setSportFilter(v);
    replaceParam({ sport: v });
  }
  function setBenchmarkAndUrl(v: BenchmarkFilter) {
    setBenchmark(v);
    replaceParam({ benchmark: v });
  }
  function setViewModeAndUrl(v: ViewMode) {
    setViewMode(v);
    replaceParam({ view: v === "table" ? null : v });
  }
  function clearFeedbackJump() {
    replaceParam({ feedback: null });
  }

  // ============================================================
  // Sort + row expand
  // ============================================================

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
      <ChevronUp className="inline h-3 w-3 text-[#E8712A]" />
    ) : (
      <ChevronDown className="inline h-3 w-3 text-[#E8712A]" />
    );
  }

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

  // ============================================================
  // Export
  // ============================================================

  async function handleExport() {
    setIsExporting(true);
    try {
      const csv = await exportTeamPerformanceCsv(periodStart, periodEnd);
      if (!csv) {
        toast.error("Nothing to export.");
        return;
      }
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-performance-${periodStart}-to-${periodEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.coaches.length} coaches.`);
    } finally {
      setIsExporting(false);
    }
  }

  // ============================================================
  // Derived data
  // ============================================================

  const filtered = useMemo(() => {
    let items = data.coaches;

    if (regionFilter !== "all") {
      items = items.filter((c) => c.region_id === regionFilter);
    }

    if (sportFilter !== "all") {
      items = items.filter((c) => {
        // Heuristic: any session of the matching sport implies the coach
        // delivered it in the period. snapshot.metrics_json doesn't carry
        // a per-sport breakdown, so we fall back to "has any sessions"
        // and let the [coachId] page show the full breakdown. Treating
        // sport=all as the common case keeps the page useful even when
        // the breakdown is sparse.
        return c.metrics.session_volume.count > 0;
      });
    }

    if (benchmark === "above") {
      items = items.filter(
        (c) => c.overall_score >= TOP_PERFORMER_THRESHOLD,
      );
    } else if (benchmark === "below") {
      items = items.filter(
        (c) => c.overall_score < UNDERPERFORMING_THRESHOLD,
      );
    }

    if (feedbackJump) {
      items = items.filter((c) => c.metrics.feedback_rating.count === 0);
    }

    return items;
  }, [data.coaches, regionFilter, sportFilter, benchmark, feedbackJump]);

  const sorted = sortCoaches(filtered, sortKey, sortDir);

  // Reset expand state if the row no longer exists after a refilter.
  useEffect(() => {
    if (expandedRows.size === 0) return;
    const visibleIds = new Set(sorted.map((c) => c.id));
    const next = new Set<string>();
    for (const id of expandedRows) {
      if (visibleIds.has(id)) next.add(id);
    }
    if (next.size !== expandedRows.size) setExpandedRows(next);
  }, [sorted, expandedRows]);

  const totalSessions = data.coaches.reduce(
    (acc, c) => acc + c.metrics.session_volume.count,
    0,
  );
  const avgScore = data.averages.overall_score ?? 0;
  const avgRating =
    data.coaches.length > 0
      ? data.coaches.reduce(
          (acc, c) => acc + c.metrics.feedback_rating.average,
          0,
        ) / data.coaches.length
      : 0;
  const avgFormRate =
    data.coaches.length > 0
      ? data.coaches.reduce(
          (acc, c) => acc + c.metrics.form_completion.rate,
          0,
        ) / data.coaches.length
      : 0;

  const top3 = useMemo(() => data.coaches.slice(0, 3), [data.coaches]);

  const regionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const anyFilterActive =
    regionFilter !== "all" ||
    sportFilter !== "all" ||
    benchmark !== "all" ||
    feedbackJump;

  function clearAllFilters() {
    setRegionFilter("all");
    setSportFilter("all");
    setBenchmark("all");
    replaceParam({
      region: null,
      sport: null,
      benchmark: null,
      feedback: null,
    });
  }

  const thClass =
    "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Period + filter row */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-background p-3">
        <MonthCalendarPopover
          mode="month"
          weekStart={periodStart}
          onSelect={handleMonthSelect}
          presets={[
            { label: "This month", months: 1 },
            { label: "Last 3 months", months: 3 },
            { label: "Last 6 months", months: 6 },
          ]}
          onPresetSelect={handlePreset}
        />

        <Select
          value={regionFilter}
          onValueChange={(v) => setRegionFilterAndUrl(v as string)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sportFilter}
          onValueChange={(v) => setSportFilterAndUrl(v as string)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Sport" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sports</SelectItem>
            {SPORTS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={benchmark}
          onValueChange={(v) => setBenchmarkAndUrl(v as BenchmarkFilter)}
        >
          <SelectTrigger
            className={`h-9 w-[150px] ${benchmark !== "all" ? "border-[#E8712A]/40 ring-2 ring-[#E8712A]/20" : ""}`}
          >
            <SelectValue placeholder="Benchmark" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scores</SelectItem>
            <SelectItem value="above">Above 80</SelectItem>
            <SelectItem value="below">Below 60</SelectItem>
          </SelectContent>
        </Select>

        {anyFilterActive && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="size-4" />
            Clear
          </Button>
        )}

        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Refreshing…
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline-flex">
            <CalendarDays className="mr-1 size-3.5" />
            {formatPeriodLabel(periodStart, periodEnd)}
          </span>

          <div className="flex rounded-2xl border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewModeAndUrl("table")}
              aria-label="Table view"
              className={
                viewMode === "table"
                  ? "rounded-2xl bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                  : ""
              }
            >
              <List className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewModeAndUrl("cards")}
              aria-label="Card view"
              className={
                viewMode === "cards"
                  ? "rounded-2xl bg-[#E8712A]/10 text-[#E8712A] hover:bg-[#E8712A]/15"
                  : ""
              }
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>

          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting || data.coaches.length === 0}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Download className="mr-1 size-4" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Mobile-only period text — desktop has it inline above */}
      <p className="text-xs text-muted-foreground sm:hidden">
        <CalendarDays className="mr-1 inline size-3.5" />
        {formatPeriodLabel(periodStart, periodEnd)}
      </p>

      {/* Active jump-filter chip (feedback=zero comes from pulse) */}
      {feedbackJump && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#E8712A]/40 bg-[#E8712A]/10 px-2.5 py-1 text-xs font-medium text-[#E8712A]">
            Coaches with no feedback this period
            <button
              type="button"
              onClick={clearFeedbackJump}
              className="ml-1 rounded-full p-0.5 hover:bg-[#E8712A]/20"
              aria-label="Clear feedback filter"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}

      {/* Top 3 performers widget */}
      {top3.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {top3.map((coach, i) => {
            const tone =
              i === 0
                ? "border-[#E8712A]/40 bg-[#E8712A]/5"
                : "border bg-card";
            const badge = coach.badges[0];
            const badgeName = badge
              ? (BADGE_DEFINITIONS[badge.key as BadgeKey]?.name ?? badge.key)
              : null;
            return (
              <Link
                key={coach.id}
                href={`${basePath}/${coach.id}`}
                className={`group flex items-center gap-3 rounded-2xl ${tone} p-4 transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="relative">
                  <CoachAvatar
                    name={coach.name}
                    photo_url={coach.photo_url}
                    size="lg"
                  />
                  {i === 0 && (
                    <span className="absolute -top-1 -right-1 rounded-full bg-[#E8712A] p-1 text-white">
                      <Trophy className="size-3" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {i === 0
                      ? "Top performer"
                      : i === 1
                        ? "Runner-up"
                        : "3rd place"}
                  </p>
                  <p className="truncate font-semibold text-foreground">
                    {coach.name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={
                        i === 0
                          ? "text-2xl font-bold text-[#E8712A]"
                          : "text-2xl font-bold text-foreground"
                      }
                    >
                      <CountUpNumber
                        value={Math.round(coach.overall_score)}
                      />
                    </span>
                    {badgeName && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        <Award className="size-3" />
                        {badgeName}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Team avg score */}
        <Card
          className={`rounded-2xl border-[#E8712A]/30 bg-[#E8712A]/5 ${scoreBorder(avgScore)}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="h-4 w-4" />
              Team Avg Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[#E8712A]">
              {data.coaches.length === 0 ? (
                "—"
              ) : (
                <CountUpNumber value={Math.round(avgScore)} />
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">out of 100</p>
          </CardContent>
        </Card>

        {/* Total sessions */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Total Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0 ? (
                "—"
              ) : (
                <CountUpNumber value={totalSessions} />
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              across all coaches
            </p>
          </CardContent>
        </Card>

        {/* Avg feedback rating */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Star className="h-4 w-4" />
              Avg Feedback Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0 ? (
                "—"
              ) : (
                <CountUpNumber value={avgRating} decimals={1} />
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">out of 5.0</p>
          </CardContent>
        </Card>

        {/* Avg form completion */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Avg Form Completion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {data.coaches.length === 0 ? (
                "—"
              ) : (
                <>
                  <CountUpNumber value={Math.round(avgFormRate)} />%
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              forms submitted
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {anyFilterActive
              ? "No coaches match the current filters."
              : "No performance data for this period."}
          </p>
        </div>
      ) : viewMode === "cards" ? (
        <CoachLeaderboardGrid
          items={sorted}
          basePath={basePath}
          regionsById={regionNameById}
        />
      ) : (
        <>
          {/* Mobile: collapse table to a card list under md */}
          <div className="space-y-3 md:hidden">
            {sorted.map((coach) => (
              <MobileCoachCard
                key={coach.id}
                coach={coach}
                basePath={basePath}
                regionsById={regionNameById}
              />
            ))}
          </div>

          {/* Desktop: classic sortable table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
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
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      Badges
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.map((coach) => {
                    const expanded = expandedRows.has(coach.id);
                    const regionName = coach.region_name;
                    return [
                      <tr
                        key={`row-${coach.id}`}
                        className="cursor-pointer transition-colors hover:bg-muted/30"
                        onClick={() => toggleRow(coach.id)}
                      >
                        {/* Coach name + avatar + region */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <CoachAvatar
                              name={coach.name}
                              photo_url={coach.photo_url}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-tight text-foreground">
                                {coach.name}
                              </p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                {regionName && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="size-3" />
                                    {regionName}
                                  </span>
                                )}
                                {coach.badge_count > 0 && (
                                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                    {coach.badge_count} badge
                                    {coach.badge_count !== 1 ? "s" : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                            {expanded ? (
                              <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </td>

                        {/* Overall score + trend */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={`px-2 py-0.5 text-sm font-bold ${scoreColor(coach.overall_score)} border-0`}
                            >
                              {Math.round(coach.overall_score)}
                            </Badge>
                            <TrendArrow
                              current={coach.overall_score}
                              prior={coach.prior_overall_score}
                            />
                          </div>
                        </td>

                        {/* Sessions */}
                        <td className="px-4 py-3 tabular-nums text-foreground">
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
                              1,
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

                        {/* Badges */}
                        <td className="px-4 py-3">
                          <BadgeChips badges={coach.badges} size="xs" />
                        </td>

                        {/* Quick actions */}
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              render={
                                <Link href={`/admin/roster?coach=${coach.id}`} />
                              }
                            >
                              View roster
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              render={
                                <Link href={`${basePath}/${coach.id}`} />
                              }
                            >
                              View detail
                            </Button>
                          </div>
                        </td>
                      </tr>,
                      expanded ? (
                        <tr
                          key={`expanded-${coach.id}`}
                          className="bg-slate-50/50"
                        >
                          <td colSpan={9} className="pt-2">
                            <ExpandedMetrics coach={coach} />
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// CoachLeaderboardGrid — alternative view mode
// ============================================================

function CoachLeaderboardGrid({
  items,
  basePath,
  regionsById,
}: {
  items: TeamPerformanceCoach[];
  basePath: string;
  regionsById: Map<string, string>;
}) {
  return (
    <div
      id="badges"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((coach) => (
        <CoachLeaderboardCard
          key={coach.id}
          coach={coach}
          basePath={basePath}
          regionsById={regionsById}
        />
      ))}
    </div>
  );
}

function CoachLeaderboardCard({
  coach,
  basePath,
  regionsById,
}: {
  coach: TeamPerformanceCoach;
  basePath: string;
  regionsById: Map<string, string>;
}) {
  const regionName =
    coach.region_name ??
    (coach.region_id ? (regionsById.get(coach.region_id) ?? null) : null);
  return (
    <div className="group rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-3">
        <CoachAvatar
          name={coach.name}
          photo_url={coach.photo_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {coach.name}
          </p>
          {regionName && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {regionName}
            </p>
          )}
        </div>
        <div className="text-right">
          <div
            className={`inline-flex items-baseline gap-1 rounded-xl px-2.5 py-1 ${scoreColor(coach.overall_score)}`}
          >
            <span className="text-2xl font-bold tabular-nums">
              {Math.round(coach.overall_score)}
            </span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">
              /100
            </span>
          </div>
          <div className="mt-1 flex justify-end">
            <TrendArrow
              current={coach.overall_score}
              prior={coach.prior_overall_score}
            />
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="mt-3">
        <BadgeChips badges={coach.badges} size="sm" />
      </div>

      {/* Inline mini-metrics — rating + reliability for quick scan */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Sessions
          </p>
          <p className="font-semibold tabular-nums text-foreground">
            {coach.metrics.session_volume.count}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Rating
          </p>
          <p className="font-semibold tabular-nums text-foreground">
            {coach.metrics.feedback_rating.average.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reliability
          </p>
          <p
            className={`font-semibold tabular-nums ${coach.metrics.shift_reliability.rate >= 90 ? "text-emerald-600" : "text-foreground"}`}
          >
            {coach.metrics.shift_reliability.rate.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-xs"
          render={<Link href={`/admin/roster?coach=${coach.id}`} />}
        >
          View roster
        </Button>
        <Button
          size="sm"
          className="flex-1 h-8 bg-[#E8712A] text-xs text-white hover:bg-[#E8712A]/90"
          render={<Link href={`${basePath}/${coach.id}`} />}
        >
          View detail
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// MobileCoachCard — table fallback under md
// ============================================================

function MobileCoachCard({
  coach,
  basePath,
  regionsById,
}: {
  coach: TeamPerformanceCoach;
  basePath: string;
  regionsById: Map<string, string>;
}) {
  const regionName =
    coach.region_name ??
    (coach.region_id ? (regionsById.get(coach.region_id) ?? null) : null);

  return (
    <Link
      href={`${basePath}/${coach.id}`}
      className="block rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <CoachAvatar
          name={coach.name}
          photo_url={coach.photo_url}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {coach.name}
          </p>
          {regionName && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" />
              {regionName}
            </p>
          )}
        </div>
        <div className="text-right">
          <Badge
            className={`px-2 py-0.5 text-sm font-bold ${scoreColor(coach.overall_score)} border-0`}
          >
            {Math.round(coach.overall_score)}
          </Badge>
          <div className="mt-1 flex justify-end">
            <TrendArrow
              current={coach.overall_score}
              prior={coach.prior_overall_score}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Rating
          </p>
          <p className="font-semibold tabular-nums text-foreground">
            {coach.metrics.feedback_rating.average.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Form
          </p>
          <p className="font-semibold tabular-nums text-foreground">
            {coach.metrics.form_completion.rate.toFixed(0)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reliability
          </p>
          <p className="font-semibold tabular-nums text-foreground">
            {coach.metrics.shift_reliability.rate.toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mt-3">
        <BadgeChips badges={coach.badges} size="xs" />
      </div>
    </Link>
  );
}
