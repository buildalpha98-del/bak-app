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

/**
 * The UTC offset Sydney is on for a given calendar date, as an ISO-8601
 * suffix: "+10:00" during AEST, "+11:00" during AEDT.
 *
 * Why this is not a constant: NSW observes daylight saving from the
 * first Sunday in October to the first Sunday in April, which swallows
 * BOTH the October and the December–January school-holiday clinic
 * seasons. Hardcoding "+10:00" — the obvious-looking move — silently
 * shifts most of the year's clinics an hour early in anything that
 * parses the timestamp (structured data, calendar feeds, iCal).
 *
 * The offset is read from the IANA database via Intl rather than
 * derived from the transition rules by hand, so a future change to
 * Australian DST arrives with the platform's tzdata instead of needing
 * a code change here.
 *
 * The date is anchored at 02:00 UTC — midday-ish in Sydney (12:00 AEST
 * / 13:00 AEDT), so the instant always lands on the intended Sydney
 * calendar date and never inside a DST transition window (transitions
 * happen at 02:00/03:00 local). This makes the offset a property of the
 * DATE, which is correct for clinics: they run in daylight hours, never
 * in the ambiguous or non-existent hour a transition creates.
 */
export function sydneyUtcOffset(dateIso: string): string {
  const instant = new Date(
    Date.UTC(
      Number(dateIso.slice(0, 4)),
      Number(dateIso.slice(5, 7)) - 1,
      Number(dateIso.slice(8, 10)),
      2
    )
  );
  const name = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName")?.value;

  // "GMT+11:00" → "+11:00". Sydney is never at GMT itself, so a bare
  // "GMT" (or anything unparseable) means the runtime's ICU data is not
  // what we think it is — fall back to standard time rather than emit a
  // malformed offset that would make the timestamp unparseable.
  const match = name?.match(/GMT([+-]\d{2}:\d{2})$/);
  return match ? match[1] : "+10:00";
}

/**
 * A Sydney-local date ("YYYY-MM-DD") + wall-clock time ("HH:MM" or
 * "HH:MM:SS") as an unambiguous ISO-8601 instant, e.g.
 * "2026-01-15T09:00:00+11:00". DST-correct via sydneyUtcOffset().
 */
export function sydneyIsoDateTime(dateIso: string, time: string): string {
  return `${dateIso}T${time.slice(0, 5)}:00${sydneyUtcOffset(dateIso)}`;
}
