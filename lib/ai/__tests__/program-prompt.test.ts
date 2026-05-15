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
    expect(p).toMatch(/single program/i);
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
    expect(p).not.toMatch(/unfamiliar/i);
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
