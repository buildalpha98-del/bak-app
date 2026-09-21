import { describe, it, expect } from "vitest";
import { normaliseTermPlan, isTermPlanJson, unitForWeek } from "../term-plan";
import { officialStatement } from "../knowledge-base";

const opts = { subject: "pdhpe", bandLabel: "Stage 2", bands: ["Stage 2" as const], weekCount: 10 };

describe("normaliseTermPlan", () => {
  it("keeps real in-band outcomes with official titles, fills missing weekly focus, sorts units", () => {
    const { plan, issues, unknownCodes } = normaliseTermPlan(
      {
        title: "Stage 2 PDHPE — Term 3",
        rationale: "Builds game sense.",
        units: [
          {
            title: "Target games",
            strand: "Physical education",
            weeks: [6, 7, 8, 9, 10],
            description: "Send an object to a target.",
            outcomes: [
              { code: "PD2-4", title: "made up", description: "skills" },
              { code: "PD2-99", title: "invented", description: "" },
              { code: "PD4-4", title: "too old", description: "" },
            ],
            weeklyFocus: [{ week: 6, focus: "Underarm roll" }],
          },
          {
            title: "Invasion games",
            strand: "Physical education",
            weeks: ["1", 2, 3, 4, 5],
            description: "Attack and defend.",
            inquiryQuestions: ["How do we create space?"],
            outcomes: [{ code: "PD2-5 / PD2-11", title: "x", description: "" }],
            assessment: "Skills checklist in week 5.",
            weeklyFocus: [
              { week: 1, focus: "Passing" },
              { week: 2, focus: "Dodging" },
              { week: 3, focus: "Marking" },
              { week: 4, focus: "Small-sided games" },
              { week: 5, focus: "Assessment game" },
            ],
          },
        ],
      },
      opts
    );
    expect(issues).toEqual([]);
    expect(unknownCodes).toEqual(["PD2-99", "PD4-4"]);
    expect(plan.units.map((u) => u.title)).toEqual(["Invasion games", "Target games"]);
    expect(plan.units[0].weeks).toEqual([1, 2, 3, 4, 5]);
    expect(plan.units[0].outcomes.map((o) => o.code)).toEqual(["PD2-5", "PD2-11"]);
    expect(plan.units[1].outcomes[0].title).toBe(officialStatement("PD2-4"));
    expect(plan.units[1].weeklyFocus.map((w) => w.week)).toEqual([6, 7, 8, 9, 10]);
    expect(plan.units[1].weeklyFocus[1].focus).toBe("Target games");
    expect(plan.units[0].inquiryQuestions).toEqual(["How do we create space?"]);
    expect(plan.weekCount).toBe(10);
    expect(unitForWeek(plan, 7)?.title).toBe("Target games");
    expect(unitForWeek(plan, 11)).toBeNull();
  });

  it("allows parallel units in different strands but flags same-strand overlap, gaps and overruns", () => {
    const { issues } = normaliseTermPlan(
      {
        units: [
          { title: "Health unit", strand: "Personal development and health", weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], outcomes: [{ code: "PD2-1" }] },
          { title: "PE unit", strand: "Physical education", weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], outcomes: [{ code: "PD2-4" }] },
        ],
      },
      opts
    );
    expect(issues).toEqual([]);

    const bad = normaliseTermPlan(
      {
        units: [
          { title: "A", strand: "Physical education", weeks: [1, 2, 3], outcomes: [{ code: "PD2-4" }] },
          { title: "B", strand: "Physical education", weeks: [3, 4, 5, 11], outcomes: [{ code: "PD2-5" }] },
        ],
      },
      opts
    ).issues;
    expect(bad.map((i) => i.code).sort()).toEqual(["week_gap", "week_out_of_range", "week_overlap"]);
    expect(bad.find((i) => i.code === "week_gap")?.detail).toBe("No unit covers weeks 6, 7, 8, 9, 10.");
  });

  it("flags empty plans and units with no recognised outcomes", () => {
    expect(normaliseTermPlan({}, opts).issues.map((i) => i.code)).toEqual(["no_units"]);
    const r = normaliseTermPlan({ units: [{ title: "Ghost", strand: "x", weeks: [1], outcomes: [{ code: "ZZ9-1" }] }] }, opts);
    expect(r.issues.map((i) => i.code)).toEqual(["no_outcomes", "week_gap"]);
    expect(r.plan.title).toBe("Stage 2 term plan");
  });

  it("recognises stored plans", () => {
    expect(isTermPlanJson({ title: "t", units: [], weekCount: 10 })).toBe(true);
    expect(isTermPlanJson({ title: "t" })).toBe(false);
    expect(isTermPlanJson(null)).toBe(false);
  });
});

describe("normaliseTermPlan — the syllabus in force when the term is TAUGHT", () => {
  const raw = (code: string) => ({
    title: "Plan",
    rationale: "",
    units: [
      {
        title: "Unit",
        strand: "Movement skill and physical activity",
        weeks: [1, 2],
        description: "d",
        outcomes: [{ framework: "pdhpe", code, title: "", description: "" }],
        weeklyFocus: [
          { week: 1, focus: "a" },
          { week: 2, focus: "b" },
        ],
      },
    ],
  });
  const opts = { subject: "pdhpe", bandLabel: "Stage 2", bands: ["Stage 2" as const], weekCount: 2 };

  it("a Term 1 2027 plan keeps 2024-syllabus codes and drops 2018 ones — whenever it is drafted", () => {
    const next = normaliseTermPlan(raw("PH2-MSP-01"), { ...opts, on: "2027-02-01" });
    expect(next.unknownCodes).toEqual([]);
    expect(next.plan.units[0].outcomes.map((o) => o.code)).toEqual(["PH2-MSP-01"]);
    expect(normaliseTermPlan(raw("PD2-4"), { ...opts, on: "2027-02-01" }).unknownCodes).toEqual(["PD2-4"]);
  });

  it("a 2026 plan is the mirror image", () => {
    expect(normaliseTermPlan(raw("PD2-4"), { ...opts, on: "2026-07-20" }).unknownCodes).toEqual([]);
    expect(normaliseTermPlan(raw("PH2-MSP-01"), { ...opts, on: "2026-07-20" }).unknownCodes).toEqual(["PH2-MSP-01"]);
  });
});
