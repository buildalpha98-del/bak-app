import { describe, it, expect } from "vitest";
import {
  toLocalIso,
  mondayOfIso,
  getWeekDates,
  getWeekDatesFull,
  formatDayHeaderShort,
  getMonday,
  buildRecurrenceDates,
} from "../roster";

// Regression tests for the Saturday-start roster grid: local-midnight
// Dates serialised via toISOString() (UTC) shift back a day in any
// timezone east of UTC. These fail under the old implementation when
// run with TZ=Australia/Sydney (the dev default) or on bom1 (UTC+5:30).

describe("toLocalIso", () => {
  it("round-trips a local-midnight date without a UTC shift", () => {
    const d = new Date("2026-07-13T00:00:00"); // Monday, local midnight
    expect(toLocalIso(d)).toBe("2026-07-13");
  });

  it("pads single-digit months and days", () => {
    expect(toLocalIso(new Date("2026-03-05T00:00:00"))).toBe("2026-03-05");
  });
});

describe("mondayOfIso", () => {
  it("maps a mid-week date to its Monday", () => {
    expect(mondayOfIso("2026-07-15")).toBe("2026-07-13"); // Wed → Mon
  });

  it("is a no-op for a Monday", () => {
    expect(mondayOfIso("2026-07-13")).toBe("2026-07-13");
  });

  it("puts Sunday in the week that began the previous Monday", () => {
    // The exact stale key the broken next-week navigation produced.
    expect(mondayOfIso("2026-07-19")).toBe("2026-07-13");
  });

  it("crosses month boundaries", () => {
    expect(mondayOfIso("2026-08-01")).toBe("2026-07-27"); // Sat → prior Mon
  });
});

describe("getWeekDates", () => {
  it("returns Mon–Fri of the given week with no timezone drift", () => {
    const monday = new Date("2026-07-13T00:00:00");
    expect(getWeekDates(monday)).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
    ]);
  });
});

describe("getWeekDatesFull", () => {
  it("returns Mon–Sun of the given week", () => {
    const monday = new Date("2026-07-13T00:00:00");
    const dates = getWeekDatesFull(monday);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-07-13");
    expect(dates[6]).toBe("2026-07-19");
  });
});

describe("formatDayHeaderShort", () => {
  it("renders day/month (Australian order), not month/day", () => {
    expect(formatDayHeaderShort("2026-07-18")).toBe("Sat 18/7");
    expect(formatDayHeaderShort("2026-07-13")).toBe("Mon 13/7");
  });
});

describe("buildRecurrenceDates", () => {
  it("repeats weekly up to and including the end date", () => {
    expect(buildRecurrenceDates("2026-07-15", "weekly", "2026-08-05")).toEqual([
      "2026-07-15",
      "2026-07-22",
      "2026-07-29",
      "2026-08-05",
    ]);
  });

  it("repeats fortnightly and stops before an off-cycle end date", () => {
    expect(
      buildRecurrenceDates("2026-07-15", "fortnightly", "2026-08-20")
    ).toEqual(["2026-07-15", "2026-07-29", "2026-08-12"]);
  });

  it("steps four-weekly across month boundaries without weekday drift", () => {
    expect(
      buildRecurrenceDates("2026-07-15", "four_weekly", "2026-10-10")
    ).toEqual(["2026-07-15", "2026-08-12", "2026-09-09", "2026-10-07"]);
  });

  it("returns just the start date when until equals start", () => {
    expect(buildRecurrenceDates("2026-07-15", "weekly", "2026-07-15")).toEqual([
      "2026-07-15",
    ]);
  });

  it("returns nothing for a backwards or malformed range", () => {
    expect(buildRecurrenceDates("2026-07-15", "weekly", "2026-07-01")).toEqual([]);
    expect(buildRecurrenceDates("bad", "weekly", "2026-08-01")).toEqual([]);
  });

  it("caps runaway ranges", () => {
    expect(
      buildRecurrenceDates("2026-01-01", "weekly", "2030-01-01").length
    ).toBe(26);
  });
});

describe("getMonday", () => {
  it("agrees with mondayOfIso for every day of a sample week", () => {
    for (let day = 13; day <= 19; day++) {
      const iso = `2026-07-${day}`;
      const viaDate = toLocalIso(getMonday(new Date(iso + "T00:00:00")));
      expect(viaDate).toBe(mondayOfIso(iso));
    }
  });
});
