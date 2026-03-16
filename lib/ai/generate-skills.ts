import Anthropic from "@anthropic-ai/sdk";
import type { AssessmentSkill } from "@/lib/types/database";

// ============================================================
// Claude API Skill Framework Generator (server-only)
// ============================================================

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a children's sports development specialist in Australia. Generate 5-8 measurable skills appropriate for assessing children in the specified sport for the given age group. Each skill should be observable during a coaching session and rateable on a 1-5 scale.

Age group guidance:
- 3-5 years: gross motor skills, participation, listening, basic movement
- 5-8 years: fundamental movement skills, basic sport skills, cooperation, rule following
- 8-12 years: sport-specific techniques, tactical awareness, teamwork, sportsmanship

Return ONLY a JSON array with no markdown or code fences:
[{"name": "Skill Name", "description": "Brief description of what 1 (emerging) to 5 (excellent) looks like"}]`;

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
  ageGroup: string
): Promise<AssessmentSkill[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Please add it to your environment variables."
    );
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    temperature: 0.5,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate assessment skills for ${sport} for the ${ageGroup} age group.`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from AI.");
  }

  return validateSkills(parseResponse(textBlock.text));
}
