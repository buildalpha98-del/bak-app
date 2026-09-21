import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "@/lib/ai/model";
import type { FrameworkDef, YearBand } from "@/lib/curriculum/frameworks";
import type { SubjectDef } from "@/lib/curriculum/subjects";
import { promptOutcomeList, syllabusNameFor } from "@/lib/curriculum/knowledge-base";
import { exemplarPromptText, nearestExemplarFor } from "@/lib/curriculum/exemplars";
import { normaliseTermPlan, type TermPlanIssue, type TermPlanJson } from "@/lib/curriculum/term-plan";

// ============================================================
// Claude term-plan generator (migration 096) — server-only
// ============================================================
// Drafts a class's Scope & Sequence for one subject and term: units,
// the weeks each runs, the outcomes each addresses, assessment, and a
// focus line per week. Modelled on the Department's sample scope and
// sequence for the same stage/subject/term (lib/curriculum/exemplars)
// and restricted to the knowledge base's real outcomes.

let client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const OUTPUT_FORMAT = `## Output format
Return ONLY a JSON object with no markdown or code fences:
{
  "title": "string — e.g. 'Stage 2 English — Term 3'",
  "rationale": "string — 2-3 sentences: how the term builds, and why this sequence",
  "units": [
    {
      "title": "string — the unit's name, as a school would file it",
      "strand": "string — strand / focus area / programme type",
      "weeks": [1, 2, 3],
      "description": "string — 2-4 sentences on what students learn and do",
      "inquiryQuestions": ["string"],
      "outcomes": [{ "code": "string — EXACTLY as listed", "title": "string — the official statement as listed", "description": "string — how the unit addresses it" }],
      "assessment": "string — the assessment point and what evidence it gathers",
      "weeklyFocus": [{ "week": 1, "focus": "string — one line: the lesson focus for that week" }]
    }
  ]
}`;

export interface GenerateTermPlanInput {
  framework: FrameworkDef;
  subject: SubjectDef;
  bands: YearBand[];
  bandLabel: string;
  yearGroups: string[];
  className: string;
  termName: string;
  /** Term number 1–4 when it can be read from the term name. */
  termNumber: number | null;
  weekCount: number;
  /** The term's start date — picks the syllabus and the sample in force
   *  when the plan is TAUGHT, not when it is drafted. */
  on?: string;
  /** Teacher's steer: themes, priorities, constraints. */
  notes?: string;
}

export function systemPrompt(input: GenerateTermPlanInput): string {
  const { framework, subject } = input;
  const syllabus = syllabusNameFor(framework, subject, input.on) ?? framework.fullLabel;
  const noun = framework.outcomeNoun;
  const parallel =
    subject.key === "pdhpe"
      ? `PDHPE runs two strands side by side across the term — a Personal development and health unit and a Physical education unit — so two units may share the same weeks when their strands differ.`
      : subject.key === "mathematics"
        ? `Mathematics runs as four to five learning sequences in order, each two to three weeks, alternating Number and algebra with Measurement and space / Statistics and probability; Working mathematically is embedded throughout.`
        : `English runs as two to four units in order, each covering several focus areas (reading, writing, oral language, spelling/phonics) around a text or purpose.`;
  return `You are an experienced ${framework.persona(subject)} and head of department writing a term scope and sequence for a class, for Build Alpha Kids, which supports Australian schools with curriculum programmes.

Write the plan a principal could file for curriculum compliance: unit titles, the weeks each unit runs, the ${syllabus} ${noun}s each addresses (codes copied exactly from the list you are given — never invent, alter or bundle codes), key inquiry questions, an assessment point per unit, and one focus line per week that a teacher can turn into a lesson.

Rules:
- Cover every week from 1 to the number given, in order. ${parallel}
- Select 2-4 ${noun}s per unit that the unit genuinely addresses, from the list only. Use the official statement as the "title".
- Match the structure, tone and rigour of the Department sample you are shown; do not copy its unit titles or descriptions.
- Australian English. Concrete, classroom-ready wording. No filler.

${OUTPUT_FORMAT}`;
}

export function userPrompt(input: GenerateTermPlanInput): string {
  const { framework, subject, bands } = input;
  const exemplar = nearestExemplarFor(framework, subject, bands, input.on);
  const sample = exemplar
    ? `## Department sample for this stage${exemplar.structuralOnly ? " (a NSW sample — use it for STRUCTURE only; every code must come from the list below)" : ""}\n${exemplarPromptText(exemplar, { term: input.termNumber })}`
    : `## No Department sample exists for this stage — follow the rules above.`;
  const list = promptOutcomeList(framework, subject, bands, { max: 120, on: input.on });
  return `Plan ${input.termName} for class ${input.className} (${input.yearGroups.map((y) => (y === "K" ? "Kindergarten" : `Year ${y}`)).join(" / ")}, ${input.bandLabel}) in ${framework.subjectLabel(subject)}. The term has ${input.weekCount} weeks.${
    input.notes ? `\n\nThe teacher's steer: ${input.notes}` : ""
  }

${sample}

## ${framework.label} ${framework.outcomeNoun}s for ${input.bandLabel} — choose ONLY from this list
${list}

Return the term plan as JSON following the output format.`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    for (const c of [fence?.[1], first !== -1 && last > first ? text.slice(first, last + 1) : undefined]) {
      if (!c) continue;
      try {
        return JSON.parse(c);
      } catch {
        /* next */
      }
    }
  }
  throw new Error("Failed to parse the term plan from the AI response.");
}

export async function generateTermPlan(
  input: GenerateTermPlanInput
): Promise<{ plan: TermPlanJson; issues: TermPlanIssue[]; unknownCodes: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Please add it to your environment variables.");
  }
  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system: systemPrompt(input),
    messages: [{ role: "user", content: userPrompt(input) }],
  });
  if (message.stop_reason === "max_tokens") {
    throw new Error("The term plan was cut off before it finished generating. Try a shorter steer.");
  }
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response received from AI.");
  const raw = parseJson(textBlock.text);
  return normaliseTermPlan(raw, {
    subject: input.subject.key,
    bandLabel: input.bandLabel,
    bands: input.bands,
    weekCount: input.weekCount,
    on: input.on,
  });
}
