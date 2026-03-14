import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerateProgramRequest,
  ProgramContentJson,
} from "./types";

// ============================================================
// Claude API Programme Generator (server-only)
// ============================================================

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an experienced children's sports coaching programme designer for Build Alpha Kids, an Australian multi-sport programme provider operating across childcare centres and schools in Sydney.

Your task is to generate a structured coaching session plan as a single JSON object. Follow these rules strictly:

## Age-Appropriate Guidance

### Ages 3–5 (Early Childhood)
- Focus on gross motor skills and play-based learning
- Use simple, clear instructions with demonstrations
- Lots of positive reinforcement and encouragement
- Short attention spans — change activities every 3–5 minutes
- Use imaginative themes (e.g. "pretend to be animals")
- Minimise waiting and standing in lines

### Ages 5–8 (Junior)
- Developing fundamental movement skills (run, jump, throw, catch, kick)
- Introduce basic rules and cooperative games
- Skill progressions from simple to slightly complex
- Medium attention spans — 5–8 minute activities
- Encourage teamwork and turn-taking

### Ages 8–12 (Senior)
- Refining sport-specific skills and tactical awareness
- Modified competitive games with fair play emphasis
- Peer interaction and leadership opportunities
- Longer attention spans — 8–12 minute activities
- Introduce basic strategy and decision-making

## Equipment Constraints
Only use equipment from the "available equipment" list provided. Do not suggest equipment that is not on the list.

## Output Format
Respond with ONLY a valid JSON object (no markdown, no explanation, no code fences). The JSON must match this exact structure:

{
  "title": "string — creative, descriptive session title",
  "sport": "string — the sport name",
  "ageGroup": "string — e.g. 3-5, 5-8, or 8-12",
  "duration": number — total session duration in minutes,
  "objectives": ["string array — 3-4 learning objectives"],
  "equipmentNeeded": ["string array — only from available equipment"],
  "warmUp": {
    "name": "string — activity name",
    "duration": number — minutes,
    "description": "string — clear instructions for the coach",
    "coachingTips": "string — key coaching points"
  },
  "skillDevelopment": [
    {
      "name": "string — drill name",
      "duration": number — minutes,
      "description": "string — step-by-step instructions",
      "progressions": ["string array — 2-3 ways to make it harder/easier"],
      "coachingTips": "string — what to look for, common mistakes"
    }
  ],
  "modifiedGame": {
    "name": "string — game name",
    "duration": number — minutes,
    "description": "string — how to play",
    "rules": ["string array — simple rules"],
    "variations": ["string array — 2-3 variations"],
    "coachingTips": "string — coaching focus during the game"
  },
  "coolDown": {
    "name": "string — activity name",
    "duration": number — minutes,
    "description": "string — wind-down activity and reflection"
  }
}

Ensure the durations of all sections sum to the total session duration. Use Australian English (centre, colour, programme, organisation). Make activities creative, engaging, and fun.`;

function buildUserMessage(request: GenerateProgramRequest): string {
  const parts: string[] = [
    `Generate a ${request.durationMinutes}-minute ${request.sport} coaching session plan.`,
    `Age group: ${request.ageGroup} years`,
    `Available equipment: ${request.availableEquipment.join(", ")}`,
  ];

  if (request.skillFocus) {
    parts.push(`Skill focus: ${request.skillFocus}`);
  }

  if (request.centreContext) {
    parts.push(`\nThis session is for ${request.centreContext.centreName}.`);
    if (request.centreContext.recentPrograms.length > 0) {
      parts.push(
        "Recent programmes delivered at this centre (avoid repeating these):"
      );
      for (const p of request.centreContext.recentPrograms) {
        parts.push(
          `  - ${p.title} (${p.sport}${p.skillFocus ? `, focus: ${p.skillFocus}` : ""})`
        );
      }
    }
  }

  return parts.join("\n");
}

function parseResponse(text: string): ProgramContentJson {
  // Try direct JSON parse first
  try {
    return JSON.parse(text) as ProgramContentJson;
  } catch {
    // Fallback: extract JSON from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as ProgramContentJson;
      } catch {
        // Fall through
      }
    }

    // Last resort: find first { and last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as ProgramContentJson;
      } catch {
        // Fall through
      }
    }

    throw new Error(
      "Failed to parse programme content from AI response. The response was not valid JSON."
    );
  }
}

/**
 * Generate a structured coaching programme using Claude.
 * Server-only — never import from client components.
 */
export async function generateProgram(
  request: GenerateProgramRequest
): Promise<ProgramContentJson> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    temperature: 0.7,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserMessage(request),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from AI.");
  }

  return parseResponse(textBlock.text);
}
