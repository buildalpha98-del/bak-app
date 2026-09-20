// Pure quiz shapes and scoring (migration 092). No I/O, so the rules a
// teacher's marks depend on are testable without a database.

import { frameworkOf, quizBandFor, type FrameworkKey } from "@/lib/curriculum/frameworks";

export type QuizQuestionType = "multiple_choice" | "short_answer";

export interface QuizQuestion {
  id: string;
  prompt: string;
  type: QuizQuestionType;
  /** Multiple choice only: 3-4 options; `answer` is the correct index. */
  options?: string[];
  /** Index (multiple choice) or model answer (short answer). */
  answer: number | string;
  /** Skill or outcome the question checks, for the teacher's eye. */
  skill?: string;
}

/** One student's marks: question id → correct? */
export type QuizMarks = Record<string, boolean>;

export interface ScoredQuiz {
  score: number;
  total: number;
  percent: number;
}

export function scoreQuiz(questions: QuizQuestion[], marks: QuizMarks): ScoredQuiz {
  const total = questions.length;
  const score = questions.filter((q) => marks[q.id] === true).length;
  return { score, total, percent: total === 0 ? 0 : Math.round((score / total) * 100) };
}

/** Marks are complete when every question has been ticked or crossed. */
export function isFullyMarked(questions: QuizQuestion[], marks: QuizMarks): boolean {
  return questions.every((q) => typeof marks[q.id] === "boolean");
}

/** Word for a percentage on the school's scale, matching the report card. */
export function quizBand(percent: number, frameworkKey?: FrameworkKey): string {
  return quizBandFor(frameworkOf(frameworkKey), percent);
}

/**
 * Coerce whatever the model returned into clean questions: drop empties,
 * give every question an id, force 3-4 options with a valid answer index
 * for multiple choice, cap at `max`.
 */
export function normaliseQuestions(raw: unknown, max = 10): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: QuizQuestion[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== "object") return;
    const q = r as Record<string, unknown>;
    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) return;
    const type: QuizQuestionType = q.type === "multiple_choice" ? "multiple_choice" : "short_answer";
    const id = typeof q.id === "string" && q.id ? q.id : `q${i + 1}`;
    const skill = typeof q.skill === "string" && q.skill.trim() ? q.skill.trim() : undefined;
    if (type === "multiple_choice") {
      const options = Array.isArray(q.options)
        ? (q.options as unknown[]).filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4)
        : [];
      if (options.length < 3) return;
      const answer = Number(q.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return;
      out.push({ id, prompt, type, options, answer, skill });
    } else {
      const answer = typeof q.answer === "string" ? q.answer.trim() : String(q.answer ?? "").trim();
      if (!answer) return;
      out.push({ id, prompt, type, answer, skill });
    }
  });
  return out.slice(0, max);
}
