"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_DOT_COLOURS } from "@/components/roster/session-status-badge";
import {
  formatTime12,
  formatDayHeader,
  getWeekDates,
  getMonday,
  formatWeekLabel,
} from "@/lib/utils/roster";
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

  // Group sessions by date
  const sessionsByDate = new Map<string, CoachSessionWithCentre[]>();
  for (const s of sessions) {
    const arr = sessionsByDate.get(s.date) ?? [];
    arr.push(s);
    sessionsByDate.set(s.date, arr);
  }

  function navigateWeek(offset: number) {
    const target = new Date(weekStart);
    target.setDate(target.getDate() + offset * 7);
    const monday = getMonday(target);
    const dateStr = monday.toISOString().split("T")[0];
    router.push(`/coach/schedule?tab=week&date=${dateStr}`);
  }

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon-sm" onClick={() => navigateWeek(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {formatWeekLabel(weekStart)}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => navigateWeek(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Day columns — horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1">
        {weekDates.map((dateStr) => {
          const daySessions = sessionsByDate.get(dateStr) ?? [];
          const today = new Date().toISOString().split("T")[0];
          const isToday = dateStr === today;

          return (
            <div
              key={dateStr}
              className="min-w-[200px] flex-1 snap-start rounded-lg border bg-card p-2"
            >
              {/* Day header */}
              <div
                className={`mb-2 rounded-md px-2 py-1 text-center text-xs font-medium ${
                  isToday
                    ? "bg-[var(--brand-orange-light)] text-primary"
                    : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {formatDayHeader(dateStr)}
              </div>

              {/* Session cards */}
              {daySessions.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No sessions
                </p>
              ) : (
                <div className="space-y-1.5">
                  {daySessions.map((session) => {
                    const colour = sportColour(session.sport);
                    const dotColour = STATUS_DOT_COLOURS[session.status];

                    return (
                      <Link
                        key={session.id}
                        href={`/coach/schedule/${session.id}`}
                        className="block rounded-md border-l-2 bg-muted/30 p-2 transition-colors active:bg-muted/60 min-h-[44px]"
                        style={{ borderLeftColor: colour }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">
                            {formatTime12(session.time.slice(0, 5))}
                          </span>
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: dotColour }}
                            title={session.status}
                          />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {session.centre_name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {session.sport} · {session.duration_minutes}min
                        </p>
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
