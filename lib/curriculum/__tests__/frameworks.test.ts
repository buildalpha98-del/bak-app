import { describe, it, expect } from "vitest";
import {
  FRAMEWORKS,
  FRAMEWORK_KEYS,
  YEAR_BANDS,
  frameworkOf,
  isFrameworkKey,
  codeHasPrefix,
  codeInBand,
  subjectForCode,
  frameworkForCode,
  bandLabelForYearGroup,
  bandsLabelForYearGroups,
  ageBandToBandLabel,
  bandSummaryHeading,
  quizBandFor,
} from "../frameworks";
import { SUBJECTS, SUBJECT_KEYS } from "../subjects";

describe("framework registry (migration 095)", () => {
  it("every framework labels every band and has prefixes for every subject", () => {
    for (const fw of FRAMEWORK_KEYS) {
      const f = FRAMEWORKS[fw];
      for (const band of YEAR_BANDS) {
        expect(f.bandLabels[band]).toBeTruthy();
        for (const key of SUBJECT_KEYS) {
          const prefixes = f.bandPrefixes[key][band];
          expect(prefixes.length).toBeGreaterThan(0);
          for (const p of prefixes) expect(p.startsWith(f.codeFamily[key])).toBe(true);
        }
      }
      for (const m of [1, 2, 3, 4, 5]) expect(f.markScale[m]).toBeTruthy();
    }
  });

  it("unknown or missing frameworks fall back to NSW (pre-095 rows)", () => {
    expect(frameworkOf(null).key).toBe("nsw");
    expect(frameworkOf("qld").key).toBe("nsw");
    expect(frameworkOf("vic").key).toBe("vic");
    expect(isFrameworkKey("vic")).toBe(true);
    expect(isFrameworkKey("VIC")).toBe(false);
  });

  it("names the bands per state", () => {
    expect(FRAMEWORKS.nsw.bandLabels["Stage 2"]).toBe("Stage 2");
    expect(FRAMEWORKS.vic.bandLabels["Stage 2"]).toBe("Levels 3–4");
    expect(FRAMEWORKS.vic.bandLabels["Early Stage 1"]).toBe("Foundation");
    expect(bandSummaryHeading(FRAMEWORKS.nsw)).toBe("By Stage (NSW PDHPE)");
    expect(bandSummaryHeading(FRAMEWORKS.vic)).toBe("By Level (Victorian Curriculum HPE)");
  });
});

describe("codeHasPrefix — digit boundary", () => {
  it("VC2E1 covers Level 1 but not Level 10", () => {
    expect(codeHasPrefix("VC2E1LA01", "VC2E1")).toBe(true);
    expect(codeHasPrefix("VC2E10LA01", "VC2E1")).toBe(false);
    expect(codeHasPrefix("VC2E10LA01", "VC2E10")).toBe(true);
    expect(codeHasPrefix("VC2HP10M01", "VC2HP1")).toBe(false);
  });

  it("NSW hyphenated prefixes behave as plain startsWith", () => {
    expect(codeHasPrefix("PD2-4", "PD2-")).toBe(true);
    expect(codeHasPrefix("pde-1", "PDE-")).toBe(true);
    expect(codeHasPrefix("PD3-4", "PD2-")).toBe(false);
  });
});

describe("codeInBand", () => {
  it("places VIC English levels in their band and HPE bands by upper level", () => {
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.english, "Stage 2", "VC2E3LA01")).toBe(true);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.english, "Stage 2", "VC2E4LY02")).toBe(true);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.english, "Stage 2", "VC2E5LA01")).toBe(false);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.pdhpe, "Stage 2", "VC2HP4M01")).toBe(true);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.pdhpe, "Stage 5", "VC2HP10M01")).toBe(true);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.pdhpe, "Early Stage 1", "VC2HPFM01")).toBe(true);
    expect(codeInBand(FRAMEWORKS.vic, SUBJECTS.mathematics, "Early Stage 1", "VC2MFN01")).toBe(true);
  });

  it("NSW stages unchanged", () => {
    expect(codeInBand(FRAMEWORKS.nsw, SUBJECTS.pdhpe, "Stage 2", "PD2-4")).toBe(true);
    expect(codeInBand(FRAMEWORKS.nsw, SUBJECTS.pdhpe, "Stage 2", "PD3-4")).toBe(false);
  });
});

describe("subjectForCode / frameworkForCode", () => {
  it("routes NSW and VIC codes to their subject", () => {
    expect(subjectForCode("PD2-4")?.key).toBe("pdhpe");
    expect(subjectForCode("PDe-1")?.key).toBe("pdhpe");
    expect(subjectForCode("EN1-RECOM-01")?.key).toBe("english");
    expect(subjectForCode("MA2-RN-01")?.key).toBe("mathematics");
    expect(subjectForCode("VC2HP4M01")?.key).toBe("pdhpe");
    expect(subjectForCode("VC2E3LA01")?.key).toBe("english");
    expect(subjectForCode("VC2M4N02")?.key).toBe("mathematics");
    expect(subjectForCode("EYLF 1.1")).toBeNull();
  });

  it("knows which framework a code came from", () => {
    expect(frameworkForCode("PD2-4")?.key).toBe("nsw");
    expect(frameworkForCode("VC2E3LA01")?.key).toBe("vic");
    expect(frameworkForCode("EYLF 1.1")).toBeNull();
  });
});

describe("band labels for classes and age bands", () => {
  it("labels a class's year group per framework", () => {
    expect(bandLabelForYearGroup(FRAMEWORKS.nsw, "3")).toBe("Stage 2");
    expect(bandLabelForYearGroup(FRAMEWORKS.vic, "3")).toBe("Levels 3–4");
    expect(bandLabelForYearGroup(FRAMEWORKS.vic, "Prep")).toBe("Foundation");
    expect(bandLabelForYearGroup(FRAMEWORKS.vic, "F")).toBe("Foundation");
    expect(bandLabelForYearGroup(FRAMEWORKS.vic, "3-5")).toBe(null);
  });

  it("dedupes and orders combined year groups", () => {
    expect(bandsLabelForYearGroups(FRAMEWORKS.nsw, ["4", "3"])).toBe("Stage 2");
    expect(bandsLabelForYearGroups(FRAMEWORKS.nsw, ["K", "5/6"])).toBe("Early Stage 1, Stage 3");
    expect(bandsLabelForYearGroups(FRAMEWORKS.vic, ["K", "5/6"])).toBe("Foundation, Levels 5–6");
    expect(bandsLabelForYearGroups(FRAMEWORKS.vic, ["3-5"])).toBe(null);
    expect(bandsLabelForYearGroups(FRAMEWORKS.vic, [])).toBe(null);
  });

  it("maps age bands to band ranges and pre-school to none", () => {
    expect(ageBandToBandLabel(FRAMEWORKS.nsw, "8-12")).toBe("Stage 2 – Stage 3");
    expect(ageBandToBandLabel(FRAMEWORKS.nsw, "12-16")).toBe("Stage 4 – Stage 5");
    expect(ageBandToBandLabel(FRAMEWORKS.nsw, "5-8")).toBe("Early Stage 1 – Stage 1");
    expect(ageBandToBandLabel(FRAMEWORKS.vic, "8-12")).toBe("Levels 3–4 – Levels 5–6");
    expect(ageBandToBandLabel(FRAMEWORKS.vic, "3-5")).toBe(null);
    expect(ageBandToBandLabel(FRAMEWORKS.nsw, null)).toBe(null);
  });
});

describe("quizBandFor", () => {
  it("uses each framework's scale words", () => {
    expect(quizBandFor(FRAMEWORKS.nsw, 100)).toBe("Outstanding");
    expect(quizBandFor(FRAMEWORKS.nsw, 50)).toBe("Sound");
    expect(quizBandFor(FRAMEWORKS.vic, 100)).toBe("Well above");
    expect(quizBandFor(FRAMEWORKS.vic, 50)).toBe("At level");
    expect(quizBandFor(FRAMEWORKS.vic, 10)).toBe("Well below");
  });
});
