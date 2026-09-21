import { describe, it, expect } from "vitest";
import { systemPrompt, userPrompt, type GenerateTermPlanInput } from "../generate-term-plan";
import { FRAMEWORKS } from "@/lib/curriculum/frameworks";
import { SUBJECTS } from "@/lib/curriculum/subjects";

const base: GenerateTermPlanInput = {
  framework: FRAMEWORKS.nsw,
  subject: SUBJECTS.pdhpe,
  bands: ["Stage 2"],
  bandLabel: "Stage 2",
  yearGroups: ["3"],
  className: "3B",
  termName: "Term 1 2027",
  termNumber: 1,
  weekCount: 10,
};

describe("term-plan prompts follow the term's date, not the drafting date", () => {
  it("a 2027 term gets the 2024 syllabus, its sample and PH codes only", () => {
    const input = { ...base, on: "2027-02-01" };
    expect(systemPrompt(input)).toContain("(2024)");
    const user = userPrompt(input);
    expect(user).toContain("Sample: NSW PDHPE K–6 Syllabus (2024) — Stage 2 (Year A), Term 1.");
    expect(user).toContain("PH2-MSP-01");
    expect(user).not.toMatch(/PD2-\d/);
  });

  it("a 2026 term gets the 2018 syllabus, its sample and PD codes only", () => {
    const input = { ...base, termName: "Term 3 2026", termNumber: 3, on: "2026-07-20" };
    const user = userPrompt(input);
    expect(user).toContain("Syllabus (2018) — Stage 2");
    expect(user).toMatch(/PD2-\d/);
    expect(user).not.toContain("PH2-");
  });
});
