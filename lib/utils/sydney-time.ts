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

const SYDNEY_TZ = "Australia/Sydney";

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
