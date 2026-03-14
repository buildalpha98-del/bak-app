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
    dates.push(d.toISOString().split("T")[0]);
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
