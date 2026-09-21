import { describe, expect, it } from "vitest";
import {
  briefForWeek,
  coachUnitForWeek,
  isMovementUnit,
  leadPlanClassId,
  planSessionState,
} from "../plan-roster";
import type { TermPlanJson } from "../term-plan";

const outcome = (code: string) => ({ framework: "pdhpe" as const, code, title: code, description: "" });

const plan: TermPlanJson = {
  title: "Stage 2 PDHPE — Term 3",
  subject: "pdhpe",
  bandLabel: "Stage 2",
  rationale: "",
  weekCount: 10,
  units: [
    {
      title: "How do we stay safe?",
      strand: "Personal development and health",
      weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      description: "Safety",
      outcomes: [outcome("PD2-2")],
      weeklyFocus: [{ week: 1, focus: "Safe choices" }],
    },
    {
      title: "Athletics: run, jump, throw",
      strand: "Physical education",
      weeks: [1, 2, 3, 4, 5],
      description: "Athletics skills",
      outcomes: [outcome("PD2-4"), outcome("PD2-11")],
      assessment: "Week 5 skills circuit",
      weeklyFocus: [
        { week: 1, focus: "Sprint starts" },
        { week: 2, focus: "Relay changeovers" },
        { week: 3, focus: "  " },
        { week: 5, focus: "Skills circuit" },
      ],
    },
    {
      title: "Invasion games",
      strand: "Physical education",
      weeks: [6, 7, 8, 9, 10],
      description: "Games",
      outcomes: [outcome("PD2-5")],
      weeklyFocus: [{ week: 6, focus: "Finding space" }],
    },
  ],
};

describe("coachUnitForWeek", () => {
  it("picks the movement unit over the parallel classroom unit", () => {
    expect(coachUnitForWeek(plan, 2)?.title).toBe("Athletics: run, jump, throw");
    expect(coachUnitForWeek(plan, 6)?.title).toBe("Invasion games");
  });

  it("falls back to whichever unit covers the week when none is a movement unit", () => {
    const single: TermPlanJson = { ...plan, units: [plan.units[0]] };
    expect(coachUnitForWeek(single, 4)?.title).toBe("How do we stay safe?");
  });

  it("is null outside the plan", () => {
    expect(coachUnitForWeek(plan, 11)).toBeNull();
  });

  it("recognises the Victorian and 2024 NSW strand names", () => {
    expect(isMovementUnit({ strand: "Movement and physical activity" })).toBe(true);
    expect(isMovementUnit({ strand: "Movement skill and performance" })).toBe(true);
    expect(isMovementUnit({ strand: "Personal development and health" })).toBe(false);
  });
});

describe("briefForWeek", () => {
  it("carries the week's focus, the unit's codes and what came before", () => {
    const brief = briefForWeek(plan, 5)!;
    expect(brief.focus).toBe("Skills circuit");
    expect(brief.outcomeCodes).toEqual(["PD2-4", "PD2-11"]);
    expect(brief.previousFocuses).toEqual([
      { week: 1, focus: "Sprint starts" },
      { week: 2, focus: "Relay changeovers" },
    ]);
    expect(brief.isUnitFinalWeek).toBe(true);
    expect(brief.assessment).toBe("Week 5 skills circuit");
  });

  it("uses the unit title when the week has no focus line", () => {
    expect(briefForWeek(plan, 3)!.focus).toBe("Athletics: run, jump, throw");
    expect(briefForWeek(plan, 4)!.focus).toBe("Athletics: run, jump, throw");
  });

  it("restarts progression with a new unit", () => {
    const brief = briefForWeek(plan, 6)!;
    expect(brief.previousFocuses).toEqual([]);
    expect(brief.isUnitFinalWeek).toBe(false);
  });
});

describe("leadPlanClassId", () => {
  it("is the first targeted class with an approved plan", () => {
    expect(leadPlanClassId(["a", "b", "c"], new Set(["c", "b"]))).toBe("b");
    expect(leadPlanClassId(["a"], new Set(["b"]))).toBeNull();
  });
});

describe("planSessionState", () => {
  const base = {
    status: "published",
    programId: null,
    programPlanId: null,
    programPlanWeek: null,
    planId: "p1",
    week: 3,
    hasBrief: true,
  };
  it("never touches completed or cancelled sessions", () => {
    expect(planSessionState({ ...base, status: "completed" })).toBe("locked");
    expect(planSessionState({ ...base, status: "cancelled" })).toBe("locked");
  });
  it("distinguishes the plan's own programme from any other", () => {
    expect(planSessionState(base)).toBe("ready");
    expect(planSessionState({ ...base, programId: "x" })).toBe("programmed");
    expect(planSessionState({ ...base, programId: "x", programPlanId: "p1", programPlanWeek: 3 })).toBe("from_plan");
    expect(planSessionState({ ...base, programId: "x", programPlanId: "p1", programPlanWeek: 2 })).toBe("programmed");
  });
  it("flags sessions outside the term's plan weeks", () => {
    expect(planSessionState({ ...base, week: null })).toBe("no_week");
    expect(planSessionState({ ...base, hasBrief: false })).toBe("no_week");
  });
});
