import { describe, it, expect } from "vitest";
import {
  projectWeekCost,
  type PricedSession,
} from "../cost-projection";

function s(overrides: Partial<PricedSession> = {}): PricedSession {
  return {
    sessionId: "sess-1",
    coachId: "coach-1",
    coachName: "Test Coach",
    durationMinutes: 45,
    amount: 50,
    ...overrides,
  };
}

describe("projectWeekCost", () => {
  it("returns all-zero summary for an empty week", () => {
    const result = projectWeekCost([]);
    expect(result).toEqual({
      totalCost: 0,
      totalHours: 0,
      pricedSessions: 0,
      unpricedSessions: 0,
      unassignedSessions: 0,
      byCoach: [],
    });
  });

  it("sums cost and hours across one coach's sessions", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", durationMinutes: 45, amount: 50 }),
      s({ sessionId: "2", durationMinutes: 60, amount: 70 }),
    ]);
    expect(result.totalCost).toBe(120);
    expect(result.totalHours).toBeCloseTo(1.75, 2);
    expect(result.pricedSessions).toBe(2);
    expect(result.byCoach).toHaveLength(1);
    expect(result.byCoach[0]).toMatchObject({
      coachId: "coach-1",
      sessions: 2,
      cost: 120,
    });
  });

  it("groups by coach and sorts byCoach descending by cost", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", coachId: "a", coachName: "Alex", amount: 30 }),
      s({ sessionId: "2", coachId: "b", coachName: "Bea", amount: 80 }),
      s({ sessionId: "3", coachId: "a", coachName: "Alex", amount: 30 }),
      s({ sessionId: "4", coachId: "c", coachName: "Cam", amount: 50 }),
    ]);
    expect(result.byCoach.map((c) => c.coachId)).toEqual(["b", "a", "c"]);
    expect(result.byCoach.find((c) => c.coachId === "a")?.cost).toBe(60);
    expect(result.totalCost).toBe(190);
  });

  it("counts unassigned sessions separately from unpriced", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", coachId: null, coachName: null, amount: null }),
      s({ sessionId: "2", coachId: null, coachName: null, amount: null }),
      s({ sessionId: "3", amount: null }), // assigned but no rate
    ]);
    expect(result.unassignedSessions).toBe(2);
    expect(result.unpricedSessions).toBe(1);
    expect(result.totalCost).toBe(0);
    expect(result.byCoach).toHaveLength(1);
    expect(result.byCoach[0].cost).toBe(0);
  });

  it("includes unpriced sessions in coach hours but with zero cost contribution", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", durationMinutes: 60, amount: 50 }),
      s({ sessionId: "2", durationMinutes: 30, amount: null }),
    ]);
    expect(result.totalHours).toBeCloseTo(1.5, 2);
    expect(result.totalCost).toBe(50);
    expect(result.byCoach[0].sessions).toBe(2);
    expect(result.byCoach[0].cost).toBe(50);
    expect(result.byCoach[0].hours).toBeCloseTo(1.5, 2);
  });

  it("handles a fully unassigned week (open shifts only)", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", coachId: null, coachName: null, amount: null }),
      s({ sessionId: "2", coachId: null, coachName: null, amount: null }),
    ]);
    expect(result.totalCost).toBe(0);
    expect(result.totalHours).toBe(0);
    expect(result.unassignedSessions).toBe(2);
    expect(result.byCoach).toHaveLength(0);
  });

  it("rounds totalCost to two decimals (no float drift)", () => {
    const result = projectWeekCost([
      s({ sessionId: "1", amount: 33.33 }),
      s({ sessionId: "2", amount: 33.33 }),
      s({ sessionId: "3", amount: 33.34 }),
    ]);
    expect(result.totalCost).toBe(100);
  });

  it("falls back to '(unknown)' when coachName is null but coachId is set", () => {
    const result = projectWeekCost([
      s({ coachId: "ghost", coachName: null }),
    ]);
    expect(result.byCoach[0].coachName).toBe("(unknown)");
  });

  it("multi-coach session produces one byCoach row per assigned coach (per-rate-summed)", () => {
    // Same session, two coaches. The caller (cost-actions.ts) has
    // already priced each (session, coach) pair at that coach's rate.
    const result = projectWeekCost([
      s({ sessionId: "shift-A", coachId: "u1", coachName: "Alice", amount: 100, durationMinutes: 60 }),
      s({ sessionId: "shift-A", coachId: "u2", coachName: "Bob",   amount:  80, durationMinutes: 60 }),
    ]);
    expect(result.byCoach).toHaveLength(2);
    expect(result.byCoach).toContainEqual(
      expect.objectContaining({ coachId: "u1", cost: 100, hours: 1, sessions: 1 })
    );
    expect(result.byCoach).toContainEqual(
      expect.objectContaining({ coachId: "u2", cost: 80, hours: 1, sessions: 1 })
    );
    expect(result.totalCost).toBe(180);
    // Total hours double-counts a multi-coach shift on purpose — the
    // chip surfaces coach-hours, which is the labour figure ops cares
    // about (two coaches each working an hour = 2 coach-hours).
    expect(result.totalHours).toBe(2);
  });
});
