"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useSessionsRealtime } from "@/lib/hooks/useSessionsRealtime";
import {
  getMonday,
  formatWeekLabel,
} from "@/lib/utils/roster";
import {
  bulkUpdateSessionStatus,
  bulkReassignCoach,
} from "@/lib/sessions/actions";
import { getSchedulingRun, publishSchedulingRun } from "@/lib/scheduling/actions";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Centre, Profile, Term, SchedulingAssignment, SchedulingRunOutputSummary } from "@/lib/types/database";
import type { SessionCertWarning } from "@/lib/utils/compliance/cert-warnings";
import type { UnconfirmedShift } from "@/lib/sessions/shift-actions";
import { UnconfirmedShiftsBanner } from "./unconfirmed-shifts-banner";
import { WeekCostChip } from "./week-cost-chip";

// ============================================================
// Props
// ============================================================

interface RosterPageProps {
  initialSessions: SessionWithRelations[];
  initialWeekStart: string; // "YYYY-MM-DD" Monday
  centres: Pick<Centre, "id" | "name">[];
  coaches: Pick<Profile, "id" | "name">[];
  activeTerm: Term | null;
  basePath: string; // "/admin/roster" or "/ops/roster"
  /** Per-session cert warnings keyed by session_id (preferred). */
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  /** Unconfirmed shifts for ops banner */
  unconfirmedShifts?: UnconfirmedShift[];
}

// ============================================================
// Component
// ============================================================

export function RosterPage({
  initialSessions,
  initialWeekStart,
  centres,
  coaches,
  activeTerm,
  basePath,
  sessionCertWarnings,
  unconfirmedShifts,
}: RosterPageProps) {
  const router = useRouter();
  const weekStart = new Date(initialWeekStart + "T00:00:00");

  // View toggle — default to staff view (Connecteam-style)
  const [view, setView] = useState<"staff" | "calendar" | "list">("staff");

  // Session detail sheet
  const [selectedSession, setSelectedSession] =
    useState<SessionWithRelations | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Create session dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaults, setCreateDefaults] = useState<{
    date?: string;
    time?: string;
    coachId?: string;
  }>({});

  // Generate sessions dialog
  const [genOpen, setGenOpen] = useState(false);

  // AI generate dialog
  const [aiGenOpen, setAiGenOpen] = useState(false);

  // AI review mode state
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [reviewAssignments, setReviewAssignments] = useState<SchedulingAssignment[]>([]);
  const [reviewSummary, setReviewSummary] = useState<SchedulingRunOutputSummary | null>(null);
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);

  // Coach swap panel
  const [swapAssignment, setSwapAssignment] = useState<SchedulingAssignment | null>(null);
  const [swapSessionLabel, setSwapSessionLabel] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);

  // Clash detection dialog
  const [clashOpen, setClashOpen] = useState(false);

  // Realtime subscription
  const handleRealtimeUpdate = useCallback(() => {
    router.refresh();
  }, [router]);

  useSessionsRealtime(initialWeekStart, handleRealtimeUpdate);

  // ---- Navigation ----

  function navigateToWeek(date: Date) {
    const monday = getMonday(date);
    const dateStr = monday.toISOString().split("T")[0];
    router.push(`${basePath}?week=${dateStr}`);
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

  function handleDatePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) {
      navigateToWeek(new Date(e.target.value + "T00:00:00"));
    }
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
    // Fetch the run to get assignments and summary
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
        (a) => a.session_id === session.id
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
    // Re-fetch run data after swap
    if (reviewRunId) {
      handleAIGenerated(reviewRunId);
    }
  }

  function getAssignmentForSession(sessionId: string): SchedulingAssignment | undefined {
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

  return (
    <div className="space-y-4">
      {/* Unconfirmed shifts banner */}
      {unconfirmedShifts && unconfirmedShifts.length > 0 && (
        <UnconfirmedShiftsBanner shifts={unconfirmedShifts} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">Roster</h1>
            <WeekCostChip weekStart={initialWeekStart} />
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Week navigation */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" className="min-h-[44px] min-w-[44px]" onClick={goToPrevWeek} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>

          <span className="min-w-[180px] text-center text-sm font-medium text-foreground">
            {formatWeekLabel(weekStart)}
          </span>

          <Button variant="outline" size="icon-sm" className="min-h-[44px] min-w-[44px]" onClick={goToNextWeek} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>

        <Input
          type="date"
          className="w-[150px]"
          value={initialWeekStart}
          onChange={handleDatePickerChange}
          aria-label="Select date"
        />

        <div className="ml-auto" />

        {/* View toggle */}
        <div className="flex rounded-lg border">
          <Button
            variant={view === "staff" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px]"
            onClick={() => setView("staff")}
            title="Staff view"
            aria-label="Staff view"
          >
            <Users className="size-4" />
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px]"
            onClick={() => setView("calendar")}
            title="Calendar view"
            aria-label="Calendar view"
          >
            <CalendarDays className="size-4" />
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="icon-sm"
            className="min-h-[44px] min-w-[44px]"
            onClick={() => setView("list")}
            title="List view"
            aria-label="List view"
          >
            <List className="size-4" />
          </Button>
        </div>

        {/* Check for Clashes */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setClashOpen(true)}
        >
          <AlertTriangle className="size-4" />
          Check Clashes
        </Button>

        {/* Actions */}
        <Button variant="outline" size="sm" onClick={handleAddSession}>
          <Plus className="size-4" />
          Add Session
        </Button>

        {activeTerm && (
          <Button variant="outline" size="sm" onClick={() => setGenOpen(true)}>
            <Zap className="size-4" />
            Generate Week
          </Button>
        )}

        {activeTerm && (
          <Button size="sm" onClick={() => setAiGenOpen(true)}>
            <Sparkles className="size-4" />
            AI Assign
          </Button>
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
      {initialSessions.length === 0 && view !== "staff" ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <CalendarDays className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No sessions scheduled this week
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Add a session or generate from a term template
          </p>
        </div>
      ) : view === "staff" ? (
        <StaffRosterView
          sessions={initialSessions}
          weekStart={weekStart}
          coaches={coaches}
          onSessionClick={handleSessionClickWithReview}
          onEmptySlotClick={handleEmptySlotClick}
          sessionCertWarnings={sessionCertWarnings}
          renderConfidenceBadge={reviewRunId ? (sessionId) => {
            const a = getAssignmentForSession(sessionId);
            if (!a) return undefined;
            return <ConfidenceBadge confidence={a.confidence} reasoning={a.reasoning} />;
          } : undefined}
        />
      ) : view === "calendar" ? (
        <SessionCalendarView
          sessions={initialSessions}
          weekStart={weekStart}
          onSessionClick={handleSessionClickWithReview}
          onEmptySlotClick={handleEmptySlotClick}
          sessionCertWarnings={sessionCertWarnings}
          renderConfidenceBadge={reviewRunId ? (sessionId) => {
            const a = getAssignmentForSession(sessionId);
            if (!a) return undefined;
            return <ConfidenceBadge confidence={a.confidence} reasoning={a.reasoning} />;
          } : undefined}
          coaches={coaches}
          onSessionChange={handleRefresh}
        />
      ) : (
        <SessionListView
          sessions={initialSessions}
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
        {initialSessions.length} session
        {initialSessions.length !== 1 ? "s" : ""} this week
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
    </div>
  );
}
