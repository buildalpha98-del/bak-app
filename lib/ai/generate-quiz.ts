import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "@/lib/ai/model";
import type { SubjectDef } from "@/lib/curriculum/subjects";
import { normaliseQuestions, type QuizQuestion } from "@/lib/quizzes/quiz-model";

// ============================================================
// Claude API quiz generator (server-only) — migration 092
// ============================================================

let client: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const OUTPUT_SCHEMA = `Return ONLY a JSON object with no markdown or code fences:
{
  "title": "string — short quiz title",
  "questions": [
    {
      "id": "q1",
      "prompt": "string — the question as a student reads it",
      "type": "multiple_choice" | "short_answer",
      "options": ["string", "string", "string", "string"] — multiple_choice only, exactly 4,
      "answer": number — index of the correct option (multiple_choice) | "string — model answer" (short_answer),
      "skill": "string — the skill or outcome this checks"
    }
  ]
}`;

function systemPrompt(subject: SubjectDef): string {
  const who =
    subject.key === "pdhpe"
      ? "children's sport and physical education teacher"
      : `NSW primary ${subject.label} teacher`;
  return `You are an experienced ${who} in Australia writing a short knowledge check for a class. Write 8 questions: 6 multiple choice (4 options, one clearly correct, plausible distractors) and 2 short answer (with a model answer a teacher can mark against). Match the age band exactly — vocabulary, sentence length and number ranges a child of that age reads independently. Order from easiest to hardest. Each question names the skill it checks. Use Australian English.

Age band guidance:
- 3-5 years: picture-free, one-line questions a teacher reads aloud; concrete and playful
- 5-8 years: short sentences, familiar contexts, numbers to 100
- 8-12 years: multi-step reasoning, precise vocabulary, explain-why short answers

${OUTPUT_SCHEMA}`;
}

export interface GenerateQuizInput {
  subject: SubjectDef;
  focus: string;
  ageBand: string;
  /** When attached to a lesson: what it taught, so the questions match. */
  lesson?: {
    title: string;
    objectives: string[];
    activities: string[];
  };
}

function parseResponse(text: string): { title: string; questions: QuizQuestion[] } {
  const attempt = (s: string) => JSON.parse(s) as { title?: unknown; questions?: unknown };
  let parsed: { title?: unknown; questions?: unknown } | null = null;
  try {
    parsed = attempt(text);
  } catch {
    const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    const candidates = [fence?.[1], first !== -1 && last > first ? text.slice(first, last + 1) : undefined];
    for (const c of candidates) {
      if (!c) continue;
      try {
        parsed = attempt(c);
        break;
      } catch {
        /* next */
      }
    }
  }
  if (!parsed) throw new Error("Failed to parse the quiz from the AI response.");
  const questions = normaliseQuestions(parsed.questions, 10);
  if (questions.length < 4) throw new Error("The AI returned too few usable questions. Please try again.");
  const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Knowledge check";
  return { title, questions };
}

export async function generateQuiz(input: GenerateQuizInput): Promise<{ title: string; questions: QuizQuestion[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Please add it to your environment variables.");
  }
  const lessonSection = input.lesson
    ? `\n\nThe quiz follows this lesson — test what it taught, nothing outside it:\nTitle: ${input.lesson.title}\nObjectives:\n${input.lesson.objectives.map((o) => `- ${o}`).join("\n")}\nActivities: ${input.lesson.activities.join("; ")}`
    : "";
  const message = await getAnthropic().messages.create({
    model: AI_MODEL,
    max_tokens: 3000,
    system: systemPrompt(input.subject),
    messages: [
      {
        role: "user",
        content: `Write a knowledge check for ${input.subject.label} — ${input.subject.strandLabel.toLowerCase()}: ${input.focus} — for the ${input.ageBand} age band.${lessonSection}`,
      },
    ],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response received from AI.");
  return parseResponse(textBlock.text);
}
