"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";
import {
  SLOT_TIMES,
  formatTime12,
  timeToRow,
  durationToSpan,
  dateToDay,
  getWeekDates,
  formatDayHeader,
} from "@/lib/utils/roster";
import { SessionCard } from "./session-card";
import type { SessionCertWarning } from "@/lib/utils/compliance/cert-warnings";
import { dragMoveSession } from "@/lib/sessions/dnd-actions";

// ============================================================
// Props
// ============================================================

interface SessionCalendarViewProps {
  sessions: SessionWithRelations[];
  weekStart: Date;
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string) => void;
  /** Per-session cert warnings keyed by session_id */
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  /** Optional renderer for confidence badge overlay on each session card */
  renderConfidenceBadge?: (sessionId: string) => ReactNode | undefined;
  /** Coach list — forwarded to SessionCardMenu */
  coaches?: Pick<Profile, "id" | "name">[];
  /** Called after any card-menu action mutates a session */
  onSessionChange?: () => void;
  /**
   * P4: when true, the whole grid becomes a DnD surface. Cards are
   * draggable, cells are droppable, the drop triggers
   * `dragMoveSession`. Default false so non-admin viewers (coach,
   * client) keep a read-only render.
   */
  dndEnabled?: boolean;
  /** P4: dimension the card border colour encodes (sport | centre). */
  colourBy?: "sport" | "centre";
}

// ============================================================
// Component
// ============================================================

export function SessionCalendarView({
  sessions,
  weekStart,
  onSessionClick,
  onEmptySlotClick,
  sessionCertWarnings,
  renderConfidenceBadge,
  colourBy = "sport",
  coaches,
  onSessionChange,
  dndEnabled = false,
}: SessionCalendarViewProps) {
  const weekDates = getWeekDates(weekStart);

  // Local sessions list — needed so DnD can apply the drop
  // optimistically before the server round-trip lands. When
  // `sessions` (the parent's source-of-truth) changes after refresh,
  // we resync.
  const [localSessions, setLocalSessions] =
    useState<SessionWithRelations[]>(sessions);
  useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  // Conflict highlight — set of session_ids that landed on a
  // conflicting (date, time, coach). Each id auto-clears after 8s.
  const [conflictedIds, setConflictedIds] = useState<Set<string>>(new Set());

  // Active drag overlay payload.
  const [activeSession, setActiveSession] =
    useState<SessionWithRelations | null>(null);

  // P4 sensors — pointer + touch (250ms long-press, 5px tolerance)
  // disambiguates from vertical scroll on mobile.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  // Honour prefers-reduced-motion — when matched, we skip the lift /
  // settle transition on the active overlay.
  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Group sessions by date+time slot for detecting occupied cells
  const sessionsByDateAndSlot = new Map<string, SessionWithRelations[]>();
  for (const s of localSessions) {
    const timeKey = s.time.slice(0, 5);
    const key = `${s.date}_${timeKey}`;
    const arr = sessionsByDateAndSlot.get(key) ?? [];
    arr.push(s);
    sessionsByDateAndSlot.set(key, arr);
  }

  // ---- DnD handlers ----

  function handleDragStart(event: DragStartEvent) {
    const s = localSessions.find((x) => x.id === event.active.id);
    if (s) setActiveSession(s);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveSession(null);
    const { active, over } = event;
    if (!over) return;

    const sessionId = active.id as string;
    const overId = over.id as string;
    // Drop target id is `cell_${dateStr}_${slot}` — parse it.
    if (!overId.startsWith("cell_")) return;
    const parts = overId.split("_");
    const newDate = parts[1];
    const newTime = parts[2];
    if (!newDate || !newTime) return;

    const source = localSessions.find((s) => s.id === sessionId);
    if (!source) return;

    // Already on the same cell — nothing to do.
    if (source.date === newDate && source.time.slice(0, 5) === newTime) {
      return;
    }

    // Snapshot for rollback.
    const snapshot = localSessions;
    const expectedUpdatedAt = source.updated_at ?? "";

    // Optimistic update — patch the local copy so the card moves
    // straight away.
    setLocalSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, date: newDate, time: `${newTime}:00` } : s,
      ),
    );

    const result = await dragMoveSession({
      sessionId,
      newDate,
      newTime,
      expectedUpdatedAt,
    });

    if (!result.ok) {
      // Roll back and surface the error.
      setLocalSessions(snapshot);
      toast.error(result.error ?? "Could not move session.");
      return;
    }

    if (result.conflict) {
      // Decision D: drop allowed, mark the card red for 8s so ops
      // can see it landed in a conflicting slot.
      setConflictedIds((prev) => {
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
      toast.info("Session landed on a conflicting slot — review and resolve.");
      setTimeout(() => {
        setConflictedIds((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
      }, 8_000);
    } else {
      toast.success("Session moved.");
    }

    // Let the parent refetch so the rest of the row state (notifications,
    // session_coaches join) catches up.
    onSessionChange?.();
  }

  // ============================================================
  // Render
  // ============================================================

  const grid = (
    <div className="overflow-x-auto rounded-2xl border bg-card transition hover:shadow-md">
      <div
        className="grid min-w-[700px]"
        style={{
          gridTemplateColumns: "80px repeat(5, 1fr)",
          gridTemplateRows: `auto repeat(${SLOT_TIMES.length}, 40px)`,
        }}
      >
        {/* Header row */}
        <div className="sticky top-0 z-10 border-b bg-muted/50 p-2" />
        {weekDates.map((dateStr) => (
          <div
            key={dateStr}
            className="sticky top-0 z-10 border-b border-l bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground"
          >
            {formatDayHeader(dateStr)}
          </div>
        ))}

        {/* Time rows */}
        {SLOT_TIMES.map((slot, rowIdx) => {
          const isHour = slot.endsWith(":00");
          return (
            <Fragment key={slot}>
              {/* Time label cell */}
              <div
                className={`flex items-start justify-end border-b px-2 pt-0.5 text-[11px] text-muted-foreground ${
                  isHour ? "font-medium" : ""
                }`}
                style={{ gridRow: rowIdx + 2 }}
              >
                {isHour ? formatTime12(slot) : ""}
              </div>

              {/* Day columns */}
              {weekDates.map((dateStr, dayIdx) => {
                const key = `${dateStr}_${slot}`;
                const cellSessions = sessionsByDateAndSlot.get(key);

                return (
                  <DroppableCell
                    key={`cell-${dateStr}-${slot}`}
                    cellId={`cell_${dateStr}_${slot}`}
                    isHour={isHour}
                    dayIdx={dayIdx}
                    rowIdx={rowIdx}
                    hasSessions={!!cellSessions}
                    onClickEmpty={() => onEmptySlotClick(dateStr, slot)}
                    title={`Add session – ${formatDayHeader(dateStr)} ${formatTime12(slot)}`}
                    dndEnabled={dndEnabled}
                  />
                );
              })}
            </Fragment>
          );
        })}

        {/* Positioned session cards (absolute within the grid) */}
        {localSessions.map((s) => {
          const timeKey = s.time.slice(0, 5);
          const row = timeToRow(timeKey);
          const span = durationToSpan(s.duration_minutes);
          const dayNum = dateToDay(s.date);
          if (dayNum === 0) return null; // Skip weekends
          const col = dayNum + 1; // +1 for time column offset

          const isConflicted = conflictedIds.has(s.id);

          return (
            <div
              key={s.id}
              className="z-[5] p-0.5"
              style={{
                gridRow: `${row} / span ${span}`,
                gridColumn: col,
              }}
            >
              <DraggableCard
                sessionId={s.id}
                dndEnabled={dndEnabled}
                isConflicted={isConflicted}
                isActive={activeSession?.id === s.id}
              >
                <SessionCard
                  session={s}
                  colourBy={colourBy}
                  onClick={() => onSessionClick(s)}
                  certWarning={sessionCertWarnings?.[s.id]}
                  confidenceBadge={renderConfidenceBadge?.(s.id)}
                  coaches={coaches}
                  onChange={onSessionChange}
                  otherCount={
                    s.assigned_coaches && s.assigned_coaches.length > 1
                      ? s.assigned_coaches.length - 1
                      : 0
                  }
                />
                {isConflicted && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-1 left-1 z-30 rounded bg-red-500 px-1 py-0.5 text-[9px] font-semibold text-white shadow-sm"
                    title="Drop landed on a conflicting slot — review and resolve"
                  >
                    Has conflict — review
                  </span>
                )}
              </DraggableCard>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!dndEnabled) return grid;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {grid}
      <DragOverlay
        dropAnimation={reducedMotion ? null : undefined}
      >
        {activeSession ? (
          <div className="w-[180px] opacity-90">
            <SessionCard
              session={activeSession}
              colourBy={colourBy}
              onClick={() => {}}
              certWarning={sessionCertWarnings?.[activeSession.id]}
              confidenceBadge={renderConfidenceBadge?.(activeSession.id)}
              coaches={coaches}
              onChange={onSessionChange}
              otherCount={
                activeSession.assigned_coaches &&
                activeSession.assigned_coaches.length > 1
                  ? activeSession.assigned_coaches.length - 1
                  : 0
              }
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ============================================================
// DroppableCell — wraps the empty-slot button when DnD is enabled
// ============================================================

function DroppableCell({
  cellId,
  isHour,
  dayIdx,
  rowIdx,
  hasSessions,
  onClickEmpty,
  title,
  dndEnabled,
}: {
  cellId: string;
  isHour: boolean;
  dayIdx: number;
  rowIdx: number;
  hasSessions: boolean;
  onClickEmpty: () => void;
  title: string;
  dndEnabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId,
    disabled: !dndEnabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`relative border-b border-l ${
        isHour ? "border-b-border" : "border-b-border/40"
      } ${isOver ? "bg-primary/10 outline-2 outline-dashed outline-primary/50 outline-offset-[-2px]" : ""}`}
      style={{ gridRow: rowIdx + 2, gridColumn: dayIdx + 2 }}
    >
      {/* Clickable empty area */}
      {!hasSessions && (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer hover:bg-muted/30"
          onClick={onClickEmpty}
          title={title}
        />
      )}
    </div>
  );
}

// ============================================================
// DraggableCard — wraps a session card with useDraggable
// ============================================================

function DraggableCard({
  sessionId,
  dndEnabled,
  isConflicted,
  isActive,
  children,
}: {
  sessionId: string;
  dndEnabled: boolean;
  isConflicted: boolean;
  isActive: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: sessionId,
    disabled: !dndEnabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...(dndEnabled ? attributes : {})}
      {...(dndEnabled ? listeners : {})}
      className={`relative h-full ${
        isConflicted ? "rounded-2xl ring-2 ring-red-500" : ""
      } ${isActive ? "opacity-40" : ""} ${
        dndEnabled ? "touch-none cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {children}
    </div>
  );
}
