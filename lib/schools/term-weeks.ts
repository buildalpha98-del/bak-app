// Term weeks, the way the Scope & Sequence counts them: week 1 starts on
// the term's start date and every week is seven days from there. Pure,
// date-only arithmetic (no timezone: ISO dates are compared as days).

export interface TermWeek {
  weekNumber: number;
  /** ISO date of the week's first day (the term start's weekday). */
  weekStart: string;
  /** ISO date six days later. */
  weekEnd: string;
}

function dayNumber(iso: string): number {
  return Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
}

function isoFromDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Week number a date falls in (1-based); null when outside the term. */
export function weekNumberFor(termStart: string, termEnd: string, dateIso: string): number | null {
  const d = dayNumber(dateIso);
  if (d < dayNumber(termStart) || d > dayNumber(termEnd)) return null;
  return Math.floor((d - dayNumber(termStart)) / 7) + 1;
}

/** Every week of the term, in order. */
export function termWeeks(termStart: string, termEnd: string): TermWeek[] {
  const start = dayNumber(termStart);
  const end = dayNumber(termEnd);
  const weeks: TermWeek[] = [];
  for (let d = start, n = 1; d <= end; d += 7, n++) {
    weeks.push({ weekNumber: n, weekStart: isoFromDay(d), weekEnd: isoFromDay(Math.min(d + 6, end)) });
  }
  return weeks;
}

/** The week start a lesson should be stored against for a given date. */
export function weekStartFor(termStart: string, termEnd: string, dateIso: string): string | null {
  const n = weekNumberFor(termStart, termEnd, dateIso);
  if (n === null) return null;
  return isoFromDay(dayNumber(termStart) + (n - 1) * 7);
}
