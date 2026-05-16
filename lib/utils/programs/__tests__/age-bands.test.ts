import { describe, it, expect } from "vitest";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  formatAgeBands,
  formatProgramAgeBandsShort,
  formatProgramAgeBandsTooltip,
  getProgramAgeBands,
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

describe("getProgramAgeBands", () => {
  it("returns age_groups when populated (multi-age program)", () => {
    expect(
      getProgramAgeBands({ age_group: "3-5", age_groups: ["3-5", "5-8"] })
    ).toEqual(["3-5", "5-8"]);
  });

  it("returns age_groups even when primary age_group is null", () => {
    expect(
      getProgramAgeBands({ age_group: null, age_groups: ["8-12"] })
    ).toEqual(["8-12"]);
  });

  it("falls back to [age_group] when age_groups is empty array", () => {
    expect(getProgramAgeBands({ age_group: "5-8", age_groups: [] })).toEqual([
      "5-8",
    ]);
  });

  it("falls back to [age_group] when age_groups is missing (undefined)", () => {
    expect(getProgramAgeBands({ age_group: "5-8" })).toEqual(["5-8"]);
  });

  it("falls back to [age_group] when age_groups is null", () => {
    expect(getProgramAgeBands({ age_group: "5-8", age_groups: null })).toEqual([
      "5-8",
    ]);
  });

  it("returns [] when both age_group and age_groups are empty", () => {
    expect(getProgramAgeBands({ age_group: null, age_groups: [] })).toEqual([]);
    expect(getProgramAgeBands({ age_group: null })).toEqual([]);
  });
});

describe("formatProgramAgeBandsShort", () => {
  it("joins bands with comma for multi-age", () => {
    expect(
      formatProgramAgeBandsShort({
        age_group: "3-5",
        age_groups: ["3-5", "5-8", "8-12"],
      })
    ).toBe("3-5, 5-8, 8-12");
  });

  it("returns single band for legacy programs", () => {
    expect(
      formatProgramAgeBandsShort({ age_group: "5-8", age_groups: [] })
    ).toBe("5-8");
  });

  it("returns null when no bands are present", () => {
    expect(
      formatProgramAgeBandsShort({ age_group: null, age_groups: [] })
    ).toBeNull();
  });
});

describe("formatProgramAgeBandsTooltip", () => {
  it("maps each band to its full label", () => {
    expect(
      formatProgramAgeBandsTooltip({
        age_group: "3-5",
        age_groups: ["3-5", "5-8"],
      })
    ).toBe("3–5 years (Early Childhood), 5–8 years (Junior)");
  });

  it("uses raw token for non-AgeBand strings (legacy custom data)", () => {
    expect(
      formatProgramAgeBandsTooltip({
        age_group: "teen",
        age_groups: ["teen", "5-8"],
      })
    ).toBe("teen, 5–8 years (Junior)");
  });

  it("returns null when no bands are present", () => {
    expect(
      formatProgramAgeBandsTooltip({ age_group: null, age_groups: [] })
    ).toBeNull();
  });
});
