/**
 * Pure iCalendar (RFC 5545) serializer.
 *
 * Hand-rolled because the format is plain text and bringing in `ical-generator`
 * or `ics` just for this would mean shipping extra deps to client bundles or
 * polyfilling node-only deps in the edge runtime.
 *
 * What we implement from RFC 5545:
 *  - VCALENDAR / VEVENT structure
 *  - CRLF line terminators (the spec requires \r\n, not \n)
 *  - Line folding at 75 octets (long lines split with CRLF + space)
 *  - Text escaping for `,` `;` `\` and newlines inside TEXT-type fields
 *  - DTSTART/DTEND with floating local time + explicit TZID (no VTIMEZONE block —
 *    Apple Calendar / Google / Outlook all accept `TZID=Australia/Sydney` as a
 *    reference to the embedded Olson zone)
 *
 * What we explicitly DON'T do:
 *  - VALARM / VTIMEZONE blocks (Apple/Google fill these from TZID)
 *  - Recurrence rules (each event is materialised already)
 *  - Attendees / organiser
 */

export interface CalendarEvent {
  /** Stable unique id. Used to build `UID:<uid>@buildalphakids.app`. */
  uid: string;
  /** Either a `Date` object or an ISO-ish string parseable by `new Date()`. */
  start: Date | string;
  /** Either a `Date` object or an ISO-ish string parseable by `new Date()`. */
  end: Date | string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
}

export interface SerialiseOptions {
  /** Calendar display name (shown as the feed title in Apple/Google Calendar). */
  name: string;
}

// ============================================================
// 1. Date formatting
// ============================================================

/**
 * Format a `Date` as `YYYYMMDDTHHmmss` in Sydney local time, ready to pair
 * with a `TZID=Australia/Sydney` parameter on DTSTART/DTEND.
 *
 * We use `Intl.DateTimeFormat` with the explicit zone so DST is handled by
 * the JS runtime, not by us. (April session at 10:00am local → emits
 * `20260418T100000` whether we're in AEST or AEDT.)
 */
export function formatICSDateTime(
  date: Date,
  tz: "Australia/Sydney",
): string {
  // Intl gives us locale-aware parts; we ask for en-GB to get day-month-year
  // ordering and 2-digit padding without locale surprises.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  // `Intl` may emit "24" for midnight on some Node versions — normalise to "00".
  const hour = map.hour === "24" ? "00" : map.hour;
  return `${map.year}${map.month}${map.day}T${hour}${map.minute}${map.second}`;
}

/** Same as above but in UTC and with a trailing Z — used for DTSTAMP. */
function formatICSDateTimeUTC(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

// ============================================================
// 2. RFC 5545 text escaping + line folding
// ============================================================

/**
 * Escape per RFC 5545 §3.3.11 (TEXT value type):
 *   backslash → \\
 *   newline   → \n
 *   semicolon → \;
 *   comma     → \,
 * The order matters — escape backslash first so we don't double-escape the
 * backslashes we just emitted.
 */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Fold a content line per RFC 5545 §3.1: lines SHOULD NOT exceed 75 octets,
 * any continuation line MUST start with a single whitespace character.
 *
 * We measure in UTF-8 bytes (octets), not characters — a multibyte glyph at
 * byte 74 must not be split.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const decoder = new TextDecoder("utf-8");
  const parts: string[] = [];
  let cursor = 0;
  let isFirst = true;
  while (cursor < bytes.length) {
    // First chunk gets the full 75 bytes; subsequent chunks have a leading
    // space that counts toward the line length, so they get 74 bytes of payload.
    const chunkLimit = isFirst ? 75 : 74;
    let end = Math.min(cursor + chunkLimit, bytes.length);

    // Don't split a multi-byte UTF-8 sequence: continuation bytes start with 10xxxxxx.
    while (end < bytes.length && (bytes[end] & 0b11000000) === 0b10000000) {
      end -= 1;
    }

    const slice = bytes.slice(cursor, end);
    parts.push((isFirst ? "" : " ") + decoder.decode(slice));
    cursor = end;
    isFirst = false;
  }
  return parts.join("\r\n");
}

function emitLine(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function emitLineWithParams(
  name: string,
  params: Record<string, string>,
  value: string,
): string {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
  return foldLine(`${name};${paramStr}:${value}`);
}

// ============================================================
// 3. Public serializer
// ============================================================

/**
 * Serialise events into a complete VCALENDAR. Output uses CRLF line endings
 * (required by RFC 5545; both Apple Calendar and Google Calendar accept the
 * file regardless, but `webcal://` clients can be strict).
 */
export function serialiseToICS(
  events: CalendarEvent[],
  opts: SerialiseOptions,
): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Build Alpha Kids//BAK-APP//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(emitLine("X-WR-CALNAME", escapeICSText(opts.name)));
  lines.push("X-WR-TIMEZONE:Australia/Sydney");

  const now = new Date();
  const dtstamp = formatICSDateTimeUTC(now);

  for (const event of events) {
    const start = toDate(event.start);
    const end = toDate(event.end);
    lines.push("BEGIN:VEVENT");
    lines.push(emitLine("UID", `${event.uid}@buildalphakids.app`));
    lines.push(emitLine("DTSTAMP", dtstamp));
    lines.push(
      emitLineWithParams(
        "DTSTART",
        { TZID: "Australia/Sydney" },
        formatICSDateTime(start, "Australia/Sydney"),
      ),
    );
    lines.push(
      emitLineWithParams(
        "DTEND",
        { TZID: "Australia/Sydney" },
        formatICSDateTime(end, "Australia/Sydney"),
      ),
    );
    lines.push(emitLine("SUMMARY", escapeICSText(event.summary)));
    if (event.description) {
      lines.push(emitLine("DESCRIPTION", escapeICSText(event.description)));
    }
    if (event.location) {
      lines.push(emitLine("LOCATION", escapeICSText(event.location)));
    }
    if (event.url) {
      // URL property: per RFC 5545 §3.8.4.6 it's a URI type, not TEXT, so
      // commas and semicolons inside the URL are valid syntactic chars and
      // MUST NOT be escaped — calendars rely on `?a=1&b=2` etc. parsing intact.
      lines.push(emitLine("URL", event.url));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // RFC 5545 requires CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}
