"use client";

import { Fragment } from "react";
import type { SessionWithRelations } from "@/lib/sessions/actions";
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
import type { ComplianceCheckResult } from "@/lib/utils/scheduling";

// ============================================================
// Props
// ============================================================

interface SessionCalendarViewProps {
  sessions: SessionWithRelations[];
  weekStart: Date;
  onSessionClick: (session: SessionWithRelations) => void;
  onEmptySlotClick: (date: string, time: string) => void;
  /** Compliance warnings keyed by coach_id */
  complianceWarnings?: Record<string, ComplianceCheckResult>;
}

// ============================================================
// Component
// ============================================================

export function SessionCalendarView({
  sessions,
  weekStart,
  onSessionClick,
  onEmptySlotClick,
  complianceWarnings,
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
    <div className="overflow-x-auto rounded-xl border bg-card">
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
                hasComplianceWarning={
                  !!s.coach_id &&
                  !!complianceWarnings &&
                  !!complianceWarnings[s.coach_id]
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
