import { describe, it, expect } from "vitest";
import { planGrantAllocations, type GrantAppBalance } from "../auto-allocate";

function app(
  id: string,
  approved: number,
  used: number,
  end: string | null = null
): GrantAppBalance {
  return { id, amount_approved: approved, amount_used: used, funding_end_date: end };
}

describe("planGrantAllocations", () => {
  it("covers the whole invoice from a single grant with enough balance", () => {
    expect(planGrantAllocations(500, [app("a", 2000, 300)])).toEqual([
      { grantApplicationId: "a", amount: 500 },
    ]);
  });

  it("caps the allocation at the grant's remaining balance", () => {
    expect(planGrantAllocations(500, [app("a", 1000, 800)])).toEqual([
      { grantApplicationId: "a", amount: 200 },
    ]);
  });

  it("spends the soonest-expiring grant first, then spills over", () => {
    const plan = planGrantAllocations(700, [
      app("later", 1000, 0, "2026-12-31"),
      app("sooner", 500, 0, "2026-09-30"),
      app("open-ended", 1000, 0, null),
    ]);
    expect(plan).toEqual([
      { grantApplicationId: "sooner", amount: 500 },
      { grantApplicationId: "later", amount: 200 },
    ]);
  });

  it("skips exhausted or unapproved-amount grants", () => {
    const plan = planGrantAllocations(100, [
      app("empty", 500, 500),
      app("no-amount", 0, 0),
      app("live", 300, 0),
    ]);
    expect(plan).toEqual([{ grantApplicationId: "live", amount: 100 }]);
  });

  it("returns nothing for zero, negative, or NaN invoice amounts", () => {
    const apps = [app("a", 1000, 0)];
    expect(planGrantAllocations(0, apps)).toEqual([]);
    expect(planGrantAllocations(-50, apps)).toEqual([]);
    expect(planGrantAllocations(Number.NaN, apps)).toEqual([]);
  });

  it("returns nothing when the centre has no grants", () => {
    expect(planGrantAllocations(500, [])).toEqual([]);
  });

  it("keeps cents exact across splits", () => {
    const plan = planGrantAllocations(100.1, [
      app("a", 33.37, 0, "2026-08-01"),
      app("b", 1000, 0, "2026-09-01"),
    ]);
    expect(plan).toEqual([
      { grantApplicationId: "a", amount: 33.37 },
      { grantApplicationId: "b", amount: 66.73 },
    ]);
  });
});
