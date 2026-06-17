"use client";

import { Fragment, type ReactNode } from "react";
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
  coaches,
  onSessionChange,
}: SessionCalendarViewProps) {
  const weekDates = getWeekDates(weekStart);

  // Group sessions by date+time slot for detecting occupied cells
  const sessionsByDateAndSlot = new Map<string, SessionWithRelations[]>();
  for (const s of sessions) {
    const timeKey = s.time.slice(0, 5);
    const key = `${s.date}_${timeKey}`;
    const arr = sessionsByDateAndSlot.get(key) ?? [];
    arr.push(s);
    sessionsByDateAndSlot.set(key, arr);
  }

  return (
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
        {weekDates.map((dateStr, i) => (
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
                  <div
                    key={`cell-${dateStr}-${slot}`}
                    className={`relative border-b border-l ${
                      isHour ? "border-b-border" : "border-b-border/40"
                    }`}
                    style={{ gridRow: rowIdx + 2, gridColumn: dayIdx + 2 }}
                  >
                    {/* Clickable empty area */}
                    {!cellSessions && (
                      <button
                        type="button"
                        className="absolute inset-0 cursor-pointer hover:bg-muted/30"
                        onClick={() => onEmptySlotClick(dateStr, slot)}
                        title={`Add session – ${formatDayHeader(dateStr)} ${formatTime12(slot)}`}
                      />
                    )}
                  </div>
                );
              })}
            </Fragment>
          );
        })}

        {/* Positioned session cards (absolute within the grid) */}
        {sessions.map((s) => {
          const timeKey = s.time.slice(0, 5);
          const row = timeToRow(timeKey);
          const span = durationToSpan(s.duration_minutes);
          const dayNum = dateToDay(s.date);
          if (dayNum === 0) return null; // Skip weekends
          const col = dayNum + 1; // +1 for time column offset

          return (
            <div
              key={s.id}
              className="z-[5] p-0.5"
              style={{
                gridRow: `${row} / span ${span}`,
                gridColumn: col,
              }}
            >
              <SessionCard
                session={s}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
