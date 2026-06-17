"use client";

// ============================================================
// MonthCalendarPopover
// ============================================================
//
// A small hand-rolled month-grid popover that replaces the native
// `<input type="date">` in the roster toolbar. The native control is
// styling-hostile and visually inconsistent with the rest of the
// page; this popover gives us full control over the chrome and the
// keyboard model.
//
// Behaviour summary
//   - Renders the formatted week label (e.g. "9 – 13 Jun 2026") as
//     the trigger button.
//   - Popover content is a month grid: month/year header with
//     prev/next arrows, weekday columns (M T W T F S S), and 6 rows
//     × 7 cells of day numbers.
//   - Clicking any day calls `onSelect(date)` with that day's *Monday*
//     (via `getMonday`) and closes the popover.
//   - Today's cell is ringed in brand orange; the currently-selected
//     week is row-highlighted; the focused cell is ringed.
//   - Keyboard: arrow keys navigate, Enter selects, Page Up/Down jump
//     a month, Home/End jump to row start/end, Escape closes.
//
// No new dependencies; vanilla `Date` math throughout. Designed to
// work for both /admin/roster and /ops/roster since `RosterPage`
// already owns the week-navigation logic.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatWeekLabel, getMonday } from "@/lib/utils/roster";

interface MonthCalendarPopoverProps {
  /** The currently-selected Monday (YYYY-MM-DD). Highlights the
   *  whole week that contains this date. */
  weekStart: string;
  /**
   * Called with the Monday of whichever day the user picked. The
   * caller is responsible for any subsequent navigation.
   */
  onSelect: (monday: Date) => void;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Mon-first weekday header — matches the rest of the roster which is
// Mon → Fri. We still render Sat/Sun in the grid so the operator can
// pick any day in the month, but the leading M makes the "weeks
// start Monday" convention explicit.
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toYmd(d: Date): string {
  // Local-date YYYY-MM-DD, not UTC. Using toISOString would shift
  // dates by up to a day for users east of UTC (which is most of
  // Australia for half the year).
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isSameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Build the 6×7 day grid for a given (year, month). Each cell is a
 * concrete Date — cells outside the displayed month are still real
 * dates from the prev/next month so navigation behaves naturally.
 *
 * 6 rows is the minimum that covers any month (28 days + up to 6
 * lead-in cells); we always render 6 to avoid layout jitter when
 * paging between months.
 */
function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  // JS getDay: Sun=0, Mon=1, ..., Sat=6. We want Mon=0 ... Sun=6 so
  // the column order matches the WEEKDAY_LABELS array.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

export function MonthCalendarPopover({
  weekStart,
  onSelect,
}: MonthCalendarPopoverProps) {
  const selectedMonday = useMemo(
    () => new Date(weekStart + "T00:00:00"),
    [weekStart],
  );

  // View month is local UI state — separate from selectedMonday so the
  // operator can page through months without committing a selection.
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedMonday.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedMonday.getMonth());
  const [focusedDate, setFocusedDate] = useState<Date>(selectedMonday);

  // Reset the view to the selected month whenever the popover opens —
  // makes "open the picker" feel reliable rather than picking up wherever
  // the operator last paged to.
  useEffect(() => {
    if (open) {
      setViewYear(selectedMonday.getFullYear());
      setViewMonth(selectedMonday.getMonth());
      setFocusedDate(selectedMonday);
    }
  }, [open, selectedMonday]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // Pre-compute the Mon-bookended range of the selected week so we can
  // row-highlight in O(1) per cell rather than calling getMonday on
  // every render. Friday is intentional — the staff view's Mon–Fri
  // scope means weekend cells should NOT light up as "selected".
  const weekStartYmd = toYmd(getMonday(selectedMonday));
  const weekEndDate = (() => {
    const d = getMonday(selectedMonday);
    d.setDate(d.getDate() + 4);
    return d;
  })();
  const weekEndYmd = toYmd(weekEndDate);

  function goPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  function commitSelection(day: Date) {
    // Always normalise to the Monday — the roster grid is week-based
    // and the parent expects Mondays. Picking Thursday or Sunday lands
    // on the same week.
    const monday = getMonday(day);
    setOpen(false);
    onSelect(monday);
  }

  function handleCellKeyDown(e: React.KeyboardEvent, date: Date) {
    let next: Date | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = new Date(date);
        next.setDate(next.getDate() - 1);
        break;
      case "ArrowRight":
        next = new Date(date);
        next.setDate(next.getDate() + 1);
        break;
      case "ArrowUp":
        next = new Date(date);
        next.setDate(next.getDate() - 7);
        break;
      case "ArrowDown":
        next = new Date(date);
        next.setDate(next.getDate() + 7);
        break;
      case "PageUp":
        next = new Date(date);
        next.setMonth(next.getMonth() - 1);
        break;
      case "PageDown":
        next = new Date(date);
        next.setMonth(next.getMonth() + 1);
        break;
      case "Home":
        // Jump to Monday of the focused cell's week.
        next = getMonday(date);
        break;
      case "End": {
        // Jump to Sunday of the focused cell's week.
        const mon = getMonday(date);
        next = new Date(mon);
        next.setDate(mon.getDate() + 6);
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        commitSelection(date);
        return;
      default:
        return;
    }
    if (next) {
      e.preventDefault();
      setFocusedDate(next);
      // Re-sync the visible month if the focus has paged out of it.
      if (next.getMonth() !== viewMonth || next.getFullYear() !== viewYear) {
        setViewMonth(next.getMonth());
        setViewYear(next.getFullYear());
      }
    }
  }

  // After a key navigation moves the focused cell, refocus it.
  // We do this via a ref keyed on date YMD so the grid stays
  // declarative — the data attribute lets us re-find the button after
  // a render that may have re-built the cells (e.g. month change).
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const ymd = toYmd(focusedDate);
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${ymd}"]`,
    );
    el?.focus();
  }, [focusedDate, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] gap-2"
            aria-label={`Select week. Currently showing week of ${formatWeekLabel(getMonday(selectedMonday))}`}
          >
            <CalendarDays className="size-4" />
            <span className="tabular-nums">
              {formatWeekLabel(getMonday(selectedMonday))}
            </span>
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[280px] p-3"
        // Trap focus inside so arrow navigation never escapes mid-pick.
        // Base-ui's Popover already handles outside-click + Escape.
      >
        {/* Month / year header */}
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={goPrevMonth}
            className="rounded-md p-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-medium tabular-nums">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </div>
          <button
            type="button"
            onClick={goNextMonth}
            className="rounded-md p-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Weekday header */}
        <div
          className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          aria-hidden
        >
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-7 gap-px"
          role="grid"
          aria-label="Select a date"
        >
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === viewMonth;
            const ymd = toYmd(d);
            const isToday = isSameYmd(d, today);
            // Highlight every Mon–Fri cell in the currently-selected
            // week so the row reads as the active period at a glance.
            const inSelectedWeek = ymd >= weekStartYmd && ymd <= weekEndYmd;
            const isFocused = isSameYmd(d, focusedDate);

            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                data-date={ymd}
                tabIndex={isFocused ? 0 : -1}
                onClick={() => commitSelection(d)}
                onKeyDown={(e) => handleCellKeyDown(e, d)}
                aria-label={d.toLocaleDateString("en-AU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                aria-current={isToday ? "date" : undefined}
                aria-selected={inSelectedWeek}
                className={[
                  "relative flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors focus:outline-none",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  inSelectedWeek
                    ? "bg-secondary"
                    : "hover:bg-muted",
                  isToday
                    ? "ring-1 ring-[#E8712A] ring-offset-1 ring-offset-background"
                    : "",
                  isFocused
                    ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                    : "",
                ].join(" ")}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* Footer hint — keeps the keyboard model discoverable. */}
        <p className="mt-2 text-[10px] text-muted-foreground">
          Arrows to navigate · Enter to select · selecting any day picks that week.
        </p>
      </PopoverContent>
    </Popover>
  );
}
