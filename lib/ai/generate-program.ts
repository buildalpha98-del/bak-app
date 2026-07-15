import Anthropic from "@anthropic-ai/sdk";
import type { ProgramContentJson } from "./types";
import { buildProgramPrompt, type BuildProgramPromptInput } from "./program-prompt";
import { AI_MODEL } from "@/lib/ai/model";

export type GenerateProgramInput = BuildProgramPromptInput;

// ============================================================
// Claude API Programme Generator (server-only)
// ============================================================

// Lazily constructed. The SDK reads ANTHROPIC_API_KEY at CONSTRUCTION
// time, so a module-level client captures the environment as it was at
// import — and ES imports hoist above a script's dotenv.config(), so
// any CLI script got a permanently key-less client ("Could not resolve
// authentication method"). Building on first use is identical for the
// app (Next loads env before modules) and correct everywhere else.
let client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

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

## Curriculum Alignment

Based on the age group, include relevant curriculum outcomes:

### For ages 3-5 (Early Childhood / Childcare):
Use the Early Years Learning Framework (EYLF) V2.0 outcomes:
- Outcome 1: Children have a strong sense of identity (1.1-1.4)
- Outcome 2: Children are connected with and contribute to their world (2.1-2.4)
- Outcome 3: Children have a strong sense of wellbeing (3.1-3.2)
- Outcome 4: Children are confident and involved learners (4.1-4.5)
- Outcome 5: Children are effective communicators (5.1-5.5)

Most sports sessions will align with Outcome 3 (wellbeing/physical), Outcome 1 (identity/confidence), and Outcome 4 (learning dispositions). Select 2-4 specific sub-outcomes that genuinely apply.

### For ages 5-8 and 8-12 (Schools):
Use NSW PDHPE syllabus outcomes. Select 2-3 that apply:
- PDe-1 / PD1-6 / PD2-6: Movement skill and performance
- PDe-3 / PD1-7 / PD2-7: Active lifestyle and fitness
- PDe-6 / PD1-9 / PD2-9: Safe practices
- PDe-2 / PD1-3 / PD2-3: Interpersonal relationships / teamwork

### Reflection Prompt
Also generate a "reflectionPrompt" field: a 2-3 sentence paragraph that an educator could use as a starting point for their daily reflection or learning journal entry about this session. Write it in first person as if the educator is reflecting. Reference specific activities from the session and the curriculum outcomes addressed.

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
  },
  "curriculumOutcomes": [
    {
      "framework": "eylf" or "pdhpe",
      "code": "string — e.g. EYLF 3.1 or PD1-6",
      "title": "string — short outcome title",
      "description": "string — how this session addresses the outcome"
    }
  ],
  "reflectionPrompt": "string — 2-3 sentences in first person for educator reflection"
}

Ensure the durations of all sections sum to the total session duration. Use Australian English (centre, colour, programme, organisation). Make activities creative, engaging, and fun.`;

// Prompt construction is now handled by the pure buildProgramPrompt helper
// in ./program-prompt.ts. See that file for the age-band scaffolding logic.

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
  request: GenerateProgramInput
): Promise<ProgramContentJson> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Please add it to your environment variables."
    );
  }

  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildProgramPrompt(request),
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from AI.");
  }

  return parseResponse(textBlock.text);
}
