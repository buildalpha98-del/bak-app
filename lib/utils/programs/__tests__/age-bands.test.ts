import { describe, it, expect } from "vitest";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  formatAgeBands,
  isValidAgeBand,
  validateAgeBands,
  type AgeBand,
} from "../age-bands";

describe("AGE_BANDS", () => {
  it("exposes 3-5, 5-8, 8-12 in order", () => {
    expect(AGE_BANDS).toEqual(["3-5", "5-8", "8-12"]);
  });
});

describe("AGE_BAND_LABELS", () => {
  it("renders human-readable labels", () => {
    expect(AGE_BAND_LABELS["3-5"]).toBe("3–5 years (Early Childhood)");
    expect(AGE_BAND_LABELS["5-8"]).toBe("5–8 years (Junior)");
    expect(AGE_BAND_LABELS["8-12"]).toBe("8–12 years (Senior)");
  });
});

describe("isValidAgeBand", () => {
  it("returns true for the three valid bands", () => {
    expect(isValidAgeBand("3-5")).toBe(true);
    expect(isValidAgeBand("5-8")).toBe(true);
    expect(isValidAgeBand("8-12")).toBe(true);
  });

  it("returns false for unknown bands", () => {
    expect(isValidAgeBand("0-3")).toBe(false);
    expect(isValidAgeBand("")).toBe(false);
    expect(isValidAgeBand("3-5 ")).toBe(false);
  });
});

describe("validateAgeBands", () => {
  it("ok for one valid band", () => {
    const result = validateAgeBands(["3-5"]);
    expect(result.ok).toBe(true);
  });

  it("ok for multiple valid bands", () => {
    const result = validateAgeBands(["3-5", "5-8"]);
    expect(result.ok).toBe(true);
  });

  it("rejects empty array", () => {
    const result = validateAgeBands([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least one/i);
  });

  it("rejects unknown bands", () => {
    const result = validateAgeBands(["3-5", "0-3"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/0-3/);
  });

  it("rejects duplicate bands", () => {
    const result = validateAgeBands(["3-5", "3-5"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/duplicate/i);
  });
});

describe("formatAgeBands", () => {
  it("joins one band as-is", () => {
    expect(formatAgeBands(["3-5"])).toBe("3–5 years (Early Childhood)");
  });

  it("joins multiple bands with comma", () => {
    expect(formatAgeBands(["3-5", "5-8"])).toBe(
      "3–5 years (Early Childhood), 5–8 years (Junior)",
    );
  });

  it("returns 'No bands selected' for empty array", () => {
    expect(formatAgeBands([])).toBe("No bands selected");
  });
});
