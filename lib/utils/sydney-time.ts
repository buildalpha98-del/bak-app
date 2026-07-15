// ============================================================
// Sydney-anchored date helpers
// ============================================================
//
// The business runs on NSW time; the servers do not (Vercel functions
// are pinned to bom1, UTC+5:30, to sit next to the Supabase DB).
// Any "what day is it" logic that uses new Date()/toISOString gets
// the SERVER's day, which around midnight differs from Sydney's by
// hours in either direction. Every day-boundary calculation must go
// through these helpers instead.

export const SYDNEY_TZ = "Australia/Sydney";

/** Today's date in Sydney as "YYYY-MM-DD". */
export function sydneyTodayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Sydney weekday short name ("Mon".."Sun") for a given instant. */
export function sydneyWeekday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    weekday: "short",
  }).format(now);
}

/** Current Sydney wall-clock time as minutes since midnight. */
export function sydneyMinutesNow(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Minutes from Sydney-now until a session's Sydney-local start
 * ("YYYY-MM-DD" + "HH:MM" or "HH:MM:SS"). Positive = session is in
 * the future, negative = already started. DST-safe because both sides
 * are computed as Sydney wall-clock values, never via server-local
 * Date parsing.
 */
export function minutesUntilSydney(
  dateIso: string,
  time: string,
  now: Date = new Date()
): number {
  const dayDiff = daysFromSydneyToday(dateIso, now);
  const startMinutes =
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return dayDiff * 24 * 60 + startMinutes - sydneyMinutesNow(now);
}

/**
 * Whole days from Sydney-today until a "YYYY-MM-DD" date.
 * 0 = today, 1 = tomorrow, negative = past.
 */
export function daysFromSydneyToday(
  dateIso: string,
  now: Date = new Date()
): number {
  const today = sydneyTodayIso(now);
  const a = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  const b = Date.UTC(
    Number(dateIso.slice(0, 4)),
    Number(dateIso.slice(5, 7)) - 1,
    Number(dateIso.slice(8, 10))
  );
  return Math.round((b - a) / 86_400_000);
}
