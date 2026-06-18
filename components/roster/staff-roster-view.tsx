"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { Plus, User, ShieldAlert, ShieldOff, StickyNote } from "lucide-react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";
import {
  describeSessionCertWarning,
  type SessionCertWarning,
} from "@/lib/utils/compliance/cert-warnings";
import { getWeekDates, formatDayHeader, formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import { STATUS_DOT_COLOURS } from "./session-status-badge";
import { SessionCardMenu } from "./session-card-menu";
import { dragMoveSession } from "@/lib/sessions/dnd-actions";

// ============================================================
// Props
// ============================================================

interface StaffRosterViewProps {
  sessions: SessionWithRelations[];
  weekStart: Date;
  coaches: Pick<Profile, "id" | "name">[];
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string, coachId?: string) => void;
  onSessionChange: () => void;
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  renderConfidenceBadge?: (sessionId: string) => ReactNode | undefined;
  /**
   * P4: when true, cards are draggable, day cells are droppable.
   * Drops to a different coach row reassign the primary; drops to a
   * different day change the date. See `dragMoveSession`.
   */
  dndEnabled?: boolean;
}

// ============================================================
// Helpers
// ============================================================

interface StaffViewSessionEntry {
  coachId: string;
  session: SessionWithRelations;
  isPrimary: boolean;
  /** Total assigned − 1 for the primary; 0 for secondaries. */
  otherCount: number;
}

/**
 * Flatten sessions × assigned_coaches into per-(coach, session) rows
 * for the staff view. Every assigned coach gets a card in their own
 * row; the primary's card carries "+N others", secondaries carry
 * "↔ shared".
 */
function flattenForStaffView(
  sessions: SessionWithRelations[]
): StaffViewSessionEntry[] {
  const out: StaffViewSessionEntry[] = [];
  for (const s of sessions) {
    if (s.assigned_coaches && s.assigned_coaches.length > 0) {
      const total = s.assigned_coaches.length;
      for (const c of s.assigned_coaches) {
        out.push({
          coachId: c.user_id,
          session: s,
          isPrimary: c.is_primary,
          otherCount: c.is_primary ? Math.max(0, total - 1) : 0,
        });
      }
    } else if (s.coach_id) {
      // Legacy fallback for any read site that hasn't loaded
      // assigned_coaches yet — treat the primary cache as a single
      // entry.
      out.push({
        coachId: s.coach_id,
        session: s,
        isPrimary: true,
        otherCount: 0,
      });
    } else {
      // Unassigned session — bucket under the synthetic key so the
      // unassigned row still renders.
      out.push({
        coachId: "__unassigned__",
        session: s,
        isPrimary: true,
        otherCount: 0,
      });
    }
  }
  return out;
}

/** Group flattened entries by coachId → date → entries[] */
function groupEntriesByCoachAndDate(
  entries: StaffViewSessionEntry[]
): Map<string, Map<string, StaffViewSessionEntry[]>> {
  const map = new Map<string, Map<string, StaffViewSessionEntry[]>>();

  for (const e of entries) {
    if (!map.has(e.coachId)) {
      map.set(e.coachId, new Map());
    }
    const dateMap = map.get(e.coachId)!;
    if (!dateMap.has(e.session.date)) {
      dateMap.set(e.session.date, []);
    }
    dateMap.get(e.session.date)!.push(e);
  }

  // Sort entries within each cell by session time
  for (const dateMap of map.values()) {
    for (const arr of dateMap.values()) {
      arr.sort((a, b) => a.session.time.localeCompare(b.session.time));
    }
  }

  return map;
}

/** Get initials from a name */
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ============================================================
// Sub-components
// ============================================================

function StaffSessionCard({
  session,
  onClick,
  confidenceBadge,
  certWarning,
  coaches,
  onSessionChange,
  otherCount,
  asSecondary,
  isConflicted,
  isActive,
  draggableProps,
}: {
  session: SessionWithRelations;
  onClick: () => void;
  confidenceBadge?: ReactNode;
  certWarning?: SessionCertWarning;
  coaches: Pick<Profile, "id" | "name">[];
  onSessionChange: () => void;
  /** When > 0, render an orange "+N others" badge on the primary card. */
  otherCount?: number;
  /** When true, render this as the secondary view (↔ shared, thinner left border). */
  asSecondary?: boolean;
  /** Apply red ring + "Has conflict" badge for 8s after a conflicting drop. */
  isConflicted?: boolean;
  /** Hide the card under the drag overlay clone. */
  isActive?: boolean;
  /** Props from useDraggable when DnD is enabled. */
  draggableProps?: {
    setNodeRef: (node: HTMLElement | null) => void;
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown> | undefined;
  };
}) {
  const colour = sportColour(session.sport);
  const dotColour = STATUS_DOT_COLOURS[session.status];
  const timeStr = formatTime12(session.time.slice(0, 5));
  const endTime = (() => {
    const [h, m] = session.time.slice(0, 5).split(":").map(Number);
    const totalMin = h * 60 + m + session.duration_minutes;
    const endH = Math.floor(totalMin / 60);
    const endM = totalMin % 60;
    return formatTime12(
      `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`
    );
  })();

  return (
    <div
      ref={draggableProps?.setNodeRef}
      {...(draggableProps?.attributes ?? {})}
      {...(draggableProps?.listeners ?? {})}
      className={`relative w-full group ${draggableProps ? "touch-none" : ""} ${
        isActive ? "opacity-40" : ""
      } ${isConflicted ? "rounded-2xl ring-2 ring-red-500" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-2xl border bg-card px-2 py-1.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          asSecondary ? "border-l border-l-muted-foreground/40" : ""
        }`}
        style={
          asSecondary
            ? undefined
            : { borderLeftWidth: 3, borderLeftColor: colour }
        }
        aria-label={`${session.sport} at ${session.centre_name}, ${timeStr} – ${endTime}${asSecondary ? ", shared shift" : ""}`}
      >
        {/* Status dot */}
        <span
          className="absolute right-1.5 top-1.5 size-1.5 rounded-full"
          style={{ backgroundColor: dotColour }}
          title={session.status}
        />

        {/* AI confidence badge */}
        {confidenceBadge && (
          <span className="absolute right-5 top-1">{confidenceBadge}</span>
        )}

        <span className="block truncate text-[11px] font-semibold text-foreground">
          {timeStr} – {endTime}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {session.centre_name}
        </span>
        <span
          className="block truncate text-[10px] font-medium"
          style={{ color: colour }}
        >
          {session.sport}
        </span>

        {/* Per-session cert warning */}
        {certWarning && certWarning.blocked.length > 0 ? (
          <span
            className="absolute bottom-0.5 right-1 flex items-center gap-0.5 rounded bg-red-100 px-1 py-0.5"
            title={describeSessionCertWarning(certWarning)}
          >
            <ShieldOff className="size-2.5 text-red-600" />
            <span className="text-[9px] font-medium text-red-600">!</span>
          </span>
        ) : certWarning && certWarning.expiring.length > 0 ? (
          <span
            className="absolute bottom-0.5 right-1 flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5"
            title={describeSessionCertWarning(certWarning)}
          >
            <ShieldAlert className="size-2.5 text-amber-600" />
            <span className="text-[9px] font-medium text-amber-600">
              {certWarning.expiring[0].daysUntilExpiry}d
            </span>
          </span>
        ) : null}
      </button>

      <SessionCardMenu
        session={session}
        coaches={coaches}
        onChange={onSessionChange}
      />

      {otherCount && otherCount > 0 ? (
        <span
          className="pointer-events-none absolute right-1 top-1 z-10 rounded bg-orange-500 px-1 text-[9px] font-medium text-white"
          title={`Plus ${otherCount} other coach${otherCount === 1 ? "" : "es"}`}
        >
          +{otherCount}
        </span>
      ) : null}
      {asSecondary ? (
        <span
          className="pointer-events-none absolute right-1 top-1 z-10 rounded border bg-background px-1 text-[9px] text-muted-foreground"
          title="Shared shift — primary is on another coach's row"
        >
          ↔ shared
        </span>
      ) : null}

      {session.notes && (
        <span
          className="pointer-events-none absolute bottom-1 left-1 z-10 flex h-4 w-4 items-center justify-center rounded bg-secondary text-secondary-foreground"
          title={session.notes}
          aria-label="Has note"
        >
          <StickyNote className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
      )}

      {isConflicted && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-1 left-1 z-30 rounded bg-red-500 px-1 py-0.5 text-[9px] font-semibold text-white shadow-sm"
          title="Drop landed on a conflicting slot — review and resolve"
        >
          Has conflict — review
        </span>
      )}
    </div>
  );
}

function DraggableStaffCard(props: {
  entry: StaffViewSessionEntry;
  coaches: Pick<Profile, "id" | "name">[];
  onSessionChange: () => void;
  onSessionClick: (s: SessionWithRelations) => void;
  confidenceBadge?: ReactNode;
  certWarning?: SessionCertWarning;
  conflictedIds: Set<string>;
  activeKey: string | null;
  dndEnabled: boolean;
}) {
  const {
    entry,
    coaches,
    onSessionChange,
    onSessionClick,
    confidenceBadge,
    certWarning,
    conflictedIds,
    activeKey,
    dndEnabled,
  } = props;

  // Drag id encodes BOTH session_id and source coach_id so the drop
  // handler knows which coach (in a multi-coach shift) is being
  // dragged — only that coach gets reassigned, the others stay put.
  const dragId = `${entry.session.id}::${entry.coachId}`;
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: dragId,
    disabled: !dndEnabled,
  });

  return (
    <StaffSessionCard
      session={entry.session}
      onClick={() => onSessionClick(entry.session)}
      confidenceBadge={confidenceBadge}
      certWarning={certWarning}
      coaches={coaches}
      onSessionChange={onSessionChange}
      otherCount={entry.otherCount}
      asSecondary={!entry.isPrimary}
      isConflicted={conflictedIds.has(entry.session.id)}
      isActive={activeKey === dragId}
      draggableProps={
        dndEnabled
          ? {
              setNodeRef,
              attributes: attributes as unknown as Record<string, unknown>,
              listeners: listeners as unknown as
                | Record<string, unknown>
                | undefined,
            }
          : undefined
      }
    />
  );
}

function DroppableDayCell({
  coachId,
  dateStr,
  children,
  className,
  dndEnabled,
}: {
  coachId: string;
  dateStr: string;
  children: ReactNode;
  className: string;
  dndEnabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `staff_${coachId}_${dateStr}`,
    disabled: !dndEnabled,
  });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${
        isOver
          ? "bg-[#E8712A]/10 outline-2 outline-dashed outline-[#E8712A]/50 outline-offset-[-2px]"
          : ""
      }`}
    >
      {children}
    </td>
  );
}

// ============================================================
// Main Component
// ============================================================

export function StaffRosterView({
  sessions,
  weekStart,
  coaches,
  onSessionClick,
  onEmptySlotClick,
  onSessionChange,
  sessionCertWarnings,
  renderConfidenceBadge,
  dndEnabled = false,
}: StaffRosterViewProps) {
  const weekDates = getWeekDates(weekStart);

  // Local sessions list for optimistic updates.
  const [localSessions, setLocalSessions] =
    useState<SessionWithRelations[]>(sessions);
  useEffect(() => {
    setLocalSessions(sessions);
  }, [sessions]);

  const [conflictedIds, setConflictedIds] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activeSession, setActiveSession] =
    useState<SessionWithRelations | null>(null);

  // P4 sensors — pointer + touch (250ms long-press / 5px tolerance).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const entries = flattenForStaffView(localSessions);
  const grouped = groupEntriesByCoachAndDate(entries);

  // Build the coach rows: all coaches who have sessions + any coaches from the list
  // who don't have sessions this week (so the full team is visible)
  const coachOrder: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const c of coaches) {
    coachOrder.push({ id: c.id, name: c.name ?? "Unknown" });
    seen.add(c.id);
  }

  const hasUnassigned = grouped.has("__unassigned__");
  coachOrder.sort((a, b) => a.name.localeCompare(b.name));

  // ---- DnD handlers ----

  function handleDragStart(event: DragStartEvent) {
    const key = event.active.id as string;
    setActiveKey(key);
    const sessionId = key.split("::")[0];
    const s = localSessions.find((x) => x.id === sessionId);
    if (s) setActiveSession(s);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveKey(null);
    setActiveSession(null);
    const { active, over } = event;
    if (!over) return;

    const dragKey = active.id as string;
    const [sessionId, sourceCoachId] = dragKey.split("::");
    const dropKey = over.id as string;
    if (!dropKey.startsWith("staff_")) return;

    // staff_<coachId>_<YYYY-MM-DD>
    const rest = dropKey.slice("staff_".length);
    // The date is the last 10 chars; coach_id is everything before.
    const dateMatch = rest.match(/^(.+)_(\d{4}-\d{2}-\d{2})$/);
    if (!dateMatch) return;
    const targetCoachId = dateMatch[1];
    const newDate = dateMatch[2];

    const source = localSessions.find((s) => s.id === sessionId);
    if (!source) return;

    // No-op drop — same coach, same day.
    const dateChanged = source.date !== newDate;
    const coachChanged =
      targetCoachId !== sourceCoachId && targetCoachId !== "__unassigned__";
    const clearAssignment = targetCoachId === "__unassigned__";

    if (!dateChanged && !coachChanged && !clearAssignment) {
      return;
    }

    const snapshot = localSessions;
    const expectedUpdatedAt = source.updated_at ?? "";

    // Optimistic update — apply the patch locally.
    setLocalSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const next = { ...s };
        if (dateChanged) next.date = newDate;
        if (coachChanged) {
          next.coach_id = targetCoachId;
          // Reset assigned_coaches to a single primary to mirror what
          // the server will write through setSessionCoaches.
          next.assigned_coaches = [
            {
              user_id: targetCoachId,
              name:
                coaches.find((c) => c.id === targetCoachId)?.name ?? null,
              is_primary: true,
            },
          ];
        } else if (clearAssignment) {
          next.coach_id = null;
          next.assigned_coaches = [];
        }
        return next;
      }),
    );

    const result = await dragMoveSession({
      sessionId,
      newDate: dateChanged ? newDate : undefined,
      newCoachId: clearAssignment
        ? null
        : coachChanged
          ? targetCoachId
          : undefined,
      expectedUpdatedAt,
    });

    if (!result.ok) {
      setLocalSessions(snapshot);
      toast.error(result.error ?? "Could not move session.");
      return;
    }

    if (result.conflict) {
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

    onSessionChange();
  }

  const table = (
    <div className="overflow-x-auto rounded-2xl border bg-card transition hover:shadow-md">
      <table className="min-w-[700px] w-full border-collapse">
        {/* Header */}
        <thead>
          <tr>
            <th className="sticky left-0 z-20 w-[160px] min-w-[160px] border-b bg-muted/50 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">
              Coach
            </th>
            {weekDates.map((dateStr) => (
              <th
                key={dateStr}
                className="border-b border-l bg-muted/50 px-2 py-2.5 text-center text-xs font-medium text-muted-foreground"
              >
                {formatDayHeader(dateStr)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Unassigned row first if there are unassigned sessions */}
          {hasUnassigned && (
            <StaffRow
              coachId="__unassigned__"
              coachName="Unassigned"
              weekDates={weekDates}
              entriesByDate={grouped.get("__unassigned__") ?? new Map()}
              onSessionClick={onSessionClick}
              onEmptySlotClick={onEmptySlotClick}
              onSessionChange={onSessionChange}
              renderConfidenceBadge={renderConfidenceBadge}
              sessionCertWarnings={sessionCertWarnings}
              coaches={coaches}
              isUnassigned
              dndEnabled={dndEnabled}
              conflictedIds={conflictedIds}
              activeKey={activeKey}
            />
          )}

          {/* Coach rows */}
          {coachOrder.map((coach) => (
            <StaffRow
              key={coach.id}
              coachId={coach.id}
              coachName={coach.name}
              weekDates={weekDates}
              entriesByDate={grouped.get(coach.id) ?? new Map()}
              onSessionClick={onSessionClick}
              onEmptySlotClick={onEmptySlotClick}
              onSessionChange={onSessionChange}
              renderConfidenceBadge={renderConfidenceBadge}
              sessionCertWarnings={sessionCertWarnings}
              coaches={coaches}
              dndEnabled={dndEnabled}
              conflictedIds={conflictedIds}
              activeKey={activeKey}
            />
          ))}

          {/* Empty state */}
          {coachOrder.length === 0 && !hasUnassigned && (
            <tr>
              <td
                colSpan={weekDates.length + 1}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                No coaches found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  if (!dndEnabled) return table;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {table}
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeSession ? (
          <div className="w-[160px] opacity-90">
            <StaffSessionCard
              session={activeSession}
              onClick={() => {}}
              certWarning={sessionCertWarnings?.[activeSession.id]}
              coaches={coaches}
              onSessionChange={onSessionChange}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ============================================================
// Staff Row
// ============================================================

function StaffRow({
  coachId,
  coachName,
  weekDates,
  entriesByDate,
  onSessionClick,
  onEmptySlotClick,
  onSessionChange,
  renderConfidenceBadge,
  sessionCertWarnings,
  coaches,
  isUnassigned,
  dndEnabled,
  conflictedIds,
  activeKey,
}: {
  coachId: string;
  coachName: string;
  weekDates: string[];
  entriesByDate: Map<string, StaffViewSessionEntry[]>;
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string, coachId?: string) => void;
  onSessionChange: () => void;
  renderConfidenceBadge?: (sessionId: string) => ReactNode | undefined;
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  coaches: Pick<Profile, "id" | "name">[];
  isUnassigned?: boolean;
  dndEnabled: boolean;
  conflictedIds: Set<string>;
  activeKey: string | null;
}) {
  // Count total entries (per-coach cards) for this row this week
  let totalSessions = 0;
  for (const arr of entriesByDate.values()) {
    totalSessions += arr.length;
  }

  return (
    <tr className="group/row border-b last:border-b-0 hover:bg-muted/20 transition-colors">
      {/* Coach name cell */}
      <td className="sticky left-0 z-10 w-[160px] min-w-[160px] border-r bg-card px-3 py-2 group-hover/row:bg-muted/20 transition-colors">
        <div className="flex items-center gap-2">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
              isUnassigned
                ? "bg-muted-foreground/40"
                : "bg-[#E8712A]"
            }`}
          >
            {isUnassigned ? (
              <User className="size-3.5" />
            ) : (
              getInitials(coachName)
            )}
          </div>
          <div className="min-w-0">
            <p className={`truncate text-sm font-medium ${isUnassigned ? "italic text-muted-foreground" : "text-foreground"}`}>
              {coachName}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {totalSessions} session{totalSessions !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </td>

      {/* Day cells */}
      {weekDates.map((dateStr) => {
        const dayEntries = entriesByDate.get(dateStr) ?? [];
        const isEmpty = dayEntries.length === 0;

        return (
          <DroppableDayCell
            key={dateStr}
            coachId={coachId}
            dateStr={dateStr}
            className="border-l px-1.5 py-1.5 align-top"
            dndEnabled={dndEnabled}
          >
            {isEmpty ? (
              /* Empty cell - clickable to add session */
              <button
                type="button"
                className="flex h-full min-h-[60px] w-full items-center justify-center rounded-md border border-dashed border-transparent text-muted-foreground/0 transition-all hover:border-muted-foreground/30 hover:text-muted-foreground/60"
                onClick={() => onEmptySlotClick(dateStr, "09:00", isUnassigned ? undefined : coachId)}
                title={`Add session for ${coachName} on ${formatDayHeader(dateStr)}`}
              >
                <Plus className="size-4" />
              </button>
            ) : (
              <div className="flex flex-col gap-1">
                {dayEntries.map((entry) => (
                  <DraggableStaffCard
                    key={`${entry.session.id}-${entry.coachId}`}
                    entry={entry}
                    coaches={coaches}
                    onSessionChange={onSessionChange}
                    onSessionClick={onSessionClick}
                    confidenceBadge={renderConfidenceBadge?.(entry.session.id)}
                    certWarning={sessionCertWarnings?.[entry.session.id]}
                    conflictedIds={conflictedIds}
                    activeKey={activeKey}
                    dndEnabled={dndEnabled}
                  />
                ))}
                {/* Add button below existing sessions */}
                <button
                  type="button"
                  className="flex h-6 w-full items-center justify-center rounded border border-dashed border-transparent text-muted-foreground/0 transition-all hover:border-muted-foreground/30 hover:text-muted-foreground/60"
                  onClick={() => onEmptySlotClick(dateStr, "09:00", isUnassigned ? undefined : coachId)}
                  title={`Add another session for ${coachName}`}
                >
                  <Plus className="size-3" />
                </button>
              </div>
            )}
          </DroppableDayCell>
        );
      })}
    </tr>
  );
}
