import { describe, it, expect } from "vitest";
import {
  serialiseToICS,
  formatICSDateTime,
  escapeICSText,
  foldLine,
  type CalendarEvent,
} from "../ics";

/**
 * RFC 5545 compliance tests for the hand-rolled .ics serializer.
 *
 * Each test focuses on one observable property of the spec so a regression
 * in any single rule (escaping, folding, structure) lights up immediately.
 */

const baseEvent: CalendarEvent = {
  uid: "session-abc-123",
  start: new Date("2026-06-18T10:00:00+10:00"),
  end: new Date("2026-06-18T11:00:00+10:00"),
  summary: "Soccer at Tiny Tots",
};

describe("serialiseToICS — single event round-trip", () => {
  it("emits a well-formed VCALENDAR with one VEVENT", () => {
    const ics = serialiseToICS([baseEvent], { name: "Coach feed" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//Build Alpha Kids//BAK-APP//EN");
    expect(ics).toContain("X-WR-CALNAME:Coach feed");
    expect(ics).toContain("X-WR-TIMEZONE:Australia/Sydney");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("UID:session-abc-123@buildalphakids.app");
    expect(ics).toContain("SUMMARY:Soccer at Tiny Tots");
    expect(ics).toContain("DTSTART;TZID=Australia/Sydney:20260618T100000");
    expect(ics).toContain("DTEND;TZID=Australia/Sydney:20260618T110000");
  });
});

describe("serialiseToICS — multiple events", () => {
  it("emits one VEVENT block per event in order", () => {
    const events: CalendarEvent[] = [
      { ...baseEvent, uid: "evt-1", summary: "First" },
      { ...baseEvent, uid: "evt-2", summary: "Second" },
      { ...baseEvent, uid: "evt-3", summary: "Third" },
    ];
    const ics = serialiseToICS(events, { name: "x" });
    const beginCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    const endCount = (ics.match(/END:VEVENT/g) ?? []).length;
    expect(beginCount).toBe(3);
    expect(endCount).toBe(3);
    // Order is preserved.
    const firstIdx = ics.indexOf("evt-1@buildalphakids.app");
    const secondIdx = ics.indexOf("evt-2@buildalphakids.app");
    const thirdIdx = ics.indexOf("evt-3@buildalphakids.app");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});

describe("foldLine — RFC 5545 line folding at 75 octets", () => {
  it("does not fold lines ≤75 bytes", () => {
    const line = "A".repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it("folds long ASCII lines with CRLF + space", () => {
    const line = "DESCRIPTION:" + "A".repeat(200);
    const folded = foldLine(line);
    // No segment between newlines should exceed 75 bytes.
    const segments = folded.split("\r\n");
    expect(segments.length).toBeGreaterThan(1);
    for (const seg of segments) {
      expect(seg.length).toBeLessThanOrEqual(75);
    }
    // Continuation lines start with a single space.
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].startsWith(" ")).toBe(true);
    }
  });

  it("does not split multi-byte UTF-8 sequences mid-codepoint", () => {
    // A long string of 3-byte UTF-8 emoji-ish glyphs (CJK "中" = 0xE4 0xB8 0xAD).
    const line = "X" + "中".repeat(40); // 1 + 40*3 = 121 bytes
    const folded = foldLine(line);
    const segments = folded.split("\r\n");
    // Each segment must round-trip through TextEncoder cleanly (no replacement chars).
    for (const seg of segments) {
      const stripped = seg.startsWith(" ") ? seg.slice(1) : seg;
      expect(stripped).not.toContain("�");
    }
  });
});

describe("escapeICSText — RFC 5545 §3.3.11", () => {
  it("escapes comma, semicolon, backslash and newline", () => {
    expect(escapeICSText("a,b")).toBe("a\\,b");
    expect(escapeICSText("a;b")).toBe("a\\;b");
    expect(escapeICSText("a\\b")).toBe("a\\\\b");
    expect(escapeICSText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeICSText("line1\r\nline2")).toBe("line1\\nline2");
    // Compound: backslash must be escaped first so we don't double-escape.
    expect(escapeICSText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("passes escaped text through serialiseToICS without corrupting separators", () => {
    const ics = serialiseToICS(
      [
        {
          ...baseEvent,
          summary: "Sport, with comma",
          description: "Line A\nLine B",
        },
      ],
      { name: "Feed; with semicolon" },
    );
    expect(ics).toContain("SUMMARY:Sport\\, with comma");
    expect(ics).toContain("DESCRIPTION:Line A\\nLine B");
    expect(ics).toContain("X-WR-CALNAME:Feed\\; with semicolon");
  });
});

describe("formatICSDateTime — DST spanning event", () => {
  it("emits Sydney local time for both AEST and AEDT events", () => {
    // 18 June 2026 — AEST (UTC+10). 10:00 Sydney = 00:00Z.
    const winter = new Date("2026-06-18T00:00:00Z");
    expect(formatICSDateTime(winter, "Australia/Sydney")).toBe(
      "20260618T100000",
    );
    // 18 April 2026 — by the spec the first Sunday of April is the DST end;
    // 18 April is comfortably AEST (UTC+10). 10:00 Sydney = 00:00Z.
    const april = new Date("2026-04-18T00:00:00Z");
    expect(formatICSDateTime(april, "Australia/Sydney")).toBe(
      "20260418T100000",
    );
    // Late January is AEDT (UTC+11). 10:00 Sydney = 23:00Z previous day.
    const summer = new Date("2026-01-20T23:00:00Z");
    expect(formatICSDateTime(summer, "Australia/Sydney")).toBe(
      "20260121T100000",
    );
  });
});

describe("UID stability", () => {
  it("preserves the input uid in the output verbatim", () => {
    const ics = serialiseToICS(
      [{ ...baseEvent, uid: "booking-stable-uid-1234" }],
      { name: "x" },
    );
    expect(ics).toContain("UID:booking-stable-uid-1234@buildalphakids.app");
  });
});

describe("Empty calendar", () => {
  it("emits a valid VCALENDAR with no VEVENT blocks", () => {
    const ics = serialiseToICS([], { name: "Empty" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics).not.toContain("END:VEVENT");
  });
});

describe("URL field", () => {
  it("includes URL line verbatim (no text escaping) when provided", () => {
    const ics = serialiseToICS(
      [
        {
          ...baseEvent,
          url: "https://buildalphakids.app/coach/schedule?session=abc-123&tab=today",
        },
      ],
      { name: "x" },
    );
    // URL is a URI type — the `&` and `?` MUST survive untouched. We also do
    // NOT escape commas/semicolons in URLs (calendar clients re-parse them).
    expect(ics).toContain(
      "URL:https://buildalphakids.app/coach/schedule?session=abc-123&tab=today",
    );
  });

  it("omits URL line when not provided", () => {
    const ics = serialiseToICS([baseEvent], { name: "x" });
    expect(ics).not.toContain("URL:");
  });
});
