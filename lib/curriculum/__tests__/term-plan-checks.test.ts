import { describe, it, expect } from "vitest";
import { structuralIssues, weekRange } from "../term-plan-checks";

const u = (title: string, strand: string, weeks: number[], codes: string[] = ["X"]) => ({
  title,
  strand,
  weeks,
  outcomes: codes.map((code) => ({ code })),
});

describe("structuralIssues (shared by the editor and the normaliser)", () => {
  it("passes a complete plan, including parallel strands", () => {
    expect(structuralIssues([u("Health", "PDH", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), u("Athletics", "PE", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])], 10)).toEqual([]);
    expect(structuralIssues([u("A", "Number", [1, 2, 3]), u("B", "Measurement", [4, 5, 6, 7]), u("C", "Number", [8, 9, 10])], 10)).toEqual([]);
  });

  it("flags gaps, same-strand overlaps (case-insensitive), overruns, missing outcomes and empty plans", () => {
    const issues = structuralIssues([u("A", "Physical education", [1, 2, 3]), u("B", "physical education", [3, 4, 11], [])], 10);
    expect(issues.map((i) => i.code).sort()).toEqual(["no_outcomes", "week_gap", "week_out_of_range", "week_overlap"]);
    expect(issues.find((i) => i.code === "week_gap")?.detail).toBe("No unit covers weeks 5, 6, 7, 8, 9, 10.");
    expect(structuralIssues([], 10).map((i) => i.code)).toEqual(["no_units"]);
  });
});

describe("weekRange", () => {
  it("builds a contiguous, clamped range in either order", () => {
    expect(weekRange(3, 5, 10)).toEqual([3, 4, 5]);
    expect(weekRange(5, 3, 10)).toEqual([3, 4, 5]);
    expect(weekRange(0, 12, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(weekRange(7, 7, 10)).toEqual([7]);
  });
});
