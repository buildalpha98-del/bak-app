/**
 * Pure prompt builder for AI program generation. Extracted from
 * generate-program.ts so the prompt logic (age-band scaffolding,
 * unknown-sport fallback, centre context) is testable without
 * invoking the Anthropic API.
 *
 * Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 * (§6 P2 + §8 P2 — "unit test the AI prompt builder with
 * ageGroups: ['3-5', '5-8']").
 */

import { SPORTS } from "@/lib/types/enums";

export interface BuildProgramPromptInput {
  sport: string;
  ageGroups: string[]; // validated upstream; expected non-empty + valid AgeBand strings
  durationMinutes: number;
  skillFocus?: string;
  availableEquipment: string[];
  centreContext?: {
    centreName: string;
    recentPrograms: Array<{
      title: string;
      sport: string;
      skillFocus: string | null;
    }>;
  };
}

const PRESET_SPORTS_LOWER = new Set<string>(SPORTS.map((s) => s.toLowerCase()));

export function buildProgramPrompt(input: BuildProgramPromptInput): string {
  const ages = input.ageGroups;
  const isMulti = ages.length > 1;
  const isUnknownSport = !PRESET_SPORTS_LOWER.has(input.sport.toLowerCase());

  const ageSection = isMulti
    ? `This program will be delivered to a mixed-age group spanning the following bands: ${ages.join(", ")}.
Design activities appropriate to the youngest selected band (${ages[0]}). For each activity provide a \`scaffolds\` object whose keys are the selected age bands and whose values are 1-2 line instructions for adjusting the activity for that band (e.g. for the youngest: simpler rules, walking instead of running; for older: add a challenge constraint or obstacle).

Output a single program — never a list of programs.`
    : `This program is for age band ${ages[0]}. Design activities appropriate to that band.
When only one age band is selected, omit \`scaffolds\` from each activity.`;

  const unknownSportSection = isUnknownSport
    ? `\n\nNote: "${input.sport}" is not a preset sport in our taxonomy. If the sport is unfamiliar, focus on general fundamentals appropriate to the youngest selected age band: ball-handling, evasion, balance, teamwork.`
    : "";

  const skillFocusSection = input.skillFocus
    ? `\n\nSkill focus: ${input.skillFocus}.`
    : "";

  const centreSection = input.centreContext
    ? `\n\nCentre: ${input.centreContext.centreName}.\nRecently delivered at this centre (avoid repeating titles + skill focus):\n${input.centreContext.recentPrograms
        .map((p) => `- ${p.title}${p.skillFocus ? ` (${p.skillFocus})` : ""}`)
        .join("\n")}`
    : "";

  return `You are designing a ${input.durationMinutes}-minute coaching session for ${input.sport}.

${ageSection}

Available equipment: ${input.availableEquipment.join(", ")}.${skillFocusSection}${unknownSportSection}${centreSection}

Return the full program as structured JSON following the ProgramContentJson schema.`;
}
