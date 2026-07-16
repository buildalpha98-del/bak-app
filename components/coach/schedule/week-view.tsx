"use client";

// ============================================================
// Coach schedule — week view
// ============================================================
//
// Vertically stacked day sections (Mon–Fri), whole week visible in
// one scroll. The old layout used horizontal day COLUMNS, which on a
// phone showed ~2 days and made the coach swipe for the rest. Each
// day header is a 44px tap target that collapses/expands its
// sessions ("drop down stackable"); days start expanded, empty days
// render as a slim muted row so the week's shape stays scannable.

import { useState } from "react";
import Link from "@/components/ui/app-link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_DOT_COLOURS } from "@/components/roster/session-status-badge";
import {
  formatTime12,
  formatDayHeader,
  getWeekDates,
  getMonday,
  formatWeekLabel,
  toLocalIso,
} from "@/lib/utils/roster";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { sportColour } from "@/lib/utils/sport-colours";
import type { CoachSessionWithCentre } from "@/lib/sessions/coach-actions";

// ============================================================
// Props
// ============================================================

interface WeekViewProps {
  sessions: CoachSessionWithCentre[];
  weekStart: Date;
}

// ============================================================
// Component
// ============================================================

export function WeekView({ sessions, weekStart }: WeekViewProps) {
  const router = useRouter();
  const weekDates = getWeekDates(weekStart);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group sessions by date
  const sessionsByDate = new Map<string, CoachSessionWithCentre[]>();
  for (const s of sessions) {
    const arr = sessionsByDate.get(s.date) ?? [];
    arr.push(s);
    sessionsByDate.set(s.date, arr);
  }

  function toggleDay(dateStr: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  function navigateWeek(offset: number) {
    const target = new Date(weekStart);
    target.setDate(target.getDate() + offset * 7);
    const monday = getMonday(target);
    // toLocalIso, not toISOString — the UTC hop shifted the week key
    // back a day for anyone east of Greenwich.
    router.push(`/coach/schedule?tab=week&date=${toLocalIso(monday)}`);
  }

  const today = sydneyTodayIso();

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateWeek(-1)}
          aria-label="Previous week"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {formatWeekLabel(weekStart)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => navigateWeek(1)}
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Stacked day sections — the whole week in one vertical scroll */}
      <div className="space-y-2">
        {weekDates.map((dateStr) => {
          const daySessions = sessionsByDate.get(dateStr) ?? [];
          const isToday = dateStr === today;
          const isOpen = !collapsed.has(dateStr);

          if (daySessions.length === 0) {
            return (
              <div
                key={dateStr}
                className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 ${
                  isToday ? "border-primary/30 bg-primary/5" : "bg-card"
                }`}
              >
                <span
                  className={`text-sm font-medium ${
                    isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {formatDayHeader(dateStr)}
                  {isToday && " · Today"}
                </span>
                <span className="text-xs text-muted-foreground">
                  No sessions
                </span>
              </div>
            );
          }

          return (
            <div
              key={dateStr}
              className={`overflow-hidden rounded-2xl border bg-card ${
                isToday ? "border-primary/30" : ""
              }`}
            >
              {/* Day header — tap to collapse/expand */}
              <button
                type="button"
                onClick={() => toggleDay(dateStr)}
                aria-expanded={isOpen}
                className={`flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                  isToday ? "bg-primary/10" : "bg-muted/40"
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    isToday ? "text-primary" : "text-foreground"
                  }`}
                >
                  {formatDayHeader(dateStr)}
                  {isToday && " · Today"}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {daySessions.length} session
                  {daySessions.length === 1 ? "" : "s"}
                  <ChevronDown
                    className={`size-4 transition-transform ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                </span>
              </button>

              {/* Session rows */}
              {isOpen && (
                <div className="divide-y">
                  {daySessions.map((session) => {
                    const colour = sportColour(session.sport);
                    const dotColour = STATUS_DOT_COLOURS[session.status];

                    return (
                      <Link
                        key={session.id}
                        href={`/coach/schedule/${session.id}`}
                        className="flex min-h-[56px] items-center gap-3 border-l-2 px-3 py-2 transition-colors active:bg-muted/60"
                        style={{ borderLeftColor: colour }}
                      >
                        <div className="w-[72px] shrink-0">
                          <p className="text-sm font-semibold text-foreground">
                            {formatTime12(session.time.slice(0, 5))}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {session.duration_minutes} min
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {session.centre_name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {session.sport}
                          </p>
                        </div>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: dotColour }}
                          title={session.status}
                        />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
