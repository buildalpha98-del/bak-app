import { describe, it, expect } from "vitest";
import {
  sydneyTodayIso,
  sydneyWeekday,
  daysFromSydneyToday,
  minutesUntilSydney,
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

describe("minutesUntilSydney", () => {
  it("counts down to a same-day session start", () => {
    // 2026-07-07T04:00:00Z = Sydney 7 Jul 14:00 → 15:00 start is 60 min out
    const instant = new Date("2026-07-07T04:00:00Z");
    expect(minutesUntilSydney("2026-07-07", "15:00", instant)).toBe(60);
  });

  it("goes negative once the session has started", () => {
    const instant = new Date("2026-07-07T04:00:00Z"); // Sydney 14:00
    expect(minutesUntilSydney("2026-07-07", "13:30", instant)).toBe(-30);
  });

  it("accepts HH:MM:SS times", () => {
    const instant = new Date("2026-07-07T04:00:00Z"); // Sydney 14:00
    expect(minutesUntilSydney("2026-07-07", "14:25:00", instant)).toBe(25);
  });

  it("spans day boundaries using Sydney's calendar, not UTC's", () => {
    // 2026-07-07T14:30:00Z = Sydney 8 Jul 00:30; a 9:00 session that
    // Sydney-day is 510 min away, while UTC still thinks it's 7 Jul.
    const instant = new Date("2026-07-07T14:30:00Z");
    expect(minutesUntilSydney("2026-07-08", "09:00", instant)).toBe(510);
  });

  it("handles daylight saving (AEDT +11)", () => {
    // 2026-01-15T22:00:00Z = Sydney 16 Jan 09:00 AEDT → 09:30 is 30 min out
    const instant = new Date("2026-01-15T22:00:00Z");
    expect(minutesUntilSydney("2026-01-16", "09:30", instant)).toBe(30);
  });
});
