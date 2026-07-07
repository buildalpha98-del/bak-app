import { describe, it, expect } from "vitest";
import {
  sydneyTodayIso,
  sydneyWeekday,
  daysFromSydneyToday,
} from "../sydney-time";

// The whole point of these helpers: the same instant is a DIFFERENT
// calendar day in Sydney vs UTC around Sydney midnight. Fixed instants
// make that observable regardless of the machine's local timezone.

describe("sydneyTodayIso", () => {
  it("rolls to the next day at Sydney midnight while UTC lags behind", () => {
    // 2026-07-07T14:30:00Z = 2026-07-08T00:30 in Sydney (AEST +10)
    const instant = new Date("2026-07-07T14:30:00Z");
    expect(sydneyTodayIso(instant)).toBe("2026-07-08");
  });

  it("matches UTC date during the Sydney afternoon", () => {
    // 2026-07-07T04:00:00Z = 2026-07-07T14:00 in Sydney
    const instant = new Date("2026-07-07T04:00:00Z");
    expect(sydneyTodayIso(instant)).toBe("2026-07-07");
  });

  it("handles daylight saving (AEDT +11)", () => {
    // 2026-01-15T13:30:00Z = 2026-01-16T00:30 in Sydney (AEDT)
    const instant = new Date("2026-01-15T13:30:00Z");
    expect(sydneyTodayIso(instant)).toBe("2026-01-16");
  });
});

describe("sydneyWeekday", () => {
  it("reports Sydney's weekday, not UTC's", () => {
    // Sunday 14:30 UTC = Monday 00:30 Sydney
    const instant = new Date("2026-07-05T14:30:00Z");
    expect(sydneyWeekday(instant)).toBe("Mon");
  });
});

describe("daysFromSydneyToday", () => {
  it("returns 0 for Sydney-today even when UTC is still yesterday", () => {
    const instant = new Date("2026-07-07T14:30:00Z"); // Sydney: 8 Jul
    expect(daysFromSydneyToday("2026-07-08", instant)).toBe(0);
  });

  it("counts forward and backward correctly", () => {
    const instant = new Date("2026-07-07T04:00:00Z"); // Sydney: 7 Jul
    expect(daysFromSydneyToday("2026-07-10", instant)).toBe(3);
    expect(daysFromSydneyToday("2026-07-05", instant)).toBe(-2);
  });
});
