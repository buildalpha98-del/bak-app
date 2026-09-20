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
import { FRAMEWORKS, bandsLabelForYearGroups, type FrameworkDef, type YearBand } from "@/lib/curriculum/frameworks";
import { yearGroupLabel, yearGroupToStage } from "@/lib/schools/year-groups";
import { bandsForAgeBand, promptOutcomeList, syllabusNameFor } from "@/lib/curriculum/knowledge-base";
import { SUBJECTS, type SubjectDef } from "@/lib/curriculum/subjects";

export interface BuildProgramPromptInput {
  /** Defaults to PDHPE (a coaching session); English/Maths make a lesson. */
  subject?: SubjectDef;
  /** The school's curriculum (migration 095). Defaults to NSW. */
  framework?: FrameworkDef;
  /** Class year group(s) when known ("3", "5/6") — lets the prompt name
   *  the exact stage/level instead of the whole age band. */
  yearGroups?: string[];
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
  /**
   * Multi-week series context. When present, the plan is week N of a
   * progression: it should revisit then extend what earlier weeks
   * taught, never repeat them wholesale.
   */
  progression?: {
    week: number;
    totalWeeks: number;
    /** Overall theme, e.g. "Dribbling School". Optional for week 1. */
    seriesTitle?: string;
    previousWeeks: Array<{
      week: number;
      title: string;
      objectives: string[];
      skills: string[];
    }>;
  };
}

const PRESET_SPORTS_LOWER = new Set<string>(SPORTS.map((s) => s.toLowerCase()));

/**
 * The canonical bands a request covers: the class's exact year groups
 * when known, else every band its age bands span. Empty for 3-5 (EYLF)
 * and for childcare rooms. Shared by the prompt (which list to show) and
 * the post-generation check (which codes are allowed).
 */
export function kbBandsFor(input: Pick<BuildProgramPromptInput, "ageGroups" | "yearGroups">): YearBand[] {
  const fromYears = (input.yearGroups ?? [])
    .map((y) => yearGroupToStage(y))
    .filter((b): b is YearBand => b !== null);
  const bands = fromYears.length > 0 ? fromYears : input.ageGroups.flatMap((a) => bandsForAgeBand(a));
  return Array.from(new Set(bands));
}

export function buildProgramPrompt(input: BuildProgramPromptInput): string {
  const ages = input.ageGroups;
  const isMulti = ages.length > 1;
  const subject = input.subject ?? SUBJECTS.pdhpe;
  const isLesson = subject.key !== "pdhpe";
  const isUnknownSport = !isLesson && !PRESET_SPORTS_LOWER.has(input.sport.toLowerCase());

  const ageSection = isMulti
    ? `This programme will be delivered to a mixed-age group spanning the following bands: ${ages.join(", ")}.
Design activities appropriate to the youngest selected band (${ages[0]}). For each activity provide a \`scaffolds\` object whose keys are the selected age bands and whose values are 1-2 line instructions for adjusting the activity for that band (e.g. for the youngest: simpler rules, walking instead of running; for older: add a challenge constraint or obstacle).

Output a single programme — never a list of programmes.`
    : `This programme is for age band ${ages[0]}. Design activities appropriate to that band.
When only one age band is selected, omit \`scaffolds\` from each activity.`;

  const unknownSportSection = isUnknownSport
    ? `\n\nNote: "${input.sport}" is not a preset sport in our taxonomy. If the sport is unfamiliar, focus on general fundamentals appropriate to the youngest selected age band: ball-handling, evasion, balance, teamwork.`
    : "";

  const skillFocusSection = input.skillFocus
    ? `\n\nSkill focus: ${input.skillFocus}.`
    : "";

  const framework = input.framework ?? FRAMEWORKS.nsw;
  const yearGroups = (input.yearGroups ?? []).filter((y) => y.trim());
  const bandsLabel = yearGroups.length > 0 ? bandsLabelForYearGroups(framework, yearGroups) : null;
  const levelSection = bandsLabel
    ? `\n\nThe class is ${yearGroups.map((y) => yearGroupLabel(y)).join(" / ")} (${bandsLabel}). Use ${framework.label} codes for exactly ${bandsLabel} — not the neighbouring ${framework.bandNoun.toLowerCase()}s.`
    : "";

  // Curriculum knowledge base: the real outcomes for the band, so the
  // model chooses rather than recalls. Validated again after generation.
  const kbBands = kbBandsFor(input);
  const kbList = kbBands.length > 0 ? promptOutcomeList(framework, subject, kbBands) : "";
  const outcomeSection = kbList
    ? `\n\n## Curriculum ${framework.outcomeNoun}s — choose ONLY from this list\nSelect 2-3 ${framework.outcomeNoun}s from the ${syllabusNameFor(framework, subject) ?? framework.fullLabel} that this ${subject.programSections.session} genuinely addresses. Copy each code EXACTLY as written (one code per entry — never bundle, alter or invent codes) and use the official statement as the "title".\n${kbList}`
    : "";

  const centreSection = input.centreContext
    ? `\n\nCentre: ${input.centreContext.centreName}.\nRecently delivered at this centre (avoid repeating titles + skill focus):\n${input.centreContext.recentPrograms
        .map((p) => `- ${p.title}${p.skillFocus ? ` (${p.skillFocus})` : ""}`)
        .join("\n")}`
    : "";

  const p = input.progression;
  const progressionSection = p
    ? `\n\nThis session is WEEK ${p.week} OF ${p.totalWeeks} in a progressive coaching block${
        p.seriesTitle ? ` called "${p.seriesTitle}"` : ""
      }.${
        p.previousWeeks.length > 0
          ? `\nEarlier weeks covered:\n${p.previousWeeks
              .map(
                (w) =>
                  `- Week ${w.week}: ${w.title} — objectives: ${w.objectives.join("; ")} — drills: ${w.skills.join(", ")}`
              )
              .join("\n")}\nOpen with a brief revisit of last week's key skill, then EXTEND it — introduce the next step in difficulty or a new complementary skill. Do not repeat earlier drills wholesale; progress them.`
          : `\nThis is the opening week: establish the foundations the later weeks will build on, and keep the ceiling low enough that every child succeeds early.`
      }${
        p.week === p.totalWeeks
          ? `\nThis is the FINAL week: build toward a celebratory session that combines the block's skills in game form, and make the reflection prompt a look back across the whole block.`
          : ""
      }\nTitle the session so the progression is visible (e.g. a consistent theme with this week's focus).`
    : "";

  const opening = isLesson
    ? `You are designing a ${input.durationMinutes}-minute ${subject.label} lesson on the ${subject.strandLabel.toLowerCase()} "${input.sport}".`
    : `You are designing a ${input.durationMinutes}-minute coaching session for ${input.sport}.`;
  const kitLabel = isLesson ? "Available resources" : "Available equipment";

  return `${opening}

${ageSection}

${kitLabel}: ${input.availableEquipment.join(", ")}.${skillFocusSection}${levelSection}${unknownSportSection}${centreSection}${progressionSection}${outcomeSection}

Return the full program as structured JSON following the ProgramContentJson schema.`;
}
