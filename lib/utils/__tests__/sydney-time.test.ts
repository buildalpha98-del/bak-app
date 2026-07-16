import { describe, it, expect } from "vitest";
import {
  sydneyTodayIso,
  sydneyWeekday,
  daysFromSydneyToday,
  minutesUntilSydney,
  sydneyUtcOffset,
  sydneyIsoDateTime,
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

// ------------------------------------------------------------
// sydneyUtcOffset / sydneyIsoDateTime
// ------------------------------------------------------------
//
// NSW runs daylight saving from the first Sunday in October to the
// first Sunday in April. A hardcoded "+10:00" is correct for winter and
// wrong for the October and December–January school-holiday seasons —
// i.e. wrong for most of the clinic calendar. These cases are what stop
// that regression.

describe("sydneyUtcOffset", () => {
  it("returns AEST +10:00 in winter", () => {
    expect(sydneyUtcOffset("2026-07-21")).toBe("+10:00");
  });

  it("returns AEDT +11:00 in January", () => {
    expect(sydneyUtcOffset("2026-01-15")).toBe("+11:00");
  });

  it("returns AEDT +11:00 in October, once DST has begun", () => {
    expect(sydneyUtcOffset("2026-10-06")).toBe("+11:00");
  });

  it("flips to +11:00 on the first Sunday in October (DST start)", () => {
    // 2026-10-04 is the first Sunday; DST begins at 02:00 local.
    expect(sydneyUtcOffset("2026-10-03")).toBe("+10:00");
    expect(sydneyUtcOffset("2026-10-04")).toBe("+11:00");
  });

  it("flips to +10:00 on the first Sunday in April (DST end)", () => {
    // 2026-04-05 is the first Sunday; DST ends at 03:00 local.
    expect(sydneyUtcOffset("2026-04-04")).toBe("+11:00");
    expect(sydneyUtcOffset("2026-04-05")).toBe("+10:00");
  });

  it("tracks the transition dates moving year to year", () => {
    // 2027's first Sunday in October is the 3rd, not the 4th — a rule
    // encoded by hand as a fixed date would drift here.
    expect(sydneyUtcOffset("2027-10-02")).toBe("+10:00");
    expect(sydneyUtcOffset("2027-10-03")).toBe("+11:00");
  });
});

describe("sydneyIsoDateTime", () => {
  it("combines a Sydney date and wall-clock time into an ISO instant", () => {
    expect(sydneyIsoDateTime("2026-07-21", "09:00:00")).toBe(
      "2026-07-21T09:00:00+10:00"
    );
  });

  it("carries the AEDT offset for a summer date", () => {
    expect(sydneyIsoDateTime("2026-01-15", "09:00:00")).toBe(
      "2026-01-15T09:00:00+11:00"
    );
  });

  it("accepts HH:MM as well as HH:MM:SS", () => {
    expect(sydneyIsoDateTime("2026-07-21", "15:30")).toBe(
      "2026-07-21T15:30:00+10:00"
    );
  });

  it("round-trips through Date to the correct UTC instant", () => {
    // 09:00 AEDT is 22:00 UTC the day before.
    expect(new Date(sydneyIsoDateTime("2026-01-15", "09:00")).toISOString()).toBe(
      "2026-01-14T22:00:00.000Z"
    );
  });
});
