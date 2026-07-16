import { describe, it, expect } from "vitest";
import { formatStatValue } from "../stats";

describe("formatStatValue", () => {
  it("formats a plain number with en-AU grouping", () =>
    expect(formatStatValue(1200)).toBe("1,200"));

  it("appends a + suffix when asked", () =>
    expect(formatStatValue(1200, { plus: true })).toBe("1,200+"));

  it("unwraps the { value: n } jsonb shape", () =>
    expect(formatStatValue({ value: 42 }, { plus: true })).toBe("42+"));

  it("accepts numeric strings", () =>
    expect(formatStatValue("350")).toBe("350"));

  it("rounds fractional values", () =>
    expect(formatStatValue(4.6)).toBe("5"));

  it("rejects zero (a zero stat reads as broken, not impressive)", () =>
    expect(formatStatValue(0)).toBeNull());

  it("rejects negatives", () => expect(formatStatValue(-3)).toBeNull());

  it("rejects non-numeric junk", () => {
    expect(formatStatValue("soon")).toBeNull();
    expect(formatStatValue(null)).toBeNull();
    expect(formatStatValue(undefined)).toBeNull();
    expect(formatStatValue({ value: "NaN" })).toBeNull();
    expect(formatStatValue(Number.NaN)).toBeNull();
  });
});
