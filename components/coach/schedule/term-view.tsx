"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { sportColour } from "@/lib/utils/sport-colours";
import type { TermSessionSummary } from "@/lib/sessions/coach-actions";
import type { Term } from "@/lib/types/database";

// ============================================================
// Helpers
// ============================================================

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Get calendar grid weeks for a given month (Mon-start) */
function getCalendarGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1);
  // Day of week: Mon=0 ... Sun=6
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  // Fill leading blanks
  for (let i = 0; i < startOffset; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Fill trailing blanks
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

function padDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ============================================================
// Props
// ============================================================

interface TermViewProps {
  sessions: TermSessionSummary[];
  term: Term | null;
}

// ============================================================
// Component
// ============================================================

export function TermView({ sessions, term }: TermViewProps) {
  const router = useRouter();
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  if (!term) {
    return (
      <div className="py-12 text-center">
        <CalendarDays className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">
          No active term
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sessions will appear here once a term is activated.
        </p>
      </div>
    );
  }

  // Group sessions by date
  const sessionsByDate = new Map<string, TermSessionSummary[]>();
  for (const s of sessions) {
    const arr = sessionsByDate.get(s.date) ?? [];
    arr.push(s);
    sessionsByDate.set(s.date, arr);
  }

  // Summary stats
  const total = sessions.length;
  const confirmed = sessions.filter(
    (s) => s.status === "confirmed" || s.status === "completed"
  ).length;
  const pending = sessions.filter(
    (s) =>
      s.status === "pending_confirmation" ||
      s.status === "published" ||
      s.status === "draft"
  ).length;

  const weeks = getCalendarGrid(viewYear, viewMonth);
  const todayStr = today.toISOString().split("T")[0];

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function handleDayClick(day: number) {
    const dateStr = padDate(viewYear, viewMonth, day);
    router.push(`/coach/schedule?tab=today&date=${dateStr}`);
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex gap-3">
        <Card className="flex-1">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-semibold text-green-600">{confirmed}</p>
            <p className="text-[10px] text-muted-foreground">Confirmed</p>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-semibold text-amber-600">{pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon-sm" onClick={prevMonth}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <Button variant="outline" size="icon-sm" onClick={nextMonth}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_HEADERS.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-[11px] font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-0">
            {week.map((day, di) => {
              if (day === null) {
                return (
                  <div key={`empty-${di}`} className="h-14 bg-muted/20" />
                );
              }

              const dateStr = padDate(viewYear, viewMonth, day);
              const daySessions = sessionsByDate.get(dateStr) ?? [];
              const isToday = dateStr === todayStr;
              const isWeekend = di >= 5;
              const hasSessions = daySessions.length > 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => hasSessions && handleDayClick(day)}
                  disabled={!hasSessions}
                  className={`relative flex h-14 flex-col items-center justify-start p-1 transition-colors min-w-[44px] ${
                    hasSessions
                      ? "cursor-pointer active:bg-muted/50"
                      : "cursor-default"
                  } ${isWeekend ? "bg-muted/10" : ""}`}
                >
                  <span
                    className={`text-xs ${
                      isToday
                        ? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold"
                        : isWeekend
                          ? "text-muted-foreground"
                          : "text-foreground"
                    }`}
                  >
                    {day}
                  </span>

                  {/* Session dots */}
                  {daySessions.length > 0 && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {daySessions.slice(0, 3).map((s) => (
                        <span
                          key={s.id}
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: sportColour(s.sport),
                          }}
                        />
                      ))}
                      {daySessions.length > 3 && (
                        <span className="text-[8px] text-muted-foreground">
                          +{daySessions.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Term info */}
      <p className="text-center text-xs text-muted-foreground">
        {term.name} · {term.start_date} to {term.end_date}
      </p>
    </div>
  );
}
