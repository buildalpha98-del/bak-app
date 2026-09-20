import { describe, it, expect } from "vitest";
import { normaliseOutcomes, splitOutcomeCode, groupOutcomesBySubject } from "../outcome-codes";
import { SUBJECTS } from "@/lib/curriculum/subjects";
import { FRAMEWORKS } from "@/lib/curriculum/frameworks";

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

  it("falls back to the nearest stage that has codes, never every stage", () => {
    // Stage 3 requested, only Stage 2 and below written → Stage 2 codes.
    expect(normaliseOutcomes(raw, "Stage 3").map((o) => o.code)).toEqual(["PD2-3", "PD2-6"]);
    // Stage 1 requested with only Early Stage 1 and Stage 2 written → the
    // closer of the two is a tie; prefer the higher stage.
    const only = [{ code: "PDe-1 / PD2-6", title: "Movement" }];
    expect(normaliseOutcomes(only, "Stage 1").map((o) => o.code)).toEqual(["PD2-6"]);
  });

  it("ignores entries without a code", () => {
    expect(normaliseOutcomes([{ code: null, title: "x" }, { title: "y" }], null)).toEqual([]);
  });

  it("filters to the given subject's family and stage (English, Maths)", () => {
    const mixed = [
      { code: "ENe-1A / EN1-1A", title: "Communicates" },
      { code: "MA1-RN-01", title: "Represents numbers" },
      { code: "PD1-6", title: "Movement" },
    ];
    expect(normaliseOutcomes(mixed, "Stage 1", SUBJECTS.english).map((o) => o.code)).toEqual(["EN1-1A"]);
    expect(normaliseOutcomes(mixed, "Early Stage 1", SUBJECTS.english).map((o) => o.code)).toEqual(["ENe-1A"]);
    expect(normaliseOutcomes(mixed, "Stage 1", SUBJECTS.mathematics).map((o) => o.code)).toEqual(["MA1-RN-01"]);
  });

  it("filters Victorian codes by level band and prefers the school's framework", () => {
    const vic = [
      { code: "VC2E3LA01", title: "Level 3 language" },
      { code: "VC2E4LY02", title: "Level 4 literacy" },
      { code: "VC2E10LA01", title: "Level 10 language" },
      { code: "EN2-RECOM-01", title: "NSW Stage 2 comprehension" },
      { code: "VC2M3N01", title: "Level 3 number" },
    ];
    // Levels 3–4 band: both level codes, never Level 10 (digit boundary),
    // and the NSW code is set aside because VIC codes exist.
    expect(normaliseOutcomes(vic, "Stage 2", SUBJECTS.english, FRAMEWORKS.vic).map((o) => o.code)).toEqual([
      "VC2E3LA01",
      "VC2E4LY02",
    ]);
    expect(normaliseOutcomes(vic, "Stage 5", SUBJECTS.english, FRAMEWORKS.vic).map((o) => o.code)).toEqual([
      "VC2E10LA01",
    ]);
    expect(normaliseOutcomes(vic, "Stage 2", SUBJECTS.mathematics, FRAMEWORKS.vic).map((o) => o.code)).toEqual([
      "VC2M3N01",
    ]);
  });

  it("keeps the other framework's codes when the school has none of its own", () => {
    // A Victorian school whose programmes pre-date the flip: NSW codes
    // still print (nearest band) rather than the section going blank.
    const old = [{ code: "PD2-4 / PD3-4", title: "Movement" }];
    expect(normaliseOutcomes(old, "Stage 2", SUBJECTS.pdhpe, FRAMEWORKS.vic).map((o) => o.code)).toEqual(["PD2-4", "PD3-4"]);
  });

  it("groups a mixed list by subject, across frameworks", () => {
    const vicGroups = groupOutcomesBySubject([{ code: "VC2HP4M01 / VC2E3LA01", title: "x" }]);
    expect([...vicGroups.keys()].map((s) => s.key).sort()).toEqual(["english", "pdhpe"]);

    const groups = groupOutcomesBySubject([
      { code: "PD2-4 / EN2-RECOM-01", title: "x" },
      { code: "MA2-RN-01", title: "y" },
      { code: "EYLF 1.1", title: "z" },
    ]);
    expect([...groups.keys()].map((s) => s.key).sort()).toEqual(["english", "mathematics", "pdhpe"]);
  });
});
