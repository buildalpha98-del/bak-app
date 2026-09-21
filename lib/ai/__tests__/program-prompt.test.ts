import { describe, it, expect } from "vitest";
import { buildProgramPrompt, type BuildProgramPromptInput } from "../program-prompt";

function input(o: Partial<BuildProgramPromptInput> = {}): BuildProgramPromptInput {
  return {
    sport: "Soccer",
    ageGroups: ["5-8"],
    durationMinutes: 45,
    skillFocus: undefined,
    availableEquipment: ["Cones", "Balls"],
    centreContext: undefined,
    ...o,
  };
}

describe("buildProgramPrompt", () => {
  it("includes the sport, duration, and equipment list", () => {
    const p = buildProgramPrompt(input());
    expect(p).toContain("Soccer");
    expect(p).toContain("45");
    expect(p).toContain("Cones");
    expect(p).toContain("Balls");
  });

  it("includes a single age band when one is selected, and instructs to OMIT scaffolds", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["5-8"] }));
    expect(p).toContain("5-8");
    expect(p).toMatch(/only one age band|omit `?scaffolds`?/i);
  });

  it("includes all selected age bands when multiple are selected, and instructs to PROVIDE scaffolds", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["3-5", "5-8"] }));
    expect(p).toContain("3-5");
    expect(p).toContain("5-8");
    expect(p).toMatch(/provide a `?scaffolds`?/i);
    expect(p).toMatch(/single programme/i);
  });

  it("instructs to design for the youngest band when multiple selected", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["3-5", "5-8", "8-12"] }));
    expect(p).toMatch(/youngest/i);
  });

  it("adds the unknown-sport fallback for custom sports", () => {
    const p = buildProgramPrompt(input({ sport: "Oztag" }));
    expect(p).toMatch(/unfamiliar|general fundamentals/i);
  });

  it("does NOT add the unknown-sport fallback for preset sports", () => {
    const p = buildProgramPrompt(input({ sport: "Soccer" }));
    // The knowledge-base outcome list can legitimately contain the word
    // "unfamiliar" (PD outcomes mention unfamiliar contexts); assert on
    // the fallback sentence itself.
    expect(p).not.toMatch(/is not a preset sport/i);
  });

  it("includes skill focus when provided", () => {
    const p = buildProgramPrompt(input({ skillFocus: "ball handling" }));
    expect(p).toContain("ball handling");
  });

  it("includes centre name + recent programs when centreContext is provided", () => {
    const p = buildProgramPrompt(
      input({
        centreContext: {
          centreName: "Tiny Tots Liverpool",
          recentPrograms: [
            { title: "Soccer Basics", sport: "Soccer", skillFocus: "kicking" },
          ],
        },
      }),
    );
    expect(p).toContain("Tiny Tots Liverpool");
    expect(p).toContain("Soccer Basics");
  });
});

describe("buildProgramPrompt — subjects (migration 089)", () => {
  it("frames an English lesson on a focus area with resources, not a coaching session", async () => {
    const { SUBJECTS } = await import("@/lib/curriculum/subjects");
    const out = buildProgramPrompt({
      subject: SUBJECTS.english,
      sport: "Reading comprehension",
      ageGroups: ["5-8"],
      durationMinutes: 45,
      availableEquipment: ["Whiteboard", "Decodable readers"],
    });
    expect(out).toContain('45-minute English lesson on the focus area "Reading comprehension"');
    expect(out).toContain("Available resources: Whiteboard, Decodable readers");
    expect(out).not.toContain("coaching session");
    expect(out).not.toContain("not a preset sport");
  });
});

describe("buildProgramPrompt — approved term plan drives the session", () => {
  const planBrief = {
    week: 3,
    weekCount: 10,
    planTitle: "Stage 2 PDHPE — Term 3",
    unitTitle: "Athletics: run, jump, throw",
    strand: "Physical education",
    unitDescription: "Students refine running, jumping and throwing.",
    focus: "Standing long jump — two-foot take-off and landing",
    outcomeCodes: ["PD2-4", "PD2-11"],
    assessment: "Week 5 skills circuit",
    previousFocuses: [{ week: 2, focus: "Relay changeovers" }],
    isUnitFinalWeek: false,
  };

  it("names the plan, the week's focus, the unit's codes and what came before", () => {
    const prompt = buildProgramPrompt({
      sport: "Athletics",
      ageGroups: ["8-12"],
      yearGroups: ["4"],
      durationMinutes: 60,
      availableEquipment: ["Cones"],
      planBrief,
    });
    expect(prompt).toContain("WEEK 3 OF 10");
    expect(prompt).toContain("Standing long jump — two-foot take-off and landing");
    expect(prompt).toContain("PD2-4, PD2-11");
    expect(prompt).toContain("Week 2: Relay changeovers");
    expect(prompt).toContain("Week 5 skills circuit");
    expect(prompt).not.toContain("FINAL week");
  });

  it("says nothing about a plan when there is none", () => {
    const prompt = buildProgramPrompt({
      sport: "Athletics",
      ageGroups: ["8-12"],
      durationMinutes: 60,
      availableEquipment: ["Cones"],
    });
    expect(prompt).not.toContain("approved term plan");
  });
});
