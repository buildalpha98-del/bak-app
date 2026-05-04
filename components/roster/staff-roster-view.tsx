"use client";

import type { ReactNode } from "react";
import { Plus, User, ShieldAlert, ShieldOff } from "lucide-react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";
import {
  describeSessionCertWarning,
  type SessionCertWarning,
} from "@/lib/utils/compliance/cert-warnings";
import { getWeekDates, formatDayHeader, formatTime12 } from "@/lib/utils/roster";
import { sportColour } from "@/lib/utils/sport-colours";
import { STATUS_DOT_COLOURS } from "./session-status-badge";

// ============================================================
// Props
// ============================================================

interface StaffRosterViewProps {
  sessions: SessionWithRelations[];
  weekStart: Date;
  coaches: Pick<Profile, "id" | "name">[];
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string, coachId?: string) => void;
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  renderConfidenceBadge?: (sessionId: string) => ReactNode | undefined;
}

// ============================================================
// Helpers
// ============================================================

/** Group sessions by coach_id → date → sessions[] */
function groupSessionsByCoachAndDate(
  sessions: SessionWithRelations[]
): Map<string, Map<string, SessionWithRelations[]>> {
  const map = new Map<string, Map<string, SessionWithRelations[]>>();

  for (const s of sessions) {
    const coachKey = s.coach_id ?? "__unassigned__";
    if (!map.has(coachKey)) {
      map.set(coachKey, new Map());
    }
    const dateMap = map.get(coachKey)!;
    if (!dateMap.has(s.date)) {
      dateMap.set(s.date, []);
    }
    dateMap.get(s.date)!.push(s);
  }

  // Sort sessions within each cell by time
  for (const dateMap of map.values()) {
    for (const [date, arr] of dateMap) {
      arr.sort((a, b) => a.time.localeCompare(b.time));
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
}: {
  session: SessionWithRelations;
  onClick: () => void;
  confidenceBadge?: ReactNode;
  certWarning?: SessionCertWarning;
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
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full rounded-md border bg-card px-2 py-1.5 text-left shadow-sm transition-all hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ borderLeftWidth: 3, borderLeftColor: colour }}
      aria-label={`${session.sport} at ${session.centre_name}, ${timeStr} – ${endTime}`}
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
  sessionCertWarnings,
  renderConfidenceBadge,
}: StaffRosterViewProps) {
  const weekDates = getWeekDates(weekStart);
  const grouped = groupSessionsByCoachAndDate(sessions);

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
              sessionsByDate={grouped.get("__unassigned__") ?? new Map()}
              onSessionClick={onSessionClick}
              onEmptySlotClick={onEmptySlotClick}
              renderConfidenceBadge={renderConfidenceBadge}
              sessionCertWarnings={sessionCertWarnings}
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
              sessionsByDate={grouped.get(coach.id) ?? new Map()}
              onSessionClick={onSessionClick}
              onEmptySlotClick={onEmptySlotClick}
              renderConfidenceBadge={renderConfidenceBadge}
              sessionCertWarnings={sessionCertWarnings}
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
  sessionsByDate,
  onSessionClick,
  onEmptySlotClick,
  renderConfidenceBadge,
  sessionCertWarnings,
  isUnassigned,
}: {
  coachId: string;
  coachName: string;
  weekDates: string[];
  sessionsByDate: Map<string, SessionWithRelations[]>;
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string, coachId?: string) => void;
  renderConfidenceBadge?: (sessionId: string) => ReactNode | undefined;
  sessionCertWarnings?: Record<string, SessionCertWarning>;
  isUnassigned?: boolean;
}) {
  // Count total sessions for this coach this week
  let totalSessions = 0;
  for (const arr of sessionsByDate.values()) {
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
        const daySessions = sessionsByDate.get(dateStr) ?? [];
        const isEmpty = daySessions.length === 0;

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
                {daySessions.map((session) => (
                  <StaffSessionCard
                    key={session.id}
                    session={session}
                    onClick={() => onSessionClick(session)}
                    confidenceBadge={renderConfidenceBadge?.(session.id)}
                    certWarning={sessionCertWarnings?.[session.id]}
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
