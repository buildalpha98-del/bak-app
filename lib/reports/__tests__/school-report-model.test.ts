import { describe, it, expect } from "vitest";
import { aggregateSchoolReport, schoolSummary, type SchoolReportInput } from "../school-report-model";

const base: SchoolReportInput = {
  framework: "nsw",
  classes: [
    { id: "c2", name: "2R", year_group: "2" },
    { id: "c4", name: "4T", year_group: "4" },
  ],
  children: [
    { id: "a", age_group: "5-8", class_id: "c2" },
    { id: "b", age_group: "5-8", class_id: "c2" },
    { id: "c", age_group: "8-12", class_id: "c4" },
    { id: "d", age_group: "8-12", class_id: null },
  ],
  sessions: [
    { id: "s1", sport: "Soccer", program: { subject: "pdhpe", curriculumOutcomes: [{ code: "PDe-1 / PD1-6 / PD2-6", title: "model title" }] } },
    { id: "s2", sport: "Athletics", program: { subject: null, curriculumOutcomes: [{ code: "PD2-4", title: "x" }, { code: "EYLF 3.1", title: "y" }] } },
  ],
  lessons: [
    { subject: "english", sport: "Reading comprehension", content: { curriculumOutcomes: [{ code: "EN1-RECOM-01", title: "t" }] } },
    { subject: "mathematics", sport: "Number and algebra", content: { curriculumOutcomes: [{ code: "MA3-RN-01", title: "t" }, { code: "MA3-RN-01", title: "dup" }] } },
  ],
  templates: [
    { id: "t-pd", subject: "pdhpe", sport: "Soccer", age_group: "5-8" },
    { id: "t-en", subject: "english", sport: "Reading comprehension", age_group: "5-8" },
    { id: "t-ma", subject: "mathematics", sport: "Number and algebra", age_group: "8-12" },
  ],
  ratings: [
    { child_id: "a", template_id: "t-pd", marks: [3, 4] },
    { child_id: "b", template_id: "t-pd", marks: [5] },
    { child_id: "a", template_id: "t-en", marks: [2, 2] },
    { child_id: "c", template_id: "t-ma", marks: [4, 4, 5] },
  ],
  prev_ratings: [{ child_id: "a", template_id: "p-pd", marks: [3] }],
  prev_templates: [{ id: "p-pd", subject: "pdhpe" }],
  quizzes: [{ id: "q1", subject: "mathematics" }],
  quiz_results: [
    { quiz_id: "q1", score: 6, total: 8 },
    { quiz_id: "q1", score: 8, total: 8 },
  ],
  release: { released_at: "2026-09-21T00:00:00Z", due_date: "2026-09-25" },
  term_plans: [{ class_name: "4T", year_group: "4", subject: "pdhpe", title: "Stage 2 PDHPE", status: "approved", units: 2 }],
  officialStatement: (code) => (code.toUpperCase() === "PD2-4" ? "official PD2-4" : null),
};

describe("aggregateSchoolReport", () => {
  const out = aggregateSchoolReport(base);
  const by = Object.fromEntries(out.subjects.map((s) => [s.subject, s]));

  it("reports every subject present, with sessions to PDHPE and lessons by subject", () => {
    expect(out.subjects.map((s) => s.subject)).toEqual(["pdhpe", "english", "mathematics"]);
    expect(by.pdhpe.sessions).toBe(2);
    expect(by.pdhpe.lessons).toBe(0);
    expect(by.english.lessons).toBe(1);
    expect(by.pdhpe.strands).toEqual(["Athletics", "Soccer"]);
    expect(out.sessions_total).toBe(2);
    expect(out.lessons_total).toBe(2);
  });

  it("counts assessable student × template pairs by band and how many were rated", () => {
    expect(by.pdhpe.assessable).toBe(2); // 5-8 band: a, b
    expect(by.pdhpe.assessed).toBe(2);
    expect(by.mathematics.assessable).toBe(2); // 8-12: c, d
    expect(by.mathematics.assessed).toBe(1);
    expect(out.assessment_completion).toEqual({ done: 4, total: 6 });
  });

  it("averages marks per subject with term-over-term movement", () => {
    expect(by.pdhpe.avg_mark).toBe(4); // 3,4,5
    expect(by.pdhpe.mark_delta).toBe(1); // vs 3 last term
    expect(by.english.avg_mark).toBe(2);
    expect(by.english.mark_delta).toBeNull();
  });

  it("rolls marks up by stage from the student's class", () => {
    expect(by.pdhpe.by_stage).toEqual([{ stage: "Stage 1", students: 2, assessed: 2, avg_mark: 4 }]);
    // d has no class → no stage; c is Stage 2.
    expect(by.mathematics.by_stage).toEqual([{ stage: "Stage 2", students: 1, assessed: 1, avg_mark: 4.3 }]);
  });

  it("summarises quizzes", () => {
    expect(by.mathematics.quizzes).toBe(1);
    expect(by.mathematics.quiz_results).toBe(2);
    expect(by.mathematics.quiz_avg_pct).toBe(88);
    expect(by.english.quiz_avg_pct).toBeNull();
  });

  it("lists outcomes addressed per subject, split from bundles, deduped, official statement where known, EYLF dropped", () => {
    expect(by.pdhpe.outcomes.map((o) => o.code)).toEqual(["PD1-6", "PD2-4", "PD2-6", "PDe-1"]);
    expect(by.pdhpe.outcomes.find((o) => o.code === "PD2-4")?.title).toBe("official PD2-4");
    expect(by.pdhpe.outcomes.find((o) => o.code === "PD2-6")?.title).toBe("model title");
    expect(by.mathematics.outcomes).toEqual([{ code: "MA3-RN-01", title: "t" }]);
  });

  it("carries report-card release and term plans through", () => {
    expect(out.report_cards).toEqual({ released: true, released_at: "2026-09-21T00:00:00Z", due_date: "2026-09-25" });
    expect(out.term_plans[0].status).toBe("approved");
  });

  it("writes a school summary line", () => {
    expect(schoolSummary(out)).toBe(
      "2 coaching sessions and 2 teacher lessons across PDHPE, English, Mathematics. 4 of 6 assessments complete. Report cards released."
    );
  });

  it("omits subjects with nothing this term", () => {
    const only = aggregateSchoolReport({ ...base, lessons: [], templates: base.templates.filter((t) => t.subject === "pdhpe"), quizzes: [], quiz_results: [], ratings: base.ratings.filter((r) => r.template_id === "t-pd") });
    expect(only.subjects.map((s) => s.subject)).toEqual(["pdhpe"]);
  });
});
