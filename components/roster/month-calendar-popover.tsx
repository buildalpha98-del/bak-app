"use client";

// ============================================================
// MonthCalendarPopover
// ============================================================
//
// A small hand-rolled month-grid popover that replaces the native
// `<input type="date">` / `<input type="month">` controls. Both are
// styling-hostile and visually inconsistent with the rest of the
// platform; this popover gives us full control over the chrome and the
// keyboard model.
//
// Modes
//   - `mode="week"` (default — used by /admin/roster + /ops/roster):
//     selecting any day snaps to the Monday of that week and the row
//     for that week is highlighted. Used to navigate a week-based grid.
//   - `mode="month"` (used by /admin/performance): selecting any day
//     snaps to the 1st of that month and the whole calendar month is
//     highlighted. A header row of presets (This month / Last 3 months
//     / Last 6 months) is rendered above the grid in this mode.
//
// Behaviour summary
//   - Renders the formatted period label as the trigger button.
//   - Popover content is a month grid: month/year header with prev/next
//     arrows, weekday columns (M T W T F S S), and 6 rows x 7 cells of
//     day numbers.
//   - Clicking any day calls `onSelect(date)` with the normalised period
//     boundary (Monday for week mode, 1st of month for month mode) and
//     closes the popover.
//   - Today's cell is ringed in brand orange; the currently-selected
//     period is row-highlighted; the focused cell is ringed.
//   - Keyboard: arrow keys navigate, Enter selects, Page Up/Down jump a
//     month, Home/End jump to row start/end, Escape closes.
//
// No new dependencies; vanilla `Date` math throughout. Designed to work
// for both /admin/roster (week mode) and /admin/performance (month mode)
// without forking the component.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatWeekLabel, getMonday } from "@/lib/utils/roster";

type Mode = "week" | "month";

interface MonthCalendarPopoverProps {
  /**
   * The currently-selected anchor date (YYYY-MM-DD).
   *
   * In week mode this is the Monday of the active week; in month mode
   * it's the first day of the active month. The grid highlights every
   * cell that falls inside the selected period.
   */
  weekStart: string;
  /**
   * Called with the normalised period anchor:
   *   - week mode: Monday of the picked day's week
   *   - month mode: first day of the picked day's month
   */
  onSelect: (date: Date) => void;
  /** "week" (default) or "month". See file header. */
  mode?: Mode;
  /**
   * Optional override for the trigger label. Defaults to the formatted
   * week / month label derived from `weekStart`.
   */
  label?: string;
  /**
   * Month-mode only: render the preset row (This month / Last 3 / Last
   * 6 months). Each preset calls `onPresetSelect(months)` with the
   * number of months back to anchor the period. Defaults to off.
   */
  presets?: Array<{ label: string; months: number }>;
  /**
   * Month-mode only: called when the operator clicks a preset chip. The
   * caller derives the start/end from `months` since the popover only
   * knows about an anchor date, not the end of the period.
   */
  onPresetSelect?: (months: number) => void;
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

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
  const firstOfMonthDate = new Date(year, month, 1);
  // JS getDay: Sun=0, Mon=1, ..., Sat=6. We want Mon=0 ... Sun=6 so
  // the column order matches the WEEKDAY_LABELS array.
  const firstWeekday = (firstOfMonthDate.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstWeekday);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
    );
  }
  return cells;
}

function formatMonthLabel(d: Date): string {
  // e.g. "May 2026"
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function MonthCalendarPopover({
  weekStart,
  onSelect,
  mode = "week",
  label,
  presets,
  onPresetSelect,
}: MonthCalendarPopoverProps) {
  const selectedAnchor = useMemo(
    () => new Date(weekStart + "T00:00:00"),
    [weekStart],
  );

  // View month is local UI state — separate from selectedAnchor so the
  // operator can page through months without committing a selection.
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selectedAnchor.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedAnchor.getMonth());
  const [focusedDate, setFocusedDate] = useState<Date>(selectedAnchor);

  // Reset the view to the selected month whenever the popover opens —
  // makes "open the picker" feel reliable rather than picking up wherever
  // the operator last paged to.
  useEffect(() => {
    if (open) {
      setViewYear(selectedAnchor.getFullYear());
      setViewMonth(selectedAnchor.getMonth());
      setFocusedDate(selectedAnchor);
    }
  }, [open, selectedAnchor]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const cells = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // Compute the highlight range based on mode.
  //   - week: Mon → Fri of the selected anchor's week.
  //   - month: 1st → last day of the selected anchor's month.
  const { rangeStartYmd, rangeEndYmd } = useMemo(() => {
    if (mode === "month") {
      const start = firstOfMonth(selectedAnchor);
      const end = new Date(
        selectedAnchor.getFullYear(),
        selectedAnchor.getMonth() + 1,
        0,
      );
      return { rangeStartYmd: toYmd(start), rangeEndYmd: toYmd(end) };
    }
    // week mode
    const monStart = getMonday(selectedAnchor);
    const monEnd = new Date(monStart);
    monEnd.setDate(monStart.getDate() + 4);
    return { rangeStartYmd: toYmd(monStart), rangeEndYmd: toYmd(monEnd) };
  }, [mode, selectedAnchor]);

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
    // Snap to the canonical anchor for the chosen mode.
    //   - week → Monday
    //   - month → 1st of month
    const anchor =
      mode === "month" ? firstOfMonth(day) : getMonday(day);
    setOpen(false);
    onSelect(anchor);
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

  const triggerLabel =
    label ??
    (mode === "month"
      ? formatMonthLabel(selectedAnchor)
      : formatWeekLabel(getMonday(selectedAnchor)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] gap-2"
            aria-label={
              mode === "month"
                ? `Select month. Currently showing ${triggerLabel}.`
                : `Select week. Currently showing week of ${triggerLabel}.`
            }
          >
            <CalendarDays className="size-4" />
            <span className="tabular-nums">{triggerLabel}</span>
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-[280px] p-3"
        // Trap focus inside so arrow navigation never escapes mid-pick.
        // Base-ui's Popover already handles outside-click + Escape.
      >
        {/* Presets (month mode only) */}
        {mode === "month" && presets && presets.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPresetSelect?.(p.months);
                }}
                className="rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground transition hover:border-primary hover:text-primary"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

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
            // Highlight every cell inside the selected period (week or
            // month, depending on mode).
            const inSelectedRange =
              ymd >= rangeStartYmd && ymd <= rangeEndYmd;
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
                aria-selected={inSelectedRange}
                className={[
                  "relative flex h-8 items-center justify-center rounded-md text-xs tabular-nums transition-colors focus:outline-none",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  inSelectedRange ? "bg-secondary" : "hover:bg-muted",
                  isToday
                    ? "ring-1 ring-primary ring-offset-1 ring-offset-background"
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
          {mode === "month"
            ? "Arrows to navigate · Enter selects · picking any day picks that month."
            : "Arrows to navigate · Enter to select · selecting any day picks that week."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
