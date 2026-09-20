import type { FrameworkKey, YearBand } from "@/lib/curriculum/frameworks";
import { subjectForCode } from "@/lib/curriculum/frameworks";
import { SUBJECTS, SUBJECT_KEYS, isSubjectKey, type SubjectKey } from "@/lib/curriculum/subjects";
import { yearGroupToStage } from "@/lib/schools/year-groups";
import { splitOutcomeCode } from "@/lib/schools/outcome-codes";

// The school term report (September 2026): a principal reads a term by
// subject and stage, not by sport. This is the pure aggregation — rows
// in, report content out — so the numbers are testable without a
// database. lib/reports/school-report.ts gathers the rows; the compiler
// stores the result in centre_reports.content_json.school, and the
// portal and the PDF render it.

export interface SchoolSubjectReport {
  subject: SubjectKey;
  label: string;
  /** Coaching sessions delivered (PDHPE only — every roster session is PDHPE). */
  sessions: number;
  /** Teacher-written lessons on the term. */
  lessons: number;
  /** Sports / focus areas / strands covered. */
  strands: string[];
  /** Assessment templates this term. */
  templates: number;
  /** Student × template pairs that could be rated, and how many were. */
  assessable: number;
  assessed: number;
  avg_mark: number | null;
  /** This term's average minus last term's, one decimal. */
  mark_delta: number | null;
  quizzes: number;
  quiz_results: number;
  quiz_avg_pct: number | null;
  /** Outcomes / content descriptions addressed, official statements where known. */
  outcomes: Array<{ code: string; title: string }>;
  by_stage: Array<{ stage: YearBand; students: number; assessed: number; avg_mark: number | null }>;
}

export interface SchoolReportContent {
  framework: FrameworkKey;
  subjects: SchoolSubjectReport[];
  assessment_completion: { done: number; total: number };
  report_cards: { released: boolean; released_at: string | null; due_date: string | null };
  term_plans: Array<{ class_name: string; year_group: string; subject: string; title: string; status: string; units: number }>;
  sessions_total: number;
  lessons_total: number;
}

export interface SchoolReportInput {
  framework: FrameworkKey;
  classes: Array<{ id: string; name: string; year_group: string }>;
  /** Enrolled, active students with their class (null when unassigned). */
  children: Array<{ id: string; age_group: string | null; class_id: string | null }>;
  sessions: Array<{
    id: string;
    sport: string;
    program: { subject?: string | null; curriculumOutcomes?: Array<{ code?: string | null; title?: string | null }> | null } | null;
  }>;
  lessons: Array<{
    subject: string | null;
    sport: string;
    content: { curriculumOutcomes?: Array<{ code?: string | null; title?: string | null }> | null } | null;
  }>;
  templates: Array<{ id: string; subject: string | null; sport: string; age_group: string }>;
  ratings: Array<{ child_id: string; template_id: string; marks: number[] }>;
  prev_ratings: Array<{ child_id: string; template_id: string; marks: number[] }>;
  /** Last term's templates, to map prev ratings to subjects. */
  prev_templates: Array<{ id: string; subject: string | null }>;
  quizzes: Array<{ id: string; subject: string | null }>;
  quiz_results: Array<{ quiz_id: string; score: number; total: number }>;
  release: { released_at: string | null; due_date: string | null } | null;
  term_plans: Array<{ class_name: string; year_group: string; subject: string; title: string; status: string; units: number }>;
  /** Official statement lookup (knowledge base) — injected so this stays pure. */
  officialStatement?: (code: string) => string | null;
}

const STAGE_ORDER: YearBand[] = ["Early Stage 1", "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"];

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const subjectOfKey = (v: string | null | undefined): SubjectKey => (isSubjectKey(v) ? v : "pdhpe");

export function aggregateSchoolReport(input: SchoolReportInput): SchoolReportContent {
  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const stageOfChild = new Map<string, YearBand | null>();
  for (const ch of input.children) {
    const cls = ch.class_id ? classById.get(ch.class_id) : null;
    stageOfChild.set(ch.id, cls ? yearGroupToStage(cls.year_group) : null);
  }
  const templateSubject = new Map(input.templates.map((t) => [t.id, subjectOfKey(t.subject)]));
  const prevTemplateSubject = new Map(input.prev_templates.map((t) => [t.id, subjectOfKey(t.subject)]));
  const quizSubject = new Map(input.quizzes.map((q) => [q.id, subjectOfKey(q.subject)]));

  const subjects: SchoolSubjectReport[] = [];
  let done = 0;
  let total = 0;

  for (const key of SUBJECT_KEYS) {
    const sessions = key === "pdhpe" ? input.sessions : [];
    const lessons = input.lessons.filter((l) => subjectOfKey(l.subject) === key);
    const templates = input.templates.filter((t) => subjectOfKey(t.subject) === key);
    const strands = Array.from(
      new Set([...sessions.map((s) => s.sport), ...lessons.map((l) => l.sport), ...templates.map((t) => t.sport)].filter(Boolean))
    ).sort();

    // Assessable = for each template, the students in its band.
    let assessable = 0;
    const rated = new Set<string>();
    for (const t of templates) {
      const band = input.children.filter((c) => c.age_group === t.age_group);
      assessable += band.length;
    }
    const marks: number[] = [];
    const byStage = new Map<YearBand, { students: Set<string>; marks: number[] }>();
    for (const r of input.ratings) {
      if (templateSubject.get(r.template_id) !== key) continue;
      rated.add(`${r.child_id}#${r.template_id}`);
      marks.push(...r.marks);
      const stage = stageOfChild.get(r.child_id) ?? null;
      if (stage) {
        const e = byStage.get(stage) ?? { students: new Set<string>(), marks: [] };
        e.students.add(r.child_id);
        e.marks.push(...r.marks);
        byStage.set(stage, e);
      }
    }
    const prevMarks: number[] = [];
    for (const r of input.prev_ratings) {
      if (prevTemplateSubject.get(r.template_id) !== key) continue;
      prevMarks.push(...r.marks);
    }
    const avgMark = avg(marks);
    const prevAvg = avg(prevMarks);
    const markDelta = avgMark != null && prevAvg != null ? Math.round((avgMark - prevAvg) * 10) / 10 : null;

    const quizzes = input.quizzes.filter((q) => quizSubject.get(q.id) === key);
    const quizIds = new Set(quizzes.map((q) => q.id));
    const results = input.quiz_results.filter((r) => quizIds.has(r.quiz_id) && r.total > 0);
    const quizAvg = results.length ? Math.round((results.reduce((a, r) => a + r.score / r.total, 0) / results.length) * 100) : null;

    // Outcomes addressed: every atomic code from this subject's sessions
    // and lessons, deduped, official statement where the knowledge base
    // knows it.
    const seen = new Map<string, string>();
    const collect = (list: Array<{ code?: string | null; title?: string | null }> | null | undefined) => {
      for (const o of list ?? []) {
        if (!o?.code) continue;
        for (const atomic of splitOutcomeCode(String(o.code))) {
          if (subjectForCode(atomic)?.key !== key) continue;
          const k = atomic.toUpperCase();
          if (!seen.has(k)) seen.set(k, input.officialStatement?.(atomic) ?? o.title?.trim() ?? "");
        }
      }
    };
    for (const s of sessions) collect(s.program?.curriculumOutcomes);
    for (const l of lessons) collect(l.content?.curriculumOutcomes);
    const outcomes = Array.from(seen.entries())
      .map(([code, title]) => ({ code: code.replace(/^([A-Z]{2})E-/, "$1e-"), title }))
      .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
      .slice(0, 40);

    // Students per stage in this subject's bands (for the stage table).
    const studentsByStage = new Map<YearBand, Set<string>>();
    for (const t of templates) {
      for (const c of input.children) {
        if (c.age_group !== t.age_group) continue;
        const stage = stageOfChild.get(c.id) ?? null;
        if (!stage) continue;
        const set = studentsByStage.get(stage) ?? new Set<string>();
        set.add(c.id);
        studentsByStage.set(stage, set);
      }
    }
    const by_stage = STAGE_ORDER.filter((s) => studentsByStage.has(s) || byStage.has(s)).map((stage) => ({
      stage,
      students: studentsByStage.get(stage)?.size ?? byStage.get(stage)?.students.size ?? 0,
      assessed: byStage.get(stage)?.students.size ?? 0,
      avg_mark: avg(byStage.get(stage)?.marks ?? []),
    }));

    const present = sessions.length + lessons.length + templates.length + quizzes.length > 0;
    if (!present) continue;
    done += rated.size;
    total += assessable;
    subjects.push({
      subject: key,
      label: SUBJECTS[key].label,
      sessions: sessions.length,
      lessons: lessons.length,
      strands,
      templates: templates.length,
      assessable,
      assessed: rated.size,
      avg_mark: avgMark,
      mark_delta: markDelta,
      quizzes: quizzes.length,
      quiz_results: results.length,
      quiz_avg_pct: quizAvg,
      outcomes,
      by_stage,
    });
  }

  return {
    framework: input.framework,
    subjects,
    assessment_completion: { done, total },
    report_cards: {
      released: !!input.release?.released_at,
      released_at: input.release?.released_at ?? null,
      due_date: input.release?.due_date ?? null,
    },
    term_plans: input.term_plans,
    sessions_total: input.sessions.length,
    lessons_total: input.lessons.length,
  };
}

/** One-line summary for the report header. */
export function schoolSummary(s: SchoolReportContent): string {
  const subjectList = s.subjects.map((x) => x.label).join(", ");
  const parts = [
    `${s.sessions_total} coaching session${s.sessions_total === 1 ? "" : "s"}`,
    `${s.lessons_total} teacher lesson${s.lessons_total === 1 ? "" : "s"}`,
  ];
  const completion = s.assessment_completion.total > 0
    ? ` ${s.assessment_completion.done} of ${s.assessment_completion.total} assessments complete.`
    : "";
  const cards = s.report_cards.released ? " Report cards released." : " Report cards not yet released.";
  return `${parts.join(" and ")} across ${subjectList || "the term"}.${completion}${cards}`;
}
