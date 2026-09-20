import Anthropic from "@anthropic-ai/sdk";
import type { AssessmentSkill } from "@/lib/types/database";
import { AI_MODEL } from "@/lib/ai/model";
import { SUBJECTS, type SubjectDef } from "@/lib/curriculum/subjects";
import { FRAMEWORKS, type FrameworkDef } from "@/lib/curriculum/frameworks";

// ============================================================
// Claude API Skill Framework Generator (server-only)
// ============================================================

// Lazily constructed — see the note in generate-program.ts: a
// module-level client snapshots the env at import, before any script's
// dotenv.config() has run.
let client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const OUTPUT_SCHEMA = `Return ONLY a JSON array with no markdown or code fences:
[{"name": "Skill Name", "description": "Brief description of what 1 (emerging) to 5 (excellent) looks like"}]`;

// One prompt per subject (migration 089). The output schema lives in the
// system prompt because that is what the model actually follows.
function systemPrompt(subject: SubjectDef, framework: FrameworkDef): string {
  const L = framework.bandLabels;
  const bands = {
    junior: `${L["Early Stage 1"]} / ${L["Stage 1"]}`,
    middle: `${L["Stage 2"]} / ${L["Stage 3"]}`,
    senior: `${L["Stage 4"]} / ${L["Stage 5"]}`,
  };
  if (subject.key === "english") {
    return `You are a ${framework.persona(subject)}. Generate 5-8 measurable skills a class teacher can assess for the specified English focus area and age group, aligned to the ${framework.documentName(subject)}. Each skill should be observable in classroom work and rateable on a 1-5 scale.

Age group guidance:
- 3-5 years: early literacy — oral language, listening, letter and sound awareness, engagement with books
- 5-8 years: ${bands.junior} — phonics, decoding, sight words, sentence writing, retelling
- 8-12 years: ${bands.middle} — fluency, comprehension strategies, text structure, purposeful writing, vocabulary
- 12-16 years: ${bands.senior} — analysing and composing texts across forms, language features and their effects, sustained argument and evidence

${OUTPUT_SCHEMA}`;
  }
  if (subject.key === "mathematics") {
    return `You are a ${framework.persona(subject)}. Generate 5-8 measurable skills a class teacher can assess for the specified Mathematics strand and age group, aligned to the ${framework.documentName(subject)}. Each skill should be observable in classroom work and rateable on a 1-5 scale.

Age group guidance:
- 3-5 years: early numeracy — counting, subitising, comparing, shapes, patterns
- 5-8 years: ${bands.junior} — number to 100, addition and subtraction strategies, measurement with informal units, 2D/3D shapes
- 8-12 years: ${bands.middle} — multiplication and division, fractions and decimals, formal units, data and chance, reasoning
- 12-16 years: ${bands.senior} — integers, ratio and rates, algebra and linear relationships, geometry proofs, statistics and probability

${OUTPUT_SCHEMA}`;
  }
  return `You are a children's sports development specialist in Australia. Generate 5-8 measurable skills appropriate for assessing children in the specified sport for the given age group. Each skill should be observable during a coaching session and rateable on a 1-5 scale.

Age group guidance:
- 3-5 years: gross motor skills, participation, listening, basic movement
- 5-8 years: fundamental movement skills, basic sport skills, cooperation, rule following
- 8-12 years: sport-specific techniques, tactical awareness, teamwork, sportsmanship
- 12-16 years: technique under pressure, game sense and tactics, fitness components, officiating and leadership

${OUTPUT_SCHEMA}`;
}

function parseResponse(text: string): AssessmentSkill[] {
  // Try direct JSON parse
  try {
    return JSON.parse(text) as AssessmentSkill[];
  } catch {
    // Fallback: extract from code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as AssessmentSkill[];
      } catch {
        // Fall through
      }
    }

    // Last resort: find first [ and last ]
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(text.slice(firstBracket, lastBracket + 1)) as AssessmentSkill[];
      } catch {
        // Fall through
      }
    }

    throw new Error("Failed to parse skills from AI response.");
  }
}

function validateSkills(skills: AssessmentSkill[]): AssessmentSkill[] {
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error("AI returned an empty or invalid skills array.");
  }

  return skills
    .filter((s) => s.name && typeof s.name === "string")
    .map((s) => ({
      name: s.name.trim(),
      description: typeof s.description === "string" ? s.description.trim() : "",
    }));
}

/**
 * Generate assessment skills for a sport + age group using Claude.
 * Server-only — never import from client components.
 */
export async function generateSkills(
  sport: string,
  ageGroup: string,
  subject: SubjectDef = SUBJECTS.pdhpe,
  framework: FrameworkDef = FRAMEWORKS.nsw
): Promise<AssessmentSkill[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Please add it to your environment variables."
    );
  }

  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 4000,
    system: systemPrompt(subject, framework),
    messages: [
      {
        role: "user",
        content:
          subject.key === "pdhpe"
            ? `Generate assessment skills for ${sport} for the ${ageGroup} age group.`
            : `Generate assessment skills for the ${subject.label} ${subject.strandLabel.toLowerCase()} "${sport}" for the ${ageGroup} age group.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from AI.");
  }

  return validateSkills(parseResponse(textBlock.text));
}
