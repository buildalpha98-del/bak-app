import { describe, it, expect } from "vitest";
import {
  allSets,
  kbSummary,
  setsFor,
  syllabusNameFor,
  outcomesFor,
  findOutcome,
  officialStatement,
  validateOutcomes,
  promptOutcomeList,
  bandsForAgeBand,
} from "../knowledge-base";
import { FRAMEWORKS, YEAR_BANDS, codeInBand } from "../frameworks";
import { SUBJECTS } from "../subjects";

describe("knowledge base — data integrity", () => {
  it("loads every syllabus with the counts pulled on 2026-09-21", () => {
    const counts = Object.fromEntries(kbSummary().map((s) => [`${s.framework}/${s.subject}/${s.syllabus}`, s.count]));
    expect(counts["nsw/pdhpe/NSW PDHPE K–10 Syllabus (2018)"]).toBe(66);
    expect(counts["nsw/pdhpe/NSW PDHPE K–6 and 7–10 Syllabuses (2024)"]).toBe(35);
    expect(counts["nsw/english/NSW English K–10 Syllabus (2022)"]).toBe(52);
    expect(counts["nsw/mathematics/NSW Mathematics K–10 Syllabus (2022)"]).toBe(131);
    expect(counts["vic/pdhpe/Victorian Curriculum F–10 v2.0 Health and Physical Education"]).toBe(104);
    expect(counts["vic/english/Victorian Curriculum F–10 v2.0 English"]).toBe(293);
    expect(counts["vic/mathematics/Victorian Curriculum F–10 v2.0 Mathematics"]).toBe(283);
  });

  it("every outcome has a code, at least one canonical band and years, and codes are unique", () => {
    const seen = new Set<string>();
    for (const set of allSets()) {
      for (const o of set.outcomes) {
        expect(o.code).toMatch(/^[A-Z0-9-]+$/i);
        expect(o.bands.length).toBeGreaterThan(0);
        for (const b of o.bands) expect(YEAR_BANDS).toContain(b);
        expect(o.years.length).toBeGreaterThan(0);
        expect(seen.has(o.code.toUpperCase())).toBe(false);
        seen.add(o.code.toUpperCase());
      }
    }
  });

  it("every code sits in the band its framework's prefixes predict", () => {
    for (const set of allSets()) {
      const fw = FRAMEWORKS[set.framework];
      const subject = SUBJECTS[set.subject];
      for (const o of set.outcomes) {
        if (o.overarching) continue; // MA K–10 working-mathematically spans every stage
        expect(o.bands.some((b) => codeInBand(fw, subject, b, o.code))).toBe(true);
      }
    }
  });

  it("only three NESA Mathematics outcomes lack a published statement", () => {
    const blank = allSets().flatMap((s) => s.outcomes.filter((o) => !o.statement).map((o) => o.code));
    expect(blank.sort()).toEqual(["MA3-RQF-02", "MA4-EQU-C-01", "MA5-EQU-P-01"]);
  });
});

describe("setsFor — the PDHPE syllabus switch on 1 January 2027", () => {
  it("2018 in force this year, 2024 from 2027, English/Maths undated", () => {
    expect(setsFor("nsw", "pdhpe", "2026-09-21").map((s) => s.syllabus)).toEqual(["NSW PDHPE K–10 Syllabus (2018)"]);
    expect(setsFor("nsw", "pdhpe", "2026-12-31").map((s) => s.syllabus)).toEqual(["NSW PDHPE K–10 Syllabus (2018)"]);
    expect(setsFor("nsw", "pdhpe", "2027-01-01").map((s) => s.syllabus)).toEqual(["NSW PDHPE K–6 and 7–10 Syllabuses (2024)"]);
    expect(setsFor(FRAMEWORKS.nsw, SUBJECTS.english, "2030-01-01")).toHaveLength(1);
    expect(setsFor("vic", "mathematics", "2026-09-21")).toHaveLength(1);
    expect(syllabusNameFor("vic", "pdhpe")).toBe("Victorian Curriculum F–10 v2.0 Health and Physical Education");
  });
});

describe("lookups", () => {
  it("finds codes case-insensitively with their official statement", () => {
    expect(findOutcome("pde-1")?.outcome.statement).toBe("identifies who they are and how people grow and change");
    expect(officialStatement("PD5-11")).toMatch(/movement sequences/);
    expect(findOutcome("VC2E3LA01")?.set.framework).toBe("vic");
    expect(findOutcome("PH3-MSP-01")?.set.syllabus).toMatch(/2024/);
    expect(findOutcome("PD9-1")).toBeNull();
    expect(officialStatement("MA3-RQF-02")).toBeNull(); // exists, but no statement
  });

  it("filters by band and year, keeping Level 10 out of Levels 3–4", () => {
    const s2 = outcomesFor({ framework: "vic", subject: "english", bands: ["Stage 2"] });
    expect(s2.length).toBeGreaterThan(20);
    expect(s2.every((o) => /^VC2E[34]/.test(o.code))).toBe(true);
    const y3 = outcomesFor({ framework: "vic", subject: "mathematics", years: [3] });
    expect(y3.every((o) => o.code.startsWith("VC2M3"))).toBe(true);
    const es1 = outcomesFor({ framework: "nsw", subject: "pdhpe", bands: ["Early Stage 1"], on: "2026-09-21" });
    expect(es1.map((o) => o.code)).toEqual(["PDe-1","PDe-2","PDe-3","PDe-4","PDe-5","PDe-6","PDe-7","PDe-8","PDe-9","PDe-10","PDe-11"]);
  });

  it("maps platform age bands to canonical bands", () => {
    expect(bandsForAgeBand("5-8")).toEqual(["Early Stage 1", "Stage 1"]);
    expect(bandsForAgeBand("12-16")).toEqual(["Stage 4", "Stage 5"]);
    expect(bandsForAgeBand("3-5")).toEqual([]);
  });
});

describe("validateOutcomes — what the model returned", () => {
  it("keeps real codes with official titles, splits bundles, drops unknown and off-band codes", () => {
    const r = validateOutcomes(
      [
        { framework: "pdhpe", code: "PD2-4 / PD3-4", title: "made-up title", description: "why" },
        { framework: "pdhpe", code: "PD2-99", title: "invented", description: "" },
        { framework: "pdhpe", code: "PD5-4", title: "too old", description: "" },
        { framework: "pdhpe", code: "pd2-4", title: "dup", description: "" },
      ],
      { bands: ["Stage 2", "Stage 3"] }
    );
    expect(r.kept.map((o) => o.code)).toEqual(["PD2-4", "PD3-4"]);
    expect(r.kept[0].title).toBe(officialStatement("PD2-4"));
    expect(r.kept[0].description).toBe("why");
    expect(r.unknown).toEqual(["PD2-99"]);
    expect(r.offBand).toEqual(["PD5-4"]);
  });

  it("passes EYLF codes through untouched and tolerates empty input", () => {
    const r = validateOutcomes([{ framework: "eylf", code: "EYLF 3.1", title: "Wellbeing", description: "" }], { bands: ["Stage 1"] });
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].title).toBe("Wellbeing");
    expect(validateOutcomes(undefined, { bands: [] }).kept).toEqual([]);
  });

  it("labels kept outcomes with the subject their code belongs to", () => {
    const r = validateOutcomes([{ framework: "pdhpe", code: "VC2E3LA01", title: "x", description: "" }], { bands: ["Stage 2"] });
    expect(r.kept[0].framework).toBe("english");
  });
});

describe("promptOutcomeList", () => {
  it("prints code, framework band label and statement, capped", () => {
    const text = promptOutcomeList(FRAMEWORKS.vic, SUBJECTS.english, ["Stage 2"], { max: 5 });
    const lines = text.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^- VC2E3[A-Z]+\d+ \(Levels 3–4\) \[Language/);
    const nsw = promptOutcomeList(FRAMEWORKS.nsw, SUBJECTS.pdhpe, ["Stage 2"], { on: "2026-09-21" });
    expect(nsw).toContain("- PD2-4 (Stage 2) — ");
    expect(nsw.split("\n")).toHaveLength(11);
  });
});
