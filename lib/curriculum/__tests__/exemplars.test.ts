import { describe, it, expect } from "vitest";
import { allExemplars, exemplarFor, nearestExemplarFor, exemplarPromptText, exemplarCodes } from "../exemplars";
import { findOutcome } from "../knowledge-base";
import { FRAMEWORKS } from "../frameworks";
import { SUBJECTS } from "../subjects";

describe("exemplar scope and sequences — data integrity", () => {
  it("loads the Department samples for every primary stage in PDHPE, English and Mathematics, plus PDHPE Stage 4", () => {
    // PDHPE K–6 carries both syllabuses (2018 to end 2026, 2024 from 2027).
    const keys = Array.from(new Set(allExemplars().map((d) => `${d.subject}/${d.band}`))).sort();
    expect(keys).toEqual(
      [
        "english/Stage 1", "english/Stage 2", "english/Stage 3",
        "mathematics/Stage 1", "mathematics/Stage 2", "mathematics/Stage 3",
        "pdhpe/Early Stage 1", "pdhpe/Stage 1", "pdhpe/Stage 2", "pdhpe/Stage 3", "pdhpe/Stage 4",
      ].sort()
    );
  });

  it("every sample covers four terms, and every unit has a title and outcomes", () => {
    for (const d of allExemplars()) {
      expect(d.variants.length).toBeGreaterThan(0);
      const covered = new Set(d.variants.flatMap((v) => v.terms.map((t) => t.term)));
      expect([...covered].sort()).toEqual([1, 2, 3, 4]);
      for (const v of d.variants) {
        if (d.organisation === "units") expect(v.terms.map((t) => t.term)).toEqual([1, 2, 3, 4]);
        for (const t of v.terms) {
          if (d.organisation === "units") {
            expect(t.units!.length).toBeGreaterThan(0);
            for (const u of t.units!) {
              expect(u.title.length).toBeGreaterThan(3);
              expect(u.outcomes.length).toBeGreaterThan(0);
            }
          } else {
            expect(t.focusAreas!.length).toBeGreaterThan(0);
            for (const f of t.focusAreas!) expect(f.points.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("every outcome a sample cites exists in the knowledge base", () => {
    for (const d of allExemplars()) {
      const missing = exemplarCodes(d).filter((c) => !findOutcome(c));
      expect(missing, `${d.subject}/${d.band}`).toEqual([]);
    }
  });

  it("PDHPE K–6 samples carry the even/odd year rotation; ES1 is a single year", () => {
    const s2 = exemplarFor("nsw", "pdhpe", "Stage 2", "2026-09-21")!.doc;
    expect(s2.variants.map((v) => v.label)).toEqual(["Even year", "Odd year"]);
    expect(s2.variants[0].terms[0].units!.map((u) => u.strand)).toEqual(["Personal development and health", "Physical education"]);
    expect(exemplarFor("nsw", "pdhpe", "Early Stage 1", "2026-09-21")!.doc.variants.map((v) => v.label)).toEqual(["Single year"]);
  });
});

describe("NSW PDHPE K–6 (2024) samples — in force from 2027", () => {
  const BANDS = ["Early Stage 1", "Stage 1", "Stage 2", "Stage 3"] as const;

  it("every primary stage switches from the 2018 sample to the 2024 one on 1 January 2027", () => {
    for (const b of BANDS) {
      expect(exemplarFor("nsw", "pdhpe", b, "2026-12-31")!.doc.syllabus, b).toMatch(/2018/);
      expect(exemplarFor("nsw", "pdhpe", b, "2027-01-01")!.doc.syllabus, b).toMatch(/K–6 Syllabus \(2024\)/);
    }
  });

  it("stages run a two-year cycle (Year A / Year B); Kindergarten is one year", () => {
    expect(exemplarFor("nsw", "pdhpe", "Early Stage 1", "2027-02-01")!.doc.variants.map((v) => v.label)).toEqual(["Kindergarten"]);
    for (const b of BANDS.slice(1)) {
      const doc = exemplarFor("nsw", "pdhpe", b, "2027-02-01")!.doc;
      expect(doc.variants.map((v) => v.label)).toEqual(["Year A", "Year B"]);
      for (const v of doc.variants) expect(v.terms.map((t) => t.term)).toEqual([1, 2, 3, 4]);
    }
  });

  it("cites only that stage's PH codes — the workbook's two typos are normalised, paired outcomes kept", () => {
    const prefix = { "Early Stage 1": "PHE-", "Stage 1": "PH1-", "Stage 2": "PH2-", "Stage 3": "PH3-" } as const;
    for (const b of BANDS) {
      const codes = exemplarCodes(exemplarFor("nsw", "pdhpe", b, "2027-02-01")!.doc);
      expect(codes.length).toBeGreaterThanOrEqual(4);
      for (const c of codes) expect(c, b).toMatch(new RegExp(`^${prefix[b]}[A-Z]{3}-0\\d$`));
    }
    expect(exemplarCodes(exemplarFor("nsw", "pdhpe", "Stage 2", "2027-02-01")!.doc)).toEqual(
      expect.arrayContaining(["PH2-RRS-01", "PH2-RRS-02"])
    );
  });

  it("no placeholder or 'not planned' cells leak in, and every term has the movement focus area", () => {
    for (const b of BANDS) {
      for (const v of exemplarFor("nsw", "pdhpe", b, "2027-02-01")!.doc.variants) {
        for (const t of v.terms) {
          const text = JSON.stringify(t);
          expect(text).not.toMatch(/Not planned|\[Insert/i);
          expect(t.focusAreas!.some((f) => f.focusArea.startsWith("Movement skill and physical activity"))).toBe(true);
        }
      }
    }
  });

  it("serialises a term for the prompt with focus area › content group and the outcome", () => {
    const text = exemplarPromptText(exemplarFor("nsw", "pdhpe", "Stage 2", "2027-02-01")!, { term: 2, maxChars: 20000 });
    expect(text).toMatch(/^Sample: NSW PDHPE K–6 Syllabus \(2024\) — Stage 2 \(Year A\), Term 2\./);
    expect(text).toMatch(/Movement skill and physical activity › .+ \(PH2-MSP-01\): /);
  });
});

describe("exemplarFor / nearestExemplarFor", () => {
  it("picks the syllabus in force: 2018 Stage 2 today, none for Stage 4 until 2027", () => {
    expect(exemplarFor("nsw", "pdhpe", "Stage 2", "2026-09-21")!.doc.syllabus).toMatch(/2018/);
    expect(exemplarFor("nsw", "pdhpe", "Stage 4", "2026-09-21")).toBeNull();
    expect(exemplarFor("nsw", "pdhpe", "Stage 4", "2027-02-01")!.doc.syllabus).toMatch(/2024/);
  });

  it("gives a Victorian school the NSW sample as structure only", () => {
    const hit = exemplarFor(FRAMEWORKS.vic, SUBJECTS.english, "Stage 2");
    expect(hit?.structuralOnly).toBe(true);
    expect(hit?.doc.framework).toBe("nsw");
  });

  it("falls back to the nearest band with a sample", () => {
    expect(nearestExemplarFor("nsw", "english", ["Stage 5"])?.doc.band).toBe("Stage 3");
    expect(nearestExemplarFor("nsw", "mathematics", ["Early Stage 1"])?.doc.band).toBe("Stage 1");
    expect(nearestExemplarFor("nsw", "pdhpe", ["Stage 2", "Stage 3"])?.doc.band).toBe("Stage 2");
  });
});

describe("exemplarPromptText", () => {
  it("serialises the requested term of a unit-based sample with outcomes and a source line", () => {
    const text = exemplarPromptText(exemplarFor("nsw", "pdhpe", "Stage 2", "2026-09-21")!, { term: 3 });
    expect(text).toMatch(/^Sample: NSW PDHPE K–10 Syllabus \(2018\) — Stage 2 \(Even year\), Term 3\./);
    expect(text).toMatch(/Unit 1: .+\[Personal development and health\] — 10 weeks/);
    expect(text).toMatch(/Outcomes: PD2-/);
    expect(text).toMatch(/Key inquiry questions:/);
  });

  it("serialises a focus-area sample and respects the character cap", () => {
    const text = exemplarPromptText(exemplarFor("nsw", "english", "Stage 1")!, { term: 1, maxChars: 800 });
    expect(text.length).toBeLessThanOrEqual(800);
    expect(text).toMatch(/\(EN1-[A-Z]+-\d+\)/);
    // Stage 2 Term 1 merges the stage-wide tables with Year 3's.
    const s2 = exemplarPromptText(exemplarFor("nsw", "english", "Stage 2")!, { term: 1, maxChars: 20000 });
    expect(s2).toMatch(/\(Year 3\), Term 1/);
    expect(s2).toMatch(/Reading fluency \(EN2-REFLU-01\)/);
    expect(s2).toMatch(/Oral language and communication \(EN2-OLC-01\)/);
  });

  it("prints Mathematics learning sequences with focus areas and content", () => {
    const text = exemplarPromptText(exemplarFor("nsw", "mathematics", "Stage 2")!, { term: 1 });
    expect(text).toMatch(/Unit 1: Unit 1/);
    expect(text).toMatch(/Focus areas: /);
    expect(text).toMatch(/Outcomes: MAO-WM-01, MA2-/);
  });
});
