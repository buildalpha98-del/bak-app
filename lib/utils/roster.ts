// ============================================================
// Roster date & time utilities
// Shared between calendar view, list view, and server actions
// ============================================================

/** Day labels for the weekly grid header */
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** 30-min time slots from 07:00 to 17:30 */
export const SLOT_TIMES: string[] = [];
for (let h = 7; h <= 17; h++) {
  SLOT_TIMES.push(`${h.toString().padStart(2, "0")}:00`);
  if (h < 18) {
    SLOT_TIMES.push(`${h.toString().padStart(2, "0")}:30`);
  }
}

/**
 * Serialise a local-time Date as "YYYY-MM-DD" WITHOUT the UTC shift.
 * `toISOString()` converts to UTC first, which moves local-midnight
 * dates back a day in any timezone east of UTC (Sydney is +10/+11) —
 * that was the root cause of the roster grid starting on Saturday.
 */
export function toLocalIso(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Monday of the week containing a "YYYY-MM-DD" date, as "YYYY-MM-DD".
 * Pure string→string calendar arithmetic (UTC-internal), so it gives
 * the same answer on every server and browser regardless of timezone.
 * Sunday belongs to the week that started the previous Monday.
 */
export function mondayOfIso(dateIso: string): string {
  const utc = new Date(
    Date.UTC(
      Number(dateIso.slice(0, 4)),
      Number(dateIso.slice(5, 7)) - 1,
      Number(dateIso.slice(8, 10))
    )
  );
  const day = utc.getUTCDay(); // 0=Sun, 1=Mon, ...
  utc.setUTCDate(utc.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return utc.toISOString().split("T")[0];
}

// ============================================================
// Recurrence — repeat a session across weeks
// ============================================================

export type RecurrenceFrequency = "weekly" | "fortnightly" | "four_weekly";

export const RECURRENCE_STEP_DAYS: Record<RecurrenceFrequency, number> = {
  weekly: 7,
  fortnightly: 14,
  // "Monthly" for a coaching roster means every 4 weeks — stepping by
  // calendar month would drift off the weekday the centre expects.
  four_weekly: 28,
};

/**
 * Dates ("YYYY-MM-DD") for a recurring session: the start date plus
 * every `frequency` step up to and including `until`. Pure UTC string
 * arithmetic (no timezone drift), capped to keep a typo'd end date
 * from generating hundreds of rows.
 */
export function buildRecurrenceDates(
  startIso: string,
  frequency: RecurrenceFrequency,
  untilIso: string,
  cap = 26
): string[] {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startIso) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(untilIso) ||
    untilIso < startIso
  ) {
    return [];
  }
  const step = RECURRENCE_STEP_DAYS[frequency];
  const dates: string[] = [];
  const cursor = new Date(
    Date.UTC(
      Number(startIso.slice(0, 4)),
      Number(startIso.slice(5, 7)) - 1,
      Number(startIso.slice(8, 10))
    )
  );
  while (dates.length < cap) {
    const iso = cursor.toISOString().split("T")[0];
    if (iso > untilIso) break;
    dates.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + step);
  }
  return dates;
}

/** Get Monday of the week containing the given date */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get Friday of the week containing the Monday */
export function getFriday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 4);
  return d;
}

/** Format a Monday date as a week label: "10 Mar – 14 Mar 2026" */
export function formatWeekLabel(monday: Date): string {
  const friday = getFriday(monday);
  const monthShort = (d: Date) =>
    d.toLocaleDateString("en-AU", { month: "short" });
  const day = (d: Date) => d.getDate();

  const sameMonth =
    monday.getMonth() === friday.getMonth() &&
    monday.getFullYear() === friday.getFullYear();

  if (sameMonth) {
    return `${day(monday)} – ${day(friday)} ${monthShort(friday)} ${friday.getFullYear()}`;
  }

  return `${day(monday)} ${monthShort(monday)} – ${day(friday)} ${monthShort(friday)} ${friday.getFullYear()}`;
}

/** Format "HH:mm" or "HH:mm:ss" to 12-hour: "9:00 AM" */
export function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":");
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

/**
 * Convert "HH:mm" time to a grid row index (1-based, row 1 = header).
 * 07:00 maps to row 2.
 */
export function timeToRow(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const slotIndex = (h - 7) * 2 + (m >= 30 ? 1 : 0);
  return slotIndex + 2; // +2 because row 1 is header
}

/** Duration in minutes to number of 30-min grid row spans */
export function durationToSpan(duration: number): number {
  return Math.max(1, Math.round(duration / 30));
}

/**
 * Convert "YYYY-MM-DD" to day of week number (1=Mon, 2=Tue, ..., 5=Fri).
 * Returns 0 for Sat/Sun.
 */
export function dateToDay(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const jsDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (jsDay === 0 || jsDay === 6) return 0;
  return jsDay; // 1=Mon ... 5=Fri
}

/** Format a date string "YYYY-MM-DD" to "Mon 10 Mar" */
export function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = DAY_LABELS[dateToDay(dateStr) - 1] ?? "";
  const dayNum = d.getDate();
  const month = d.toLocaleDateString("en-AU", { month: "short" });
  return `${dayName} ${dayNum} ${month}`;
}

/** Get dates for a week as YYYY-MM-DD strings (Mon through Fri) */
export function getWeekDates(monday: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(toLocalIso(d));
  }
  return dates;
}

/** Format "YYYY-MM-DD" as a local date string for display */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ============================================================
// Full-week (Mon–Sun) helpers — used by the staff roster grid.
// Kept separate from the Mon–Fri exports above so the calendar
// and list views (which assume a 5-day week) are unaffected.
// ============================================================

/** Day labels for the full 7-day staff grid header */
export const DAY_LABELS_FULL = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

/** Get dates for a full week as YYYY-MM-DD strings (Mon through Sun) */
export function getWeekDatesFull(monday: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(toLocalIso(d));
  }
  return dates;
}

/**
 * Format "YYYY-MM-DD" as a compact staff-grid column header: "Mon 6/7"
 * (weekday abbreviation + day/month, Australian order). Weekend-safe —
 * unlike `formatDayHeader`, which relies on `dateToDay` returning 0
 * for Sat/Sun.
 */
export function formatDayHeaderShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = d.toLocaleDateString("en-AU", { weekday: "short" });
  return `${dayName} ${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Format a total number of minutes as "HH:MM" (e.g. 285 → "04:45").
 * Used for per-coach, per-day, and weekly-total hour displays.
 */
export function formatHoursMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
