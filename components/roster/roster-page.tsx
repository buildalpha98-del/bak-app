"use client";

// ============================================================
// RosterPage
// ============================================================
//
// Shared shell for /admin/roster and /ops/roster. Owns the toolbar,
// the inline pulse strip, the URL-backed filter chips, the AI review
// flow, and the dispatch to one of three child views (staff /
// calendar / list).
//
// Recent refresh (commit feat/roster …):
//   - Inline `RosterStatusPulseStrip` above the toolbar with cheap,
//     server-batched counts.
//   - URL-persisted filters: status / sport / centre / coach / region.
//   - URL-persisted `view` so a refresh keeps the operator in place.
//   - `MonthCalendarPopover` replaces the native date picker.
//   - "Publish week" bulk CTA with confirmation dialog.
//   - Mobile toolbar compression — Check Clashes / Add / Generate
//     collapse into a "More" dropdown below md.
//   - Financial gate plumbed down to `SessionDetailSheet`.
//   - "Last AI run" pill next to AI Assign.
//   - Design rhythm: rounded-2xl, gap-6 between sections, restrained
//     brand orange.
//
// Design language: mirrors the centres list refresh (commit 6cbfb6d):
//   - rounded-2xl containers
//   - gap-6 between page-level sections, gap-4 within toolbars
//   - brand orange (#E8712A) reserved for the AI Assign CTA, the
//     active-filter ring, the pulse counts > 0, the coverage bar fill,
//     and the "Publish week" button when ≥1 draft is queued.

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  List,
  Plus,
  Zap,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
  X,
  MoreVertical,
  Check,
  Clock,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SessionCalendarView } from "./session-calendar-view";
import { StaffRosterView } from "./staff-roster-view";
import { SessionListView } from "./session-list-view";
import { SessionDetailSheet } from "./session-detail-sheet";
import { CreateSessionDialog } from "./create-session-dialog";
import { GenerateSessionsDialog } from "./generate-sessions-dialog";
import { AIGenerateDialog } from "./ai-generate-dialog";
import { AISummaryBar } from "./ai-summary-bar";
import { ConfidenceBadge } from "./confidence-badge";
import { CoachSwapPanel } from "./coach-swap-panel";
import { ClashDetectionDialog } from "./clash-detection-dialog";
import { RosterStatusPulseStrip } from "./roster-status-pulse";
import { MonthCalendarPopover } from "./month-calendar-popover";
import { useSessionsRealtime } from "@/lib/hooks/useSessionsRealtime";
import { getMonday, formatWeekLabel } from "@/lib/utils/roster";
import {
  bulkUpdateSessionStatus,
  bulkReassignCoach,
} from "@/lib/sessions/actions";
import {
  getSchedulingRun,
  publishSchedulingRun,
} from "@/lib/scheduling/actions";
import { publishDraftSessionsForWeek } from "@/lib/sessions/scheduling-actions";
import { SPORTS } from "@/lib/types/enums";
import type { SessionStatus, Sport } from "@/lib/types/enums";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type {
  Centre,
  Profile,
  Term,
  Region,
  SchedulingAssignment,
  SchedulingRunOutputSummary,
} from "@/lib/types/database";
import type { SessionCertWarning } from "@/lib/utils/compliance/cert-warnings";
import type { UnconfirmedShift } from "@/lib/sessions/shift-actions";
import type { RosterStatusPulse, LatestSchedulingRun } from "@/lib/roster/status-pulse-actions";
import { UnconfirmedShiftsBanner } from "./unconfirmed-shifts-banner";
import { WeekCostChip } from "./week-cost-chip";

// ============================================================
// Status filter — extends SessionStatus with a synthetic
// "unassigned" pseudo-status that maps to `coach_id IS NULL`.
// ============================================================

type StatusFilter = SessionStatus | "unassigned" | "all";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "pending_confirmation", label: "Pending confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "needs_replacement", label: "Needs replacement" },
  { value: "unassigned", label: "Unassigned" },
];

const STATUS_LABEL = new Map<StatusFilter, string>(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

// ============================================================
// Props
// ============================================================

interface RosterPageProps {
  initialSessions: SessionWithRelations[];
  initialWeekStart: string; // "YYYY-MM-DD" Monday
  centres: Pick<Centre, "id" | "name">[];
  /**
   * Optional centre→region map source. Mapped client-side so we can
   * filter by region without touching the per-session shape. When a
   * centre has no region_id (early data), it just doesn't match any
   * region filter — which is the conservative behaviour.
   */
  centresWithRegion?: Array<Pick<Centre, "id" | "name"> & { region_id: string | null }>;
  coaches: Pick<Profile, "id" | "name">[];
  activeTerm: Term | null;
  /** Regions for the Region filter chip. */
  regions?: Pick<Region, "id" | "name">[];
  /** When false, the wage projection cell and the detail-sheet pay
   *  block both hide themselves. Default false — fail closed. */
  hasFinancialAccess?: boolean;
  /** Server-batched pulse counts (drafts, unassigned, coverage,
   *  projected wage). The wage figure is server-gated. */
  rosterPulse?: RosterStatusPulse;
  /** Most recent scheduling run for this week (or null). Drives
   *  the "Last AI run" pill. */
  latestRun?: LatestSchedulingRun | null;
  basePath: string; // "/admin/roster" or "/ops/roster"
  /** Per-session cert warnings keyed by session_id. */
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  /** Unconfirmed shifts for ops banner. */
  unconfirmedShifts?: UnconfirmedShift[];
  /**
   * P4: viewer's role. DnD (drag a card to reschedule / reassign) is
   * gated to admin and ops — coaches and clients see cards but can't
   * move them. Default coach so non-admin viewers fail closed.
   */
  viewerRole?: "admin" | "ops" | "coach" | "client" | "parent";
}

// ============================================================
// Component
// ============================================================

export function RosterPage({
  initialSessions,
  initialWeekStart,
  centres,
  centresWithRegion,
  coaches,
  activeTerm,
  regions = [],
  hasFinancialAccess = false,
  rosterPulse,
  latestRun = null,
  basePath,
  sessionCertWarnings,
  unconfirmedShifts,
  viewerRole = "coach",
}: RosterPageProps) {
  const dndEnabled = viewerRole === "admin" || viewerRole === "ops";
  const router = useRouter();
  const params = useSearchParams();
  const weekStart = new Date(initialWeekStart + "T00:00:00");

  // ============================================================
  // URL-backed state — view + filters
  // ============================================================
  //
  // Default values are NOT serialised so the bare /admin/roster URL
  // stays clean. `replaceParam` collapses the read+write so call sites
  // stay terse. Filters are applied client-side against the already-
  // loaded `initialSessions` — sessions for the week are small (low
  // hundreds at most), so this is cheaper than re-fetching.

  const [view, setViewState] = useState<"staff" | "calendar" | "list">(
    (() => {
      const v = params.get("view");
      if (v === "calendar" || v === "list" || v === "staff") return v;
      return "staff";
    })(),
  );

  const initialStatus = (params.get("status") as StatusFilter | null) ?? "all";
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>(
    STATUS_OPTIONS.some((s) => s.value === initialStatus) ? initialStatus : "all",
  );

  const [centreFilter, setCentreFilterState] = useState<string>(
    params.get("centre") ?? "all",
  );
  const [coachFilter, setCoachFilterState] = useState<string>(
    params.get("coach") ?? "all",
  );
  const [regionFilter, setRegionFilterState] = useState<string>(
    params.get("region") ?? "all",
  );

  // Sports is a multi-select stored as comma-separated codes. We keep
  // it as a Set in client state for O(1) toggles.
  const [sportFilter, setSportFilterState] = useState<Set<Sport>>(() => {
    const raw = params.get("sports");
    if (!raw) return new Set();
    const parts = raw.split(",").filter(Boolean) as Sport[];
    // Drop any sport that isn't a valid SPORTS member so a malformed
    // URL doesn't poison the filter.
    return new Set(parts.filter((p) => (SPORTS as readonly string[]).includes(p)));
  });

  const replaceParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value && value !== "all" && value !== "") {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  function setView(v: "staff" | "calendar" | "list") {
    setViewState(v);
    replaceParam("view", v === "staff" ? null : v);
  }
  function setStatusFilter(v: StatusFilter) {
    setStatusFilterState(v);
    replaceParam("status", v === "all" ? null : v);
  }
  function setCentreFilter(v: string) {
    setCentreFilterState(v);
    replaceParam("centre", v === "all" ? null : v);
  }
  function setCoachFilter(v: string) {
    setCoachFilterState(v);
    replaceParam("coach", v === "all" ? null : v);
  }
  function setRegionFilter(v: string) {
    setRegionFilterState(v);
    replaceParam("region", v === "all" ? null : v);
  }
  function toggleSport(s: Sport) {
    setSportFilterState((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      // Serialise as a stable, sorted comma-list so reloading the
      // URL yields the same canonical form.
      const arr = Array.from(next).sort();
      replaceParam("sports", arr.length > 0 ? arr.join(",") : null);
      return next;
    });
  }
  function clearAllFilters() {
    setStatusFilterState("all");
    setCentreFilterState("all");
    setCoachFilterState("all");
    setRegionFilterState("all");
    setSportFilterState(new Set());
    // Strip all five filter params in one go.
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("status");
    next.delete("centre");
    next.delete("coach");
    next.delete("region");
    next.delete("sports");
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  // ============================================================
  // Derived list — apply filters client-side
  // ============================================================
  //
  // Region matches via a client-side `Map<centre_id, region_id>` so we
  // don't need to extend the per-session shape. When a centre has no
  // region_id, that centre's sessions simply don't match any region
  // filter (conservative — we don't surface "Region: All" results).

  const centreRegionMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of centresWithRegion ?? []) {
      m.set(c.id, c.region_id);
    }
    return m;
  }, [centresWithRegion]);

  const filteredSessions = useMemo(() => {
    let result = initialSessions;
    if (statusFilter !== "all") {
      if (statusFilter === "unassigned") {
        result = result.filter(
          (s) => s.coach_id === null && s.status !== "cancelled",
        );
      } else {
        result = result.filter((s) => s.status === statusFilter);
      }
    }
    if (centreFilter !== "all") {
      result = result.filter((s) => s.centre_id === centreFilter);
    }
    if (coachFilter !== "all") {
      result = result.filter((s) => s.coach_id === coachFilter);
    }
    if (regionFilter !== "all") {
      result = result.filter(
        (s) => centreRegionMap.get(s.centre_id) === regionFilter,
      );
    }
    if (sportFilter.size > 0) {
      result = result.filter((s) => sportFilter.has(s.sport as Sport));
    }
    return result;
  }, [
    initialSessions,
    statusFilter,
    centreFilter,
    coachFilter,
    regionFilter,
    sportFilter,
    centreRegionMap,
  ]);

  const anyFilterActive =
    statusFilter !== "all" ||
    centreFilter !== "all" ||
    coachFilter !== "all" ||
    regionFilter !== "all" ||
    sportFilter.size > 0;

  // ============================================================
  // View / detail / dialog state
  // ============================================================

  const [selectedSession, setSelectedSession] =
    useState<SessionWithRelations | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    date?: string;
    time?: string;
    coachId?: string;
  }>({});

  const [genOpen, setGenOpen] = useState(false);
  const [aiGenOpen, setAiGenOpen] = useState(false);

  // AI review mode state
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [reviewAssignments, setReviewAssignments] = useState<SchedulingAssignment[]>(
    [],
  );
  const [reviewSummary, setReviewSummary] =
    useState<SchedulingRunOutputSummary | null>(null);
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);

  const [swapAssignment, setSwapAssignment] =
    useState<SchedulingAssignment | null>(null);
  const [swapSessionLabel, setSwapSessionLabel] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [clashOpen, setClashOpen] = useState(false);

  // Publish-week confirmation dialog
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishWorking, setPublishWorking] = useState(false);

  // ---- Navigation ----

  const handleRealtimeUpdate = useCallback(() => {
    router.refresh();
  }, [router]);
  useSessionsRealtime(initialWeekStart, handleRealtimeUpdate);

  function navigateToWeek(date: Date) {
    const monday = getMonday(date);
    const dateStr = monday.toISOString().split("T")[0];
    // Preserve filter params on navigation so jumping across weeks
    // doesn't blow away the operator's filter set.
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("week", dateStr);
    router.push(`${basePath}?${next.toString()}`);
  }

  function goToPrevWeek() {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    navigateToWeek(prev);
  }
  function goToNextWeek() {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    navigateToWeek(next);
  }
  function goToToday() {
    navigateToWeek(new Date());
  }

  // ---- Session actions ----

  function handleSessionClick(session: SessionWithRelations) {
    setSelectedSession(session);
    setDetailOpen(true);
  }
  function handleEmptySlotClick(date: string, time: string, coachId?: string) {
    setCreateDefaults({ date, time, coachId });
    setCreateOpen(true);
  }
  function handleAddSession() {
    setCreateDefaults({});
    setCreateOpen(true);
  }
  function handleRefresh() {
    router.refresh();
  }

  // ---- AI scheduling ----

  async function handleAIGenerated(runId: string) {
    setReviewRunId(runId);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 4);
    const weekEndStr = weekEnd.toISOString().split("T")[0];

    const run = await getSchedulingRun(initialWeekStart, weekEndStr);
    if (run) {
      setReviewAssignments(run.assignments_json as SchedulingAssignment[]);
      setReviewSummary(run.output_summary as SchedulingRunOutputSummary);
    }
    router.refresh();
  }

  async function handlePublishRun() {
    if (!reviewRunId) return;
    const result = await publishSchedulingRun(reviewRunId);
    if (!result?.error) {
      setReviewRunId(null);
      setReviewAssignments([]);
      setReviewSummary(null);
      setFilterNeedsAttention(false);
      router.refresh();
    }
  }

  function handleSessionClickWithReview(session: SessionWithRelations) {
    if (reviewRunId) {
      const assignment = reviewAssignments.find(
        (a) => a.session_id === session.id,
      );
      if (assignment) {
        setSwapAssignment(assignment);
        setSwapSessionLabel(`${session.sport} at ${session.centre_name}`);
        setSwapOpen(true);
        return;
      }
    }
    handleSessionClick(session);
  }

  function handleSwapComplete() {
    if (reviewRunId) handleAIGenerated(reviewRunId);
  }

  function getAssignmentForSession(
    sessionId: string,
  ): SchedulingAssignment | undefined {
    return reviewAssignments.find((a) => a.session_id === sessionId);
  }

  // ---- Bulk actions ----

  async function handleBulkPublish(ids: string[]) {
    await bulkUpdateSessionStatus(ids, "published");
    router.refresh();
  }
  async function handleBulkCancel(ids: string[]) {
    await bulkUpdateSessionStatus(ids, "cancelled");
    router.refresh();
  }
  async function handleBulkReassign(ids: string[], coachId: string) {
    await bulkReassignCoach(ids, coachId);
    router.refresh();
  }

  async function handlePublishWeek() {
    setPublishWorking(true);
    try {
      const { published, error } =
        await publishDraftSessionsForWeek(initialWeekStart);
      if (error) {
        toast.error(error);
        return;
      }
      if (published === 0) {
        toast.info("No drafts to publish.");
      } else {
        toast.success(
          `Published ${published} session${published === 1 ? "" : "s"}.`,
        );
      }
      setPublishConfirmOpen(false);
      router.refresh();
    } finally {
      setPublishWorking(false);
    }
  }

  // Friendly relative time for the AI-run pill. Inline so we avoid a
  // new dep on date-fns just for one label.
  function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const seconds = Math.max(0, Math.floor((now - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // ============================================================
  // Render
  // ============================================================

  const draftsCount = rosterPulse?.draftsCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Unconfirmed shifts banner */}
      {unconfirmedShifts && unconfirmedShifts.length > 0 && (
        <UnconfirmedShiftsBanner shifts={unconfirmedShifts} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">Roster</h1>
            {hasFinancialAccess && (
              <WeekCostChip weekStart={initialWeekStart} />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Manage weekly coaching sessions
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`${basePath}/terms`} />}
        >
          View Terms
        </Button>
      </div>

      {/* Pulse strip — always rendered so the operator gets the at-a-
          glance signal even on a clean week. */}
      {rosterPulse && (
        <RosterStatusPulseStrip
          pulse={rosterPulse}
          onJumpToStatus={(s) => setStatusFilter(s)}
        />
      )}

      {/* Toolbar — desktop layout has all primary controls visible;
          below md the tertiary actions collapse into a "More" menu. */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="min-h-[44px] min-w-[44px]"
            onClick={goToPrevWeek}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="hidden min-w-[180px] text-center text-sm font-medium text-foreground sm:inline-block">
            {formatWeekLabel(weekStart)}
          </span>

          <Button
            variant="outline"
            size="icon-sm"
            className="min-h-[44px] min-w-[44px]"
            onClick={goToNextWeek}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>

        {/* Month calendar picker — replaces the native date input. */}
        <MonthCalendarPopover
          weekStart={initialWeekStart}
          onSelect={navigateToWeek}
        />

        <div className="ml-auto" />

        {/* View toggle — single rounded-2xl group container. */}
        <div className="flex rounded-2xl border">
          <Button
            variant={view === "staff" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px] rounded-2xl"
            onClick={() => setView("staff")}
            title="Staff view"
            aria-label="Staff view"
          >
            <Users className="size-4" />
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px] rounded-2xl"
            onClick={() => setView("calendar")}
            title="Calendar view"
            aria-label="Calendar view"
          >
            <CalendarDays className="size-4" />
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px] rounded-2xl"
            onClick={() => setView("list")}
            title="List view"
            aria-label="List view"
          >
            <List className="size-4" />
          </Button>
        </div>

        {/* Desktop-only tertiary actions */}
        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClashOpen(true)}
          >
            <AlertTriangle className="size-4" />
            Check Clashes
          </Button>

          <Button variant="outline" size="sm" onClick={handleAddSession}>
            <Plus className="size-4" />
            Add Session
          </Button>

          {activeTerm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGenOpen(true)}
            >
              <Zap className="size-4" />
              Generate Week
            </Button>
          )}
        </div>

        {/* Publish week — both desktop and mobile (high-value CTA). */}
        {draftsCount > 0 && (
          <Button
            size="sm"
            onClick={() => setPublishConfirmOpen(true)}
            className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
          >
            <Send className="size-4" />
            Publish week ({draftsCount})
          </Button>
        )}

        {/* Last AI run pill + AI Assign — grouped so the pill always
            sits adjacent to the action that produced it. */}
        {activeTerm && (
          <div className="flex items-center gap-2">
            {latestRun && (
              <LastRunPill latestRun={latestRun} relativeTime={relativeTime} />
            )}
            <Button size="sm" onClick={() => setAiGenOpen(true)}>
              <Sparkles className="size-4" />
              AI Assign
            </Button>
          </div>
        )}

        {/* Mobile-only "More" dropdown — collapses the tertiary
            actions. AI Assign deliberately stays visible (marquee). */}
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="min-h-[44px] min-w-[44px]"
                  aria-label="More actions"
                />
              }
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setClashOpen(true)}>
                <AlertTriangle className="mr-2 size-4" />
                Check clashes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddSession}>
                <Plus className="mr-2 size-4" />
                Add session
              </DropdownMenuItem>
              {activeTerm && (
                <DropdownMenuItem onClick={() => setGenOpen(true)}>
                  <Zap className="mr-2 size-4" />
                  Generate week
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filter chip row — separate row under the toolbar for breathing room */}
      <div className="flex flex-wrap items-center gap-2">
        <SportFilterChip
          selected={sportFilter}
          onToggle={toggleSport}
          onClear={() => {
            setSportFilterState(new Set());
            replaceParam("sports", null);
          }}
        />
        <FilterSelectChip
          label="Centre"
          value={centreFilter}
          onChange={setCentreFilter}
          options={[
            { value: "all", label: "All centres" },
            ...centres.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <FilterSelectChip
          label="Coach"
          value={coachFilter}
          onChange={setCoachFilter}
          options={[
            { value: "all", label: "All coaches" },
            ...coaches.map((c) => ({ value: c.id, label: c.name ?? "Unknown" })),
          ]}
        />
        <FilterSelectChip
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={STATUS_OPTIONS.map((s) => ({
            value: s.value,
            label: s.label,
          }))}
        />
        {regions.length > 0 && (
          <FilterSelectChip
            label="Region"
            value={regionFilter}
            onChange={setRegionFilter}
            options={[
              { value: "all", label: "All regions" },
              ...regions.map((r) => ({ value: r.id, label: r.name })),
            ]}
          />
        )}
        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
          >
            <X className="size-3" />
            Clear all
          </button>
        )}
      </div>

      {/* AI Review Summary Bar */}
      {reviewRunId && reviewSummary && (
        <AISummaryBar
          summary={reviewSummary}
          onPublish={handlePublishRun}
          onFilterNeedsAttention={setFilterNeedsAttention}
          filterActive={filterNeedsAttention}
        />
      )}

      {/* Content */}
      {filteredSessions.length === 0 && view !== "staff" ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center">
          <CalendarDays className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            {anyFilterActive
              ? "No sessions match these filters"
              : "No sessions scheduled this week"}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {anyFilterActive
              ? "Try clearing a filter to see more"
              : "Add a session or generate from a term template"}
          </p>
        </div>
      ) : view === "staff" ? (
        <StaffRosterView
          sessions={filteredSessions}
          weekStart={weekStart}
          coaches={coaches}
          onSessionClick={handleSessionClickWithReview}
          onEmptySlotClick={handleEmptySlotClick}
          onSessionChange={handleRefresh}
          sessionCertWarnings={sessionCertWarnings}
          dndEnabled={dndEnabled}
          renderConfidenceBadge={
            reviewRunId
              ? (sessionId) => {
                  const a = getAssignmentForSession(sessionId);
                  if (!a) return undefined;
                  return (
                    <ConfidenceBadge
                      confidence={a.confidence}
                      reasoning={a.reasoning}
                    />
                  );
                }
              : undefined
          }
        />
      ) : view === "calendar" ? (
        <SessionCalendarView
          sessions={filteredSessions}
          weekStart={weekStart}
          onSessionClick={handleSessionClickWithReview}
          onEmptySlotClick={handleEmptySlotClick}
          sessionCertWarnings={sessionCertWarnings}
          dndEnabled={dndEnabled}
          renderConfidenceBadge={
            reviewRunId
              ? (sessionId) => {
                  const a = getAssignmentForSession(sessionId);
                  if (!a) return undefined;
                  return (
                    <ConfidenceBadge
                      confidence={a.confidence}
                      reasoning={a.reasoning}
                    />
                  );
                }
              : undefined
          }
          coaches={coaches}
          onSessionChange={handleRefresh}
        />
      ) : (
        <SessionListView
          sessions={filteredSessions}
          centres={centres}
          coaches={coaches}
          onSessionClick={handleSessionClickWithReview}
          onBulkPublish={handleBulkPublish}
          onBulkCancel={handleBulkCancel}
          onBulkReassign={handleBulkReassign}
        />
      )}

      {/* Summary */}
      <p className="text-center text-xs text-muted-foreground">
        {filteredSessions.length} of {initialSessions.length} session
        {initialSessions.length !== 1 ? "s" : ""}
        {anyFilterActive ? " match filters" : " this week"}
      </p>

      {/* Detail Sheet */}
      <SessionDetailSheet
        session={selectedSession}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        centres={centres}
        coaches={coaches}
        onUpdate={handleRefresh}
        sessionCertWarnings={sessionCertWarnings}
        financialAccess={hasFinancialAccess}
      />

      {/* Create Session Dialog */}
      <CreateSessionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        termId={activeTerm?.id ?? ""}
        centres={centres}
        coaches={coaches}
        defaultDate={createDefaults.date}
        defaultTime={createDefaults.time}
        defaultCoachId={createDefaults.coachId}
        onSuccess={handleRefresh}
      />

      {/* Generate Sessions Dialog */}
      {activeTerm && (
        <GenerateSessionsDialog
          open={genOpen}
          onOpenChange={setGenOpen}
          term={activeTerm}
          templateCount={0}
          onSuccess={handleRefresh}
        />
      )}

      {/* AI Generate Dialog */}
      {activeTerm && (
        <AIGenerateDialog
          open={aiGenOpen}
          onOpenChange={setAiGenOpen}
          termId={activeTerm.id}
          onGenerated={handleAIGenerated}
        />
      )}

      {/* Coach Swap Panel */}
      {reviewRunId && swapAssignment && (
        <CoachSwapPanel
          open={swapOpen}
          onOpenChange={setSwapOpen}
          runId={reviewRunId}
          assignment={swapAssignment}
          sessionLabel={swapSessionLabel}
          onSwapped={handleSwapComplete}
        />
      )}

      {/* Clash Detection Dialog */}
      <ClashDetectionDialog
        open={clashOpen}
        onOpenChange={setClashOpen}
        weekStartDate={initialWeekStart}
      />

      {/* Publish-week confirmation */}
      <AlertDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {draftsCount} draft session{draftsCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each session will move from &ldquo;Draft&rdquo; to
              &ldquo;Published&rdquo; for the week of{" "}
              {formatWeekLabel(weekStart)} and become visible to assigned
              coaches. You can still send individual sessions for
              confirmation afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishWorking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handlePublishWeek();
              }}
              disabled={publishWorking}
              className="bg-[#E8712A] text-white hover:bg-[#E8712A]/90"
            >
              {publishWorking ? "Publishing…" : "Publish drafts"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Sub-components: filter chips + AI-run pill
// ============================================================

function FilterSelectChip({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const active = value !== "all";
  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? label;

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next ?? "all")}
    >
      <SelectTrigger
        className={[
          "h-8 w-auto rounded-full border px-3 text-xs",
          active
            ? "border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A] ring-1 ring-[#E8712A]/30"
            : "border-border bg-background text-muted-foreground",
        ].join(" ")}
      >
        <SelectValue placeholder={label}>
          <span className="font-medium">
            {active ? `${label}: ${selectedLabel}` : label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SportFilterChip({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<Sport>;
  onToggle: (s: Sport) => void;
  onClear: () => void;
}) {
  const active = selected.size > 0;
  const label =
    selected.size === 0
      ? "Sport"
      : selected.size === 1
        ? `Sport: ${Array.from(selected)[0]}`
        : `Sport: ${selected.size} selected`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={[
              "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition",
              active
                ? "border-[#E8712A]/40 bg-[#E8712A]/10 text-[#E8712A] ring-1 ring-[#E8712A]/30"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            ].join(" ")}
            aria-label={`Sport filter — ${active ? `${selected.size} selected` : "none"}`}
          />
        }
      >
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[240px] max-h-[280px] overflow-y-auto p-2"
      >
        <div className="flex items-center justify-between px-1 pb-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Filter by sport
          </p>
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {SPORTS.map((s) => {
            const isOn = selected.has(s);
            return (
              <li key={s}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={() => onToggle(s)}
                    aria-label={`Toggle ${s}`}
                  />
                  <span className={isOn ? "font-medium text-foreground" : "text-foreground"}>
                    {s}
                  </span>
                  {isOn && (
                    <Check className="ml-auto size-3 text-[#E8712A]" />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function LastRunPill({
  latestRun,
  relativeTime,
}: {
  latestRun: LatestSchedulingRun;
  relativeTime: (iso: string) => string;
}) {
  const published = latestRun.publishedAt !== null;
  const label = published
    ? `Last AI run: ${relativeTime(latestRun.publishedAt!)}`
    : `Draft run: ${relativeTime(latestRun.createdAt)}`;
  return (
    <span
      title={`Run ID: ${latestRun.runId}`}
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]",
        published
          ? "border-border bg-muted/40 text-muted-foreground"
          : "border-amber-200 bg-amber-50 text-amber-700",
      ].join(" ")}
    >
      <Clock className="size-3" />
      <span className="font-medium">{label}</span>
    </span>
  );
}
