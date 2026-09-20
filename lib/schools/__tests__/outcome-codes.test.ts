import { describe, it, expect } from "vitest";
import { normaliseOutcomes, splitOutcomeCode } from "../outcome-codes";

describe("splitOutcomeCode", () => {
  it("splits bundled codes with or without spaces", () => {
    expect(splitOutcomeCode("PDe-1 / PD1-6 / PD2-6")).toEqual(["PDe-1", "PD1-6", "PD2-6"]);
    expect(splitOutcomeCode("PDe-1/PD1-6/PD2-6")).toEqual(["PDe-1", "PD1-6", "PD2-6"]);
    expect(splitOutcomeCode("PD2-3")).toEqual(["PD2-3"]);
  });
});

describe("normaliseOutcomes", () => {
  const raw = [
    { code: "EYLF 1.1", title: "Children feel safe, secure and supported" },
    { code: "PD1-3 / PD2-3", title: "Interpersonal relationships and teamwork" },
    { code: "PDe-1/PD1-6/PD2-6", title: "Movement skill and performance" },
    { code: "PDe-1 / PD1-6 / PD2-6", title: "Movement skill and performance (dup)" },
    { code: "PD2-3", title: "Interpersonal relationships (dup)" },
  ];

  it("dedupes atomic codes across bundles and keeps the first title", () => {
    const out = normaliseOutcomes(raw, null);
    expect(out.map((o) => o.code)).toEqual(["EYLF 1.1", "PD1-3", "PD1-6", "PD2-3", "PD2-6", "PDe-1"]);
    expect(out.find((o) => o.code === "PD2-3")?.title).toBe("Interpersonal relationships and teamwork");
    expect(out.find((o) => o.code === "PD2-6")?.title).toBe("Movement skill and performance");
  });

  it("keeps only the student's stage for a school class and drops EYLF", () => {
    const out = normaliseOutcomes(raw, "Stage 2");
    expect(out.map((o) => o.code)).toEqual(["PD2-3", "PD2-6"]);
  });

  it("writes Early Stage 1 codes as PDe-n", () => {
    const out = normaliseOutcomes(raw, "Early Stage 1");
    expect(out.map((o) => o.code)).toEqual(["PDe-1"]);
  });

  it("falls back to every PDHPE code when nothing matches the stage", () => {
    const out = normaliseOutcomes(raw, "Stage 3");
    expect(out.map((o) => o.code)).toEqual(["PD1-3", "PD1-6", "PD2-3", "PD2-6", "PDe-1"]);
  });

  it("ignores entries without a code", () => {
    expect(normaliseOutcomes([{ code: null, title: "x" }, { title: "y" }], null)).toEqual([]);
  });
});
