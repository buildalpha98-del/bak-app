"use server";

// Student quizzes (migration 092): a school's knowledge checks, the
// marking sheet for one quiz, and the teacher's marks. Reads through
// the cookie client (RLS: own school); writes through the admin client
// after the portal auth check, as every portal write does.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentClientUser } from "@/lib/client/actions";
import { scopeClasses, isClassScoped } from "@/lib/client/assessment-scope";
import { normaliseQuestions, scoreQuiz, type QuizQuestion, type QuizMarks } from "@/lib/quizzes/quiz-model";
import { isSubjectKey } from "@/lib/curriculum/subjects";

export interface SchoolQuiz {
  id: string;
  program_id: string | null;
  subject: string;
  focus: string;
  age_band: string;
  title: string;
  question_count: number;
  marked_count: number;
  author_name: string | null;
  created_at: string;
}

export interface QuizStudentRow {
  child: { id: string; first_name: string; last_name: string; class_name: string | null };
  marks: QuizMarks;
  score: number | null;
  total: number;
  marked_at: string | null;
}

export interface QuizMarkingSheet {
  quiz: {
    id: string;
    program_id: string | null;
    subject: string;
    focus: string;
    age_band: string;
    title: string;
    questions: QuizQuestion[];
  };
  rows: QuizStudentRow[];
}

async function requirePortalUser(centreId: string) {
  const { data: clientUser, error } = await getCurrentClientUser(centreId);
  if (error || !clientUser || clientUser.is_authorised_for_current === false) return null;
  if (clientUser.centre_type !== "school") return null;
  return clientUser;
}

export async function getSchoolQuizzes(
  centreId: string,
  programId?: string
): Promise<{ data: SchoolQuiz[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    let q = supabase
      .from("quizzes")
      .select("id, program_id, subject, focus, age_band, title, questions_json, created_by_client_user_id, created_at")
      .eq("centre_id", centreId)
      .order("created_at", { ascending: false });
    if (programId) q = q.eq("program_id", programId);
    const { data, error } = await q;
    if (error) return { data: [], error: error.message };
    if (!data || data.length === 0) return { data: [], error: null };

    const ids = data.map((r) => r.id);
    const { data: results } = await supabase.from("quiz_results").select("quiz_id").in("quiz_id", ids);
    const marked = new Map<string, number>();
    for (const r of results ?? []) marked.set(r.quiz_id, (marked.get(r.quiz_id) ?? 0) + 1);

    const authorIds = Array.from(new Set(data.map((r) => r.created_by_client_user_id).filter(Boolean))) as string[];
    const admin = createSupabaseAdmin();
    const { data: authors } = authorIds.length
      ? await admin.from("client_users").select("id, name").in("id", authorIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));

    return {
      data: data.map((r) => ({
        id: r.id,
        program_id: r.program_id,
        subject: r.subject,
        focus: r.focus,
        age_band: r.age_band,
        title: r.title,
        question_count: Array.isArray(r.questions_json) ? r.questions_json.length : 0,
        marked_count: marked.get(r.id) ?? 0,
        author_name: r.created_by_client_user_id ? authorName.get(r.created_by_client_user_id) ?? null : null,
        created_at: r.created_at,
      })),
      error: null,
    };
  } catch (err) {
    console.error("getSchoolQuizzes error:", err);
    return { data: [], error: "Failed to load quizzes." };
  }
}

export async function saveQuiz(
  centreId: string,
  input: {
    programId: string | null;
    subject: string;
    focus: string;
    ageBand: string;
    title: string;
    questions: QuizQuestion[];
  }
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const cu = await requirePortalUser(centreId);
    if (!cu) return { data: null, error: "Not authorised." };
    if (!isSubjectKey(input.subject)) return { data: null, error: "Unknown subject." };
    const questions = normaliseQuestions(input.questions, 10);
    if (questions.length < 4) return { data: null, error: "A quiz needs at least four questions." };
    const title = input.title.trim().slice(0, 120);
    if (!title) return { data: null, error: "Give the quiz a title." };

    if (input.programId) {
      const supabase = await createSupabaseServerClient();
      const { data: prog } = await supabase
        .from("programs")
        .select("id")
        .eq("id", input.programId)
        .eq("centre_id", centreId)
        .maybeSingle();
      if (!prog) return { data: null, error: "Lesson not found." };
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("quizzes")
      .insert({
        centre_id: centreId,
        program_id: input.programId,
        subject: input.subject,
        focus: input.focus.trim().slice(0, 120),
        age_band: input.ageBand,
        title,
        questions_json: questions,
        created_by_client_user_id: cu.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { data: { id: data.id }, error: null };
  } catch (err) {
    console.error("saveQuiz error:", err);
    return { data: null, error: "Failed to save the quiz." };
  }
}

/** The quiz plus every student the caller may mark, with any marks so far. */
export async function getQuizMarkingSheet(
  centreId: string,
  quizId: string
): Promise<{ data: QuizMarkingSheet | null; error: string | null }> {
  try {
    const cu = await requirePortalUser(centreId);
    if (!cu) return { data: null, error: "Not authorised." };
    const supabase = await createSupabaseServerClient();

    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, program_id, subject, focus, age_band, title, questions_json")
      .eq("id", quizId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!quiz) return { data: null, error: "Quiz not found." };
    const questions = normaliseQuestions(quiz.questions_json, 10);

    // Students: the caller's classes (all classes for the principal),
    // band-matched to the quiz.
    const { data: classRows } = await supabase
      .from("school_classes")
      .select("id, name, school_year")
      .eq("centre_id", centreId);
    const latestYear = classRows && classRows.length ? Math.max(...classRows.map((c) => c.school_year)) : null;
    const classes = scopeClasses((classRows ?? []).filter((c) => c.school_year === latestYear), cu.class_ids);
    const classById = new Map(classes.map((c) => [c.id, c.name]));
    const { data: members } = classes.length
      ? await supabase.from("school_class_children").select("class_id, child_id").in("class_id", classes.map((c) => c.id)).is("ended_at", null)
      : { data: [] as Array<{ class_id: string; child_id: string }> };
    const classOfChild = new Map((members ?? []).map((m) => [m.child_id, m.class_id]));

    let childIds: string[] = Array.from(classOfChild.keys());
    if (!isClassScoped(cu.class_ids)) {
      const { data: enrolled } = await supabase.from("centre_children").select("child_id").eq("centre_id", centreId).eq("status", "active");
      childIds = Array.from(new Set([...childIds, ...(enrolled ?? []).map((e) => e.child_id)]));
    }
    const { data: children } = childIds.length
      ? await supabase.from("children").select("id, first_name, last_name, age_group").in("id", childIds).eq("age_group", quiz.age_band).eq("status", "active").order("first_name")
      : { data: [] as Array<{ id: string; first_name: string; last_name: string; age_group: string }> };

    const { data: results } = (children ?? []).length
      ? await supabase.from("quiz_results").select("child_id, score, total, answers_json, marked_at").eq("quiz_id", quizId).in("child_id", (children ?? []).map((c) => c.id))
      : { data: [] as Array<{ child_id: string; score: number; total: number; answers_json: unknown; marked_at: string }> };
    const byChild = new Map((results ?? []).map((r) => [r.child_id, r]));

    return {
      data: {
        quiz: { id: quiz.id, program_id: quiz.program_id, subject: quiz.subject, focus: quiz.focus, age_band: quiz.age_band, title: quiz.title, questions },
        rows: (children ?? []).map((c) => {
          const r = byChild.get(c.id);
          const cls = classOfChild.get(c.id);
          return {
            child: { id: c.id, first_name: c.first_name, last_name: c.last_name, class_name: cls ? classById.get(cls) ?? null : null },
            marks: (r?.answers_json as QuizMarks) ?? {},
            score: r?.score ?? null,
            total: questions.length,
            marked_at: r?.marked_at ?? null,
          };
        }),
      },
      error: null,
    };
  } catch (err) {
    console.error("getQuizMarkingSheet error:", err);
    return { data: null, error: "Failed to load the quiz." };
  }
}

export async function saveQuizResult(
  centreId: string,
  quizId: string,
  childId: string,
  marks: QuizMarks
): Promise<{ data: { score: number; total: number } | null; error: string | null }> {
  try {
    const cu = await requirePortalUser(centreId);
    if (!cu) return { data: null, error: "Not authorised." };
    const supabase = await createSupabaseServerClient();
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, questions_json")
      .eq("id", quizId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!quiz) return { data: null, error: "Quiz not found." };
    const questions = normaliseQuestions(quiz.questions_json, 10);

    // The student must be at this school (and in the teacher's classes).
    const { data: enrolment } = await supabase
      .from("centre_children")
      .select("child_id")
      .eq("centre_id", centreId)
      .eq("child_id", childId)
      .maybeSingle();
    if (!enrolment) return { data: null, error: "Student not found." };
    if (isClassScoped(cu.class_ids)) {
      const { data: membership } = await supabase.from("school_class_children").select("class_id").eq("child_id", childId).is("ended_at", null);
      if (!(membership ?? []).some((m) => cu.class_ids.includes(m.class_id))) {
        return { data: null, error: "This student is not in one of your classes." };
      }
    }

    const clean: QuizMarks = {};
    for (const q of questions) if (typeof marks[q.id] === "boolean") clean[q.id] = marks[q.id];
    const { score, total } = scoreQuiz(questions, clean);
    const { data: term } = await supabase.from("terms").select("id").eq("status", "active").limit(1).maybeSingle();

    const admin = createSupabaseAdmin();
    const { error } = await admin.from("quiz_results").upsert(
      {
        quiz_id: quizId,
        child_id: childId,
        term_id: term?.id ?? null,
        score,
        total,
        answers_json: clean,
        marked_by_client_user_id: cu.id,
        marked_at: new Date().toISOString(),
      },
      { onConflict: "quiz_id,child_id" }
    );
    if (error) throw error;
    return { data: { score, total }, error: null };
  } catch (err) {
    console.error("saveQuizResult error:", err);
    return { data: null, error: "Failed to save the marks." };
  }
}
