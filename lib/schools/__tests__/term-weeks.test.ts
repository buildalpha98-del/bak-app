import { describe, it, expect } from "vitest";
import { termWeeks, weekNumberFor, weekStartFor } from "../term-weeks";

// Term 3 2026 as seeded: Mon 20 Jul → Fri 25 Sep.
const START = "2026-07-20";
const END = "2026-09-25";

describe("termWeeks", () => {
  it("counts ten weeks from the term start, the last one clipped to the end", () => {
    const weeks = termWeeks(START, END);
    expect(weeks).toHaveLength(10);
    expect(weeks[0]).toEqual({ weekNumber: 1, weekStart: "2026-07-20", weekEnd: "2026-07-26" });
    expect(weeks[9]).toEqual({ weekNumber: 10, weekStart: "2026-09-21", weekEnd: "2026-09-25" });
  });
});

describe("weekNumberFor / weekStartFor", () => {
  it("matches the Scope & Sequence's week arithmetic", () => {
    expect(weekNumberFor(START, END, "2026-07-20")).toBe(1);
    expect(weekNumberFor(START, END, "2026-07-26")).toBe(1);
    expect(weekNumberFor(START, END, "2026-08-05")).toBe(3);
    expect(weekNumberFor(START, END, "2026-09-23")).toBe(10);
    expect(weekStartFor(START, END, "2026-09-23")).toBe("2026-09-21");
  });
  it("is null outside the term", () => {
    expect(weekNumberFor(START, END, "2026-07-19")).toBeNull();
    expect(weekNumberFor(START, END, "2026-09-26")).toBeNull();
    expect(weekStartFor(START, END, "2026-12-01")).toBeNull();
  });
});
