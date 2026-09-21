import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { frameworkOf } from "@/lib/curriculum/frameworks";
import { officialStatement } from "@/lib/curriculum/knowledge-base";
import { isTermPlanJson } from "@/lib/curriculum/term-plan";
import { aggregateSchoolReport, type SchoolReportContent, type SchoolReportInput } from "./school-report-model";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const marksOf = (ratings_json: unknown): number[] =>
  ((ratings_json as { rating: number }[]) ?? []).map((s) => s.rating).filter((n) => Number.isFinite(n));

/**
 * Gather the rows for a school's term report and aggregate them by
 * subject and stage. Returns null for a centre without a class list
 * (childcare) so the compiler can leave `school` absent.
 */
export async function compileSchoolReport(
  supabase: Supabase,
  centreId: string,
  opts: { termId: string; prevTermId: string | null; termSessionIds: string[] }
): Promise<SchoolReportContent | null> {
  const { data: classRows } = await supabase
    .from("school_classes")
    .select("id, name, year_group, school_year")
    .eq("centre_id", centreId);
  if (!classRows || classRows.length === 0) return null;
  const latestYear = Math.max(...classRows.map((c) => c.school_year));
  const classes = classRows.filter((c) => c.school_year === latestYear).map((c) => ({ id: c.id, name: c.name, year_group: c.year_group }));

  const [{ data: centre }, { data: term }, { data: members }, { data: enrolled }] = await Promise.all([
    supabase.from("centres").select("curriculum_framework").eq("id", centreId).maybeSingle(),
    supabase.from("terms").select("start_date, end_date").eq("id", opts.termId).maybeSingle(),
    supabase.from("school_class_children").select("class_id, child_id").in("class_id", classes.map((c) => c.id)).is("ended_at", null),
    supabase.from("centre_children").select("child_id").eq("centre_id", centreId).eq("status", "active"),
  ]);
  const classByChild = new Map((members ?? []).map((m) => [m.child_id, m.class_id]));
  const childIds = (enrolled ?? []).map((e) => e.child_id);
  const { data: childRows } = childIds.length
    ? await supabase.from("children").select("id, age_group").in("id", childIds).eq("status", "active")
    : { data: [] as Array<{ id: string; age_group: string | null }> };
  const children = (childRows ?? []).map((c) => ({ id: c.id, age_group: c.age_group, class_id: classByChild.get(c.id) ?? null }));

  const [sessionsRes, lessonsRes, templatesRes, prevTemplatesRes, ratingsRes, prevRatingsRes, quizzesRes, releaseRes, plansRes] =
    await Promise.all([
      opts.termSessionIds.length
        ? supabase.from("sessions").select("id, sport, programs(subject, content_json)").in("id", opts.termSessionIds)
        : Promise.resolve({ data: [] as unknown[] }),
      term
        ? supabase
            .from("programs")
            .select("subject, sport, content_json, planned_for, created_at")
            .eq("centre_id", centreId)
            .or(`and(planned_for.gte.${term.start_date},planned_for.lte.${term.end_date}),and(planned_for.is.null,created_at.gte.${term.start_date},created_at.lte.${term.end_date}T23:59:59)`)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("assessment_templates").select("id, subject, sport, age_group").eq("term_id", opts.termId).or(`centre_id.is.null,centre_id.eq.${centreId}`),
      opts.prevTermId
        ? supabase.from("assessment_templates").select("id, subject").eq("term_id", opts.prevTermId).or(`centre_id.is.null,centre_id.eq.${centreId}`)
        : Promise.resolve({ data: [] as Array<{ id: string; subject: string | null }> }),
      childIds.length
        ? supabase.from("skill_ratings").select("child_id, assessment_template_id, ratings_json").eq("term_id", opts.termId).in("child_id", childIds)
        : Promise.resolve({ data: [] as unknown[] }),
      opts.prevTermId && childIds.length
        ? supabase.from("skill_ratings").select("child_id, assessment_template_id, ratings_json").eq("term_id", opts.prevTermId).in("child_id", childIds)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("quizzes").select("id, subject").eq("centre_id", centreId),
      supabase.from("report_card_releases").select("released_at, due_date").eq("centre_id", centreId).eq("term_id", opts.termId).maybeSingle(),
      supabase.from("term_plans").select("subject, title, status, content_json, school_classes!inner(name, year_group)").eq("centre_id", centreId).eq("term_id", opts.termId),
    ]);

  const quizIds = ((quizzesRes.data ?? []) as Array<{ id: string }>).map((q) => q.id);
  const { data: quizResults } = quizIds.length
    ? await supabase.from("quiz_results").select("quiz_id, score, total").in("quiz_id", quizIds)
    : { data: [] as Array<{ quiz_id: string; score: number; total: number }> };

  const input: SchoolReportInput = {
    framework: frameworkOf(centre?.curriculum_framework).key,
    classes,
    children,
    sessions: ((sessionsRes.data ?? []) as Array<{ id: string; sport: string; programs: unknown }>).map((s) => {
      const p = s.programs as { subject?: string | null; content_json?: Record<string, unknown> | null } | null;
      return {
        id: s.id,
        sport: s.sport,
        program: p
          ? { subject: p.subject ?? null, curriculumOutcomes: (p.content_json?.curriculumOutcomes as Array<{ code?: string; title?: string }> | undefined) ?? null }
          : null,
      };
    }),
    lessons: ((lessonsRes.data ?? []) as Array<{ subject: string | null; sport: string; content_json: Record<string, unknown> | null }>).map((l) => ({
      subject: l.subject,
      sport: l.sport,
      content: { curriculumOutcomes: (l.content_json?.curriculumOutcomes as Array<{ code?: string; title?: string }> | undefined) ?? null },
    })),
    templates: (templatesRes.data ?? []) as Array<{ id: string; subject: string | null; sport: string; age_group: string }>,
    prev_templates: (prevTemplatesRes.data ?? []) as Array<{ id: string; subject: string | null }>,
    ratings: ((ratingsRes.data ?? []) as Array<{ child_id: string; assessment_template_id: string; ratings_json: unknown }>).map((r) => ({
      child_id: r.child_id,
      template_id: r.assessment_template_id,
      marks: marksOf(r.ratings_json),
    })),
    prev_ratings: ((prevRatingsRes.data ?? []) as Array<{ child_id: string; assessment_template_id: string; ratings_json: unknown }>).map((r) => ({
      child_id: r.child_id,
      template_id: r.assessment_template_id,
      marks: marksOf(r.ratings_json),
    })),
    quizzes: (quizzesRes.data ?? []) as Array<{ id: string; subject: string | null }>,
    quiz_results: quizResults ?? [],
    release: releaseRes.data ?? null,
    term_plans: ((plansRes.data ?? []) as Array<{ subject: string; title: string; status: string; content_json: unknown; school_classes: unknown }>).map((p) => {
      const cls = p.school_classes as { name: string; year_group: string };
      return {
        class_name: cls.name,
        year_group: cls.year_group,
        subject: p.subject,
        title: p.title,
        status: p.status,
        units: isTermPlanJson(p.content_json) ? p.content_json.units.length : 0,
      };
    }),
    officialStatement,
  };
  return aggregateSchoolReport(input);
}
