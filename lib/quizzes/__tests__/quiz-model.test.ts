import { describe, it, expect } from "vitest";
import { scoreQuiz, isFullyMarked, quizBand, normaliseQuestions } from "../quiz-model";

const qs = normaliseQuestions([
  { id: "a", prompt: "8 + 5 = ?", type: "multiple_choice", options: ["12", "13", "14"], answer: 1 },
  { id: "b", prompt: "Show how you bridge to ten for 7 + 6.", type: "short_answer", answer: "7 + 3 = 10, then + 3 = 13" },
]);

describe("scoreQuiz / isFullyMarked", () => {
  it("counts only ticks and reports a percentage", () => {
    expect(scoreQuiz(qs, { a: true, b: false })).toEqual({ score: 1, total: 2, percent: 50 });
    expect(scoreQuiz(qs, {})).toEqual({ score: 0, total: 2, percent: 0 });
    expect(scoreQuiz([], {})).toEqual({ score: 0, total: 0, percent: 0 });
  });
  it("is fully marked only when every question is decided", () => {
    expect(isFullyMarked(qs, { a: true })).toBe(false);
    expect(isFullyMarked(qs, { a: true, b: false })).toBe(true);
  });
});

describe("quizBand", () => {
  it("maps percentages to the report-card words", () => {
    expect(quizBand(100)).toBe("Outstanding");
    expect(quizBand(80)).toBe("High");
    expect(quizBand(50)).toBe("Sound");
    expect(quizBand(30)).toBe("Basic");
    expect(quizBand(10)).toBe("Limited");
  });
});

describe("normaliseQuestions", () => {
  it("drops broken questions and caps the count", () => {
    const out = normaliseQuestions(
      [
        { prompt: "", type: "short_answer", answer: "x" },
        { prompt: "Too few options", type: "multiple_choice", options: ["a", "b"], answer: 0 },
        { prompt: "Bad answer index", type: "multiple_choice", options: ["a", "b", "c"], answer: 7 },
        { prompt: "Fine", type: "multiple_choice", options: ["a", "b", "c", "d", "e"], answer: 3, skill: "Recall" },
        { prompt: "Short", type: "short_answer", answer: 42 },
      ],
      10
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "q4", type: "multiple_choice", answer: 3, skill: "Recall" });
    expect(out[0].options).toHaveLength(4);
    expect(out[1]).toMatchObject({ id: "q5", type: "short_answer", answer: "42" });
    expect(normaliseQuestions("nope")).toEqual([]);
    expect(normaliseQuestions(Array(20).fill({ prompt: "p", type: "short_answer", answer: "a" }), 8)).toHaveLength(8);
  });
});
