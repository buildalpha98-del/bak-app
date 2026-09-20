import { describe, it, expect } from "vitest";
import { scopeClasses, isClassScoped, canRateChild } from "../assessment-scope";

const classes = [{ id: "kb" }, { id: "2r" }, { id: "4t" }];

describe("scopeClasses", () => {
  it("returns every class for an unscoped user (principal, colleague)", () => {
    expect(scopeClasses(classes, [])).toEqual(classes);
    expect(scopeClasses(classes, null)).toEqual(classes);
    expect(scopeClasses(classes, undefined)).toEqual(classes);
  });

  it("keeps only a teacher's classes", () => {
    expect(scopeClasses(classes, ["4t", "kb"]).map((c) => c.id)).toEqual(["kb", "4t"]);
  });

  it("yields nothing when the scoped classes no longer exist", () => {
    expect(scopeClasses(classes, ["gone"])).toEqual([]);
  });
});

describe("isClassScoped / canRateChild", () => {
  it("unscoped users may rate any child", () => {
    expect(isClassScoped([])).toBe(false);
    expect(canRateChild([], [])).toBe(true);
  });

  it("a teacher may rate only children in one of their classes", () => {
    expect(isClassScoped(["kb"])).toBe(true);
    expect(canRateChild(["kb"], ["kb"])).toBe(true);
    expect(canRateChild(["kb"], ["2r"])).toBe(false);
    expect(canRateChild(["kb"], [])).toBe(false);
  });
});
