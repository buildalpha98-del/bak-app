"use client";

import type { ReactNode } from "react";
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
      // entry. After Task 12 this should rarely fire in practice.
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
    <div className="relative w-full group">
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-md border bg-card px-2 py-1.5 text-left shadow-sm transition-all hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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
    </div>
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
}: StaffRosterViewProps) {
  const weekDates = getWeekDates(weekStart);
  const entries = flattenForStaffView(sessions);
  const grouped = groupEntriesByCoachAndDate(entries);

  // Build the coach rows: all coaches who have sessions + any coaches from the list
  // who don't have sessions this week (so the full team is visible)
  const coachOrder: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  // First: coaches from the coaches prop (preserves alphabetical or passed order)
  for (const c of coaches) {
    coachOrder.push({ id: c.id, name: c.name ?? "Unknown" });
    seen.add(c.id);
  }

  // Check for unassigned sessions
  const hasUnassigned = grouped.has("__unassigned__");

  // Sort coaches alphabetically by name
  coachOrder.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
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
          <td
            key={dateStr}
            className="border-l px-1.5 py-1.5 align-top"
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
                  <StaffSessionCard
                    key={`${entry.session.id}-${entry.coachId}`}
                    session={entry.session}
                    onClick={() => onSessionClick(entry.session)}
                    confidenceBadge={renderConfidenceBadge?.(entry.session.id)}
                    certWarning={sessionCertWarnings?.[entry.session.id]}
                    coaches={coaches}
                    onSessionChange={onSessionChange}
                    otherCount={entry.otherCount}
                    asSecondary={!entry.isPrimary}
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
          </td>
        );
      })}
    </tr>
  );
}
