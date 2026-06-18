import { describe, it, expect } from "vitest";
import { computeDelta } from "../delta";

describe("computeDelta", () => {
  it("computes a positive diff and percent correctly", () => {
    const d = computeDelta(120, 100);
    expect(d.diff).toBe(20);
    expect(d.percent).toBeCloseTo(20, 5);
    expect(d.direction).toBe("up");
  });

  it("computes a negative diff and percent correctly", () => {
    const d = computeDelta(80, 100);
    expect(d.diff).toBe(-20);
    expect(d.percent).toBeCloseTo(-20, 5);
    expect(d.direction).toBe("down");
  });

  it("returns null percent when previous is 0", () => {
    const d = computeDelta(5, 0);
    expect(d.percent).toBeNull();
    expect(d.diff).toBe(5);
    expect(d.direction).toBe("up");
  });

  it("treats small percent moves as 'flat' under the threshold", () => {
    // 1004 / 1000 - 1 = 0.4% — below the 0.5% default threshold.
    const d = computeDelta(1004, 1000);
    expect(d.direction).toBe("flat");
    // Custom threshold flips it back to a directional move.
    const tightened = computeDelta(1004, 1000, { flatThreshold: 0.1 });
    expect(tightened.direction).toBe("up");
  });

  it("returns directions 'up' / 'down' / 'flat' on the right inputs", () => {
    expect(computeDelta(10, 5).direction).toBe("up");
    expect(computeDelta(5, 10).direction).toBe("down");
    expect(computeDelta(10, 10).direction).toBe("flat");
  });

  it("evaluates isGood correctly when goodDirection='down'", () => {
    // Churn dropping is good.
    const churnGood = computeDelta(40, 50, { goodDirection: "down" });
    expect(churnGood.direction).toBe("down");
    expect(churnGood.isGood).toBe(true);

    // Churn climbing is bad.
    const churnBad = computeDelta(60, 50, { goodDirection: "down" });
    expect(churnBad.direction).toBe("up");
    expect(churnBad.isGood).toBe(false);

    // Flat is treated as neutral/good (no alarm).
    const churnFlat = computeDelta(50, 50, { goodDirection: "down" });
    expect(churnFlat.direction).toBe("flat");
    expect(churnFlat.isGood).toBe(true);
  });
});
