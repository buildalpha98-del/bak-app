import { describe, expect, it } from "vitest";
import {
  defaultSelected,
  holidaysWithin,
  inferWeeklyPattern,
  isoDow,
  mondayOf,
  plannedSessionDates,
  termWeekMondays,
  type SourceSession,
} from "../term-setup";

const s = (o: Partial<SourceSession> & { date: string }): SourceSession => ({
  centre_id: "liverpool",
  centre_name: "Al Bayan Liverpool",
  time: "11:30:00",
  duration_minutes: 60,
  sport: "Multi-Sport",
  status: "completed",
  coach_id: "abz",
  coach_name: "Abz",
  school_class_ids: null,
  ...o,
});
// Term 3 2026: ten Wednesdays from 22 Jul.
const wednesdays = Array.from({ length: 10 }, (_, i) => `2026-07-${22 + i * 7}`.replace(/-(\d)$/, "-0$1"))
  .map((d) => (d > "2026-07-31" ? null : d))
  .filter((d): d is string => !!d)
  .concat(["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"]);

describe("dates", () => {
  it("ISO weekday and Monday", () => {
    expect(isoDow("2026-07-22")).toBe(3);
    expect(isoDow("2026-07-26")).toBe(7);
    expect(mondayOf("2026-07-22")).toBe("2026-07-20");
    expect(mondayOf("2026-07-20")).toBe("2026-07-20");
  });
});

describe("inferWeeklyPattern", () => {
  it("finds the weekly slot, its usual coach, and how regular it was", () => {
    const rows = wednesdays.map((date, i) => s({ date, coach_id: i === 3 ? "rami" : "abz", coach_name: i === 3 ? "Rami" : "Abz" }));
    const [slot] = inferWeeklyPattern(rows);
    expect(slot).toMatchObject({
      centre_id: "liverpool",
      day_of_week: 3,
      time: "11:30",
      sport: "Multi-Sport",
      coach_id: "abz",
      weeks_seen: 10,
      weeks_in_term: 10,
      confidence: "regular",
      flags: [],
    });
    expect(defaultSelected(slot)).toBe(true);
  });

  it("a one-off is occasional and unticked; cancelled sessions do not count", () => {
    const rows = [...wednesdays.map((date) => s({ date })), s({ date: "2026-08-18", time: "09:00:00", sport: "Yoga" }), s({ date: "2026-08-25", time: "09:00:00", sport: "Yoga", status: "cancelled" })];
    const yoga = inferWeeklyPattern(rows).find((e) => e.sport === "Yoga")!;
    expect(yoga).toMatchObject({ weeks_seen: 1, confidence: "occasional" });
    expect(defaultSelected(yoga)).toBe(false);
  });

  it("flags a 02:30 typo, a weekend, and an all-day block", () => {
    const rows = [
      s({ date: "2026-08-05", time: "02:30:00" }),
      s({ date: "2026-08-12", time: "02:30:00" }),
      s({ date: "2026-08-08", time: "09:00:00", sport: "Athletics" }), // Saturday
      s({ date: "2026-08-04", time: "08:30:00", duration_minutes: 420, sport: "Carnival" }),
    ];
    const by = Object.fromEntries(inferWeeklyPattern(rows).map((e) => [e.sport + e.time, e.flags]));
    expect(by["Multi-Sport02:30"]).toEqual(["odd_time"]);
    expect(by["Athletics09:00"]).toEqual(["weekend"]);
    expect(by["Carnival08:30"]).toEqual(["long"]);
  });

  it("keeps the class list a school session usually targets", () => {
    const rows = wednesdays.map((date, i) => s({ date, school_class_ids: i < 8 ? ["4T", "6M"] : ["4T"] }));
    expect(inferWeeklyPattern(rows)[0].school_class_ids).toEqual(["4T", "6M"]);
  });
});

describe("generation calendar", () => {
  it("lists the weeks a term touches and the public holidays inside it", () => {
    expect(termWeekMondays("2026-10-12", "2026-12-17")).toHaveLength(10);
    // Term 1 2027 starts on a Wednesday: its first Monday is the 25th.
    expect(termWeekMondays("2027-01-27", "2027-04-09")[0]).toBe("2027-01-25");
    expect(holidaysWithin("2027-01-27", "2027-04-09").map((h) => h.name)).toEqual(["Good Friday", "Easter Monday"]);
    expect(holidaysWithin("2026-10-12", "2026-12-17")).toEqual([]);
  });

  it("plans one session per template per week, clipped to the term, minus skips and what exists", () => {
    const templates = [
      { id: "mon", day_of_week: 1 },
      { id: "fri", day_of_week: 5 },
    ];
    const term = { start_date: "2027-01-27", end_date: "2027-04-09" }; // Wed → Fri, 11 weeks
    const planned = plannedSessionDates(templates, term, ["2027-03-26", "2027-03-29"], ["mon_2027-02-01"]);
    const mondays = planned.filter((p) => p.template_id === "mon").map((p) => p.date);
    const fridays = planned.filter((p) => p.template_id === "fri").map((p) => p.date);
    expect(mondays[0]).toBe("2027-02-08"); // 25 Jan is before the term; 1 Feb already exists
    expect(mondays).not.toContain("2027-03-29"); // Easter Monday
    expect(fridays).not.toContain("2027-03-26"); // Good Friday
    expect(fridays).toContain("2027-01-29");
    expect(fridays.at(-1)).toBe("2027-04-09");
    expect(mondays).toHaveLength(11 - 1 - 1 - 1); // 11 Mondays − before term − exists − holiday
  });
});
