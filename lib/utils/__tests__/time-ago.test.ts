import { describe, it, expect } from "vitest";
import {
  formatTimeAgo,
  formatAbsoluteDate,
  formatAbsoluteDateTime,
} from "../time-ago";

// A fixed instant: 2026-07-16 10:00 Sydney == 2026-07-16 00:00 UTC.
const NOW = new Date("2026-07-16T00:00:00Z").getTime();
const at = (isoUtc: string) => new Date(isoUtc).toISOString();

describe("formatTimeAgo", () => {
  it("says 'just now' under a minute", () => {
    expect(formatTimeAgo(at("2026-07-16T00:00:00Z"), NOW)).toBe("just now");
    expect(formatTimeAgo(at("2026-07-15T23:59:31Z"), NOW)).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatTimeAgo(at("2026-07-15T23:55:00Z"), NOW)).toBe("5m ago");
    expect(formatTimeAgo(at("2026-07-15T21:00:00Z"), NOW)).toBe("3h ago");
    expect(formatTimeAgo(at("2026-07-14T00:00:00Z"), NOW)).toBe("2d ago");
  });

  it("falls back to an absolute date past 30 days", () => {
    // Not "31d ago" — beyond a month, the date itself is more useful.
    // en-AU renders month:"short" as "June", not "Jun".
    expect(formatTimeAgo(at("2026-06-01T00:00:00Z"), NOW)).toBe("1 June");
  });

  // The whole point of taking `now` as a parameter: the same inputs
  // must always give the same answer. Reading the clock inside the
  // formatter is what made the server and client disagree (React #418).
  it("is a pure function of its inputs", () => {
    const a = formatTimeAgo(at("2026-07-15T23:00:00Z"), NOW);
    const b = formatTimeAgo(at("2026-07-15T23:00:00Z"), NOW);
    expect(a).toBe(b);
    expect(a).toBe("1h ago");
  });

  it("crosses the minute boundary exactly once", () => {
    expect(formatTimeAgo(at("2026-07-15T23:59:00Z"), NOW)).toBe("1m ago");
    expect(formatTimeAgo(at("2026-07-15T23:59:01Z"), NOW)).toBe("just now");
  });
});

describe("absolute formatters", () => {
  // 23:30 UTC on the 15th is already 09:30 on the 16th in Sydney.
  // Formatting in the runtime's zone would print "15 Jul" on the server
  // and "16 Jul" in the browser — the mismatch these avoid.
  it("formats in Sydney, not the runtime's timezone", () => {
    expect(formatAbsoluteDate("2026-07-15T23:30:00Z")).toBe("16 July");
  });

  it("gives a full Sydney timestamp for the tooltip", () => {
    expect(formatAbsoluteDateTime("2026-07-15T23:30:00Z")).toContain("16 July");
  });
});
