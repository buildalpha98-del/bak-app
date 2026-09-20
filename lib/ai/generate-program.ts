import Anthropic from "@anthropic-ai/sdk";
import type { ProgramContentJson } from "./types";
import { buildProgramPrompt, kbBandsFor, type BuildProgramPromptInput } from "./program-prompt";
import { validateOutcomes } from "@/lib/curriculum/knowledge-base";
import { AI_MODEL } from "@/lib/ai/model";
import { SUBJECTS, type SubjectDef } from "@/lib/curriculum/subjects";
import { FRAMEWORKS, type FrameworkDef } from "@/lib/curriculum/frameworks";

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

// The JSON schema is shared by every subject: an English or Maths lesson
// fills the same five sections (warmUp = hook, skillDevelopment =
// explicit teaching + guided practice, modifiedGame = independent task,
// coolDown = reflection/plenary, equipmentNeeded = resources), so the
// editor, PDFs, Scope & Sequence and the coach app need no second shape.
// Only the headings differ (lib/curriculum/subjects.ts programSections).

const LESSON_SYSTEM_PROMPT = (subject: SubjectDef, framework: FrameworkDef) => `You are an experienced ${framework.persona(subject)} and curriculum designer working for Build Alpha Kids, which supports Australian schools with curriculum programmes.

Your task is to generate a structured ${subject.label} lesson plan as a single JSON object. The JSON uses the field names of our sports-session schema; fill them with lesson content as follows:
- "warmUp" = the HOOK / tuning-in activity that opens the lesson
- "skillDevelopment" = 2-3 EXPLICIT TEACHING and GUIDED PRACTICE activities (each with progressions = ways to support or extend)
- "modifiedGame" = the INDEPENDENT or applied task ("rules" = success criteria the students work to, "variations" = 2-3 ways to differentiate)
- "coolDown" = the REFLECTION / plenary that closes the lesson
- "equipmentNeeded" = resources, only from the available resources list
- "sport" = the ${subject.strandLabel.toLowerCase()} name exactly as given

## Age-Appropriate Guidance
- 3-5 years: play-based, oral, short bursts (3-5 min), concrete materials, lots of modelling
- 5-8 years (${framework.bandLabels["Early Stage 1"]} / ${framework.bandLabels["Stage 1"]}): explicit modelling, guided practice with concrete materials, 5-8 minute activities, simple success criteria
- 8-12 years (${framework.bandLabels["Stage 2"]} / ${framework.bandLabels["Stage 3"]}): strategies named and practised, independent application, 8-12 minute activities, reasoning and reflection
- 12-16 years (${framework.bandLabels["Stage 4"]} / ${framework.bandLabels["Stage 5"]}, Years 7-10): subject-specific vocabulary and abstraction, sustained independent and collaborative tasks, explicit success criteria, justification and evaluation

## Curriculum Alignment
${framework.alignmentGuidance(subject)} For ages 3-5 use EYLF V2.0 outcomes instead. Select 2-3 that genuinely apply. Set "framework" to "${subject.key}" (or "eylf").

## Reflection Prompt
Also generate a "reflectionPrompt": 2-3 sentences in first person that the teacher could use for their planning notes, referencing specific activities and the outcomes addressed.

## Resource Constraints
Only use resources from the "available resources" list provided.
`;

const NSW_PDHPE_ROWS = `Use NSW PDHPE syllabus outcomes. Select 2-3 that apply, and ALWAYS include the code for every stage the age band covers (Early Stage 1 = Kindergarten, Stage 1 = Years 1-2, Stage 2 = Years 3-4, Stage 3 = Years 5-6, Stage 4 = Years 7-8, Stage 5 = Years 9-10; the 8-12 band spans Stage 2 AND Stage 3, the 12-16 band spans Stage 4 AND Stage 5):
- PDe-1 / PD1-6 / PD2-6 / PD3-4 / PD4-4 / PD5-4: Movement skill and performance
- PDe-3 / PD1-7 / PD2-7 / PD3-5 / PD4-5 / PD5-5: Active lifestyle and fitness
- PDe-6 / PD1-9 / PD2-9 / PD3-9 / PD4-9 / PD5-9: Safe practices
- PDe-2 / PD1-3 / PD2-3 / PD3-3 / PD4-3 / PD5-3: Interpersonal relationships / teamwork`;

const VIC_HPE_ROWS = `${FRAMEWORKS.vic.alignmentGuidance(SUBJECTS.pdhpe)} Select 2-3 that apply, and ALWAYS include the code for every band the age group covers (the 5-8 band spans Foundation AND Levels 1-2, the 8-12 band spans Levels 3-4 AND Levels 5-6, the 12-16 band spans Levels 7-8 AND Levels 9-10). Most sessions align with the Movement and Physical Activity strand (VC2HP…M…: fundamental movement skills, movement sequences, game play and tactics, fitness and physical activity) plus one Personal, Social and Community Health description (VC2HP…P…: cooperation, fair play, safety). Set "framework" to "pdhpe".`;

const sportSystemPrompt = (framework: FrameworkDef) => `You are an experienced children's sports coaching programme designer for Build Alpha Kids, an Australian multi-sport programme provider operating across childcare centres and schools.

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

### Ages 12–16 (Secondary, Years 7–10)
- Sport-specific technique under pressure, game sense and tactical problem solving
- Full-rules or small-sided competitive formats with officiating and leadership roles
- Fitness components named and trained (aerobic, strength, agility) with student-designed variations
- 10–15 minute activities; students coach, referee and reflect

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

### For ages 5-8, 8-12 and 12-16 (Schools — ${framework.fullLabel}):
${framework.key === "vic" ? VIC_HPE_ROWS : NSW_PDHPE_ROWS}

### Reflection Prompt
Also generate a "reflectionPrompt" field: a 2-3 sentence paragraph that an educator could use as a starting point for their daily reflection or learning journal entry about this session. Write it in first person as if the educator is reflecting. Reference specific activities from the session and the curriculum outcomes addressed.

## Equipment Constraints
Only use equipment from the "available equipment" list provided. Do not suggest equipment that is not on the list.

${OUTPUT_FORMAT}`;

const OUTPUT_FORMAT = `## Output Format
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
      "coachingTips": "string — what to look for, common mistakes",
      "scaffolds": { "3-5": "string — 1-2 lines on adjusting this drill for this band", "5-8": "string", "8-12": "string", "12-16": "string" }
    }
  ],

MANDATORY when the request names MORE THAN ONE age band: every entry in
skillDevelopment MUST include "scaffolds", with exactly one key per requested
band and no others. A mixed-age drill without scaffolds is unusable — the coach
is running 3-year-olds and 12-year-olds in the same space. When the request
names only ONE age band, omit "scaffolds" entirely.
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
      "framework": "eylf" or "pdhpe" or "english" or "mathematics",
      "code": "string — e.g. EYLF 3.1, PD1-6, EN1-RECOM-01, MA1-RN-01",
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

  const subject = request.subject ?? SUBJECTS.pdhpe;
  const framework = request.framework ?? FRAMEWORKS.nsw;
  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    system:
      subject.key === "pdhpe"
        ? sportSystemPrompt(framework)
        : `${LESSON_SYSTEM_PROMPT(subject, framework)}\n${OUTPUT_FORMAT}`,
    messages: [
      {
        role: "user",
        content: buildProgramPrompt(request),
      },
    ],
  });

  // A truncated response is the most likely failure for a big
  // multi-age plan, and it surfaces as an inscrutable JSON parse
  // error three frames later. Name it here instead.
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "The programme was cut off before it finished generating (hit the output limit). Try fewer age bands or a shorter duration."
    );
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response received from AI.");
  }

  const content = parseResponse(textBlock.text);
  content.subject = subject.key;

  // Knowledge-base check: every code must exist and sit in the band;
  // the official statement replaces the model's title. If the model
  // returned nothing usable, keep its list rather than ship a blank
  // section — the report card's nearest-band fallback still applies.
  const bands = kbBandsFor(request);
  if (bands.length > 0) {
    const check = validateOutcomes(content.curriculumOutcomes, { bands });
    if (check.kept.length > 0) content.curriculumOutcomes = check.kept;
    if (process.env.NODE_ENV !== "production" && (check.unknown.length || check.offBand.length)) {
      console.warn("generateProgram: outcomes rejected by the knowledge base", {
        unknown: check.unknown,
        offBand: check.offBand,
      });
    }
  }
  return content;
}
