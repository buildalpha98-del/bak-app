"use server";

// The school dashboard (September 2026): what a principal or class
// teacher needs on landing — where this term's plans, assessments and
// report cards stand, and what is happening this week. Composes the
// existing portal actions (each already RLS-scoped and class-scoped for
// teachers) plus two small week queries.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentClientUser, getPortalSchoolClasses } from "@/lib/client/actions";
import { scopeClasses, isClassScoped } from "@/lib/client/assessment-scope";
import { getClientAssessmentTasks } from "@/lib/client/assessment-actions";
import { getReportCardRelease, type ReportCardRelease } from "@/lib/client/report-card-actions";
import { getTermPlans, getPlanningTerm, type SchoolTermPlan } from "@/lib/client/term-plan-actions";
import { getSchoolQuizzes } from "@/lib/client/quiz-actions";
import { SUBJECT_KEYS, type SubjectKey } from "@/lib/curriculum/subjects";
import { frameworkOf, type FrameworkKey } from "@/lib/curriculum/frameworks";
import { weekNumberFor } from "@/lib/schools/term-weeks";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { yearGroupSortKey } from "@/lib/schools/year-groups";

export interface SchoolDashboardData {
  schoolName: string;
  frameworkKey: FrameworkKey;
  isTeacher: boolean;
  term: { id: string; name: string; weekCount: number; currentWeek: number | null; weekStart: string | null } | null;
  /** Class × subject: the plan's status, or null when none exists. */
  planMatrix: Array<{
    class_id: string;
    class_name: string;
    year_group: string;
    subjects: Record<SubjectKey, { id: string; status: "draft" | "approved"; units: number } | null>;
  }>;
  planCounts: { approved: number; draft: number; missing: number };
  assessments: {
    done: number;
    total: number;
    bySubject: Array<{ subject: SubjectKey; label: string; done: number; total: number }>;
    /** Class × template rows still incomplete, most behind first. */
    behind: Array<{ class_name: string | null; subject: SubjectKey; sport: string; template_id: string; class_id: string | null; done: number; total: number }>;
  };
  release: ReportCardRelease | null;
  quizzes: { count: number; marked: number };
  thisWeek: {
    lessons: Array<{ id: string; subject: string; title: string; class_name: string | null; author_name: string | null }>;
    sessions: Array<{ id: string; date: string; time: string; sport: string; coach_name: string; class_names: string[] }>;
  };
  students: number;
}

export async function getSchoolDashboard(
  centreId: string
): Promise<{ data: SchoolDashboardData | null; error: string | null }> {
  try {
    const { data: clientUser, error: cuError } = await getCurrentClientUser(centreId);
    if (cuError || !clientUser || clientUser.is_authorised_for_current === false) {
      return { data: null, error: "Not authorised." };
    }
    if (clientUser.centre_type !== "school") return { data: null, error: "Not a school." };
    const isTeacher = isClassScoped(clientUser.class_ids);

    const [classesRes, term, plansRes, tasksRes, releaseRes, quizzesRes] = await Promise.all([
      getPortalSchoolClasses(centreId),
      getPlanningTerm(),
      getTermPlans(centreId),
      getClientAssessmentTasks(centreId),
      getReportCardRelease(centreId),
      getSchoolQuizzes(centreId),
    ]);
    const release = releaseRes.data;
    const classes = scopeClasses(classesRes.data, clientUser.class_ids);

    // Plans: class × subject
    const planByKey = new Map<string, SchoolTermPlan>();
    for (const p of plansRes.plans) planByKey.set(`${p.class_id}#${p.subject}`, p);
    const planMatrix = classes
      .sort((a, b) => yearGroupSortKey(a.year_group) - yearGroupSortKey(b.year_group) || a.name.localeCompare(b.name))
      .map((c) => ({
        class_id: c.id,
        class_name: c.name,
        year_group: c.year_group,
        subjects: Object.fromEntries(
          SUBJECT_KEYS.map((k) => {
            const p = planByKey.get(`${c.id}#${k}`);
            return [k, p ? { id: p.id, status: p.status, units: p.plan.units.length } : null];
          })
        ) as SchoolDashboardData["planMatrix"][number]["subjects"],
      }));
    const planCounts = { approved: 0, draft: 0, missing: 0 };
    for (const row of planMatrix) {
      for (const k of SUBJECT_KEYS) {
        const p = row.subjects[k];
        if (!p) planCounts.missing += 1;
        else if (p.status === "approved") planCounts.approved += 1;
        else planCounts.draft += 1;
      }
    }

    // Assessments
    const tasks = tasksRes.data;
    const bySubjectMap = new Map<SubjectKey, { done: number; total: number }>();
    let done = 0;
    let total = 0;
    const behind: SchoolDashboardData["assessments"]["behind"] = [];
    for (const t of tasks) {
      const key = (SUBJECT_KEYS as readonly string[]).includes(t.subject) ? (t.subject as SubjectKey) : "pdhpe";
      const d = t.children.filter((c) => c.already_rated).length;
      const n = t.children.length;
      done += d;
      total += n;
      const e = bySubjectMap.get(key) ?? { done: 0, total: 0 };
      e.done += d;
      e.total += n;
      bySubjectMap.set(key, e);
      if (d < n) behind.push({ class_name: t.class_name, subject: key, sport: t.sport, template_id: t.template_id, class_id: t.class_id, done: d, total: n });
    }
    behind.sort((a, b) => a.done / a.total - b.done / b.total);
    const bySubject = SUBJECT_KEYS.filter((k) => bySubjectMap.has(k)).map((k) => ({
      subject: k,
      label: k === "pdhpe" ? "PDHPE" : k === "english" ? "English" : "Mathematics",
      ...bySubjectMap.get(k)!,
    }));

    // This week
    const today = sydneyTodayIso();
    let currentWeek: number | null = null;
    let weekStart: string | null = null;
    if (term) {
      currentWeek = weekNumberFor(term.start_date, term.end_date, today);
      weekStart = currentWeek ? term.weekStarts[currentWeek - 1] ?? null : null;
    }
    const supabase = await createSupabaseServerClient();
    const lessons: SchoolDashboardData["thisWeek"]["lessons"] = [];
    const sessions: SchoolDashboardData["thisWeek"]["sessions"] = [];
    const classById = new Map(classesRes.data.map((c) => [c.id, c.name]));
    if (weekStart) {
      const weekEnd = new Date(`${weekStart}T12:00:00Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      const weekEndIso = weekEnd.toISOString().slice(0, 10);
      const [{ data: lessonRows }, { data: sessionRows }] = await Promise.all([
        supabase
          .from("programs")
          .select("id, subject, content_json, school_class_id, created_by_client_user_id")
          .eq("centre_id", centreId)
          .eq("planned_for", weekStart),
        supabase
          .from("sessions")
          .select("id, date, time, sport, school_class_ids, profiles!sessions_coach_id_fkey(name)")
          .eq("centre_id", centreId)
          .gte("date", weekStart)
          .lte("date", weekEndIso)
          .neq("status", "cancelled")
          .neq("status", "draft")
          .order("date")
          .order("time"),
      ]);
      const authorIds = Array.from(new Set((lessonRows ?? []).map((l) => l.created_by_client_user_id).filter(Boolean))) as string[];
      const authorName = new Map<string, string>();
      if (authorIds.length) {
        const { data: authors } = await supabase.from("client_users").select("id, name").in("id", authorIds);
        for (const a of authors ?? []) authorName.set(a.id, a.name);
      }
      for (const l of lessonRows ?? []) {
        if (isTeacher && l.school_class_id && !clientUser.class_ids.includes(l.school_class_id)) continue;
        lessons.push({
          id: l.id,
          subject: l.subject ?? "pdhpe",
          title: ((l.content_json as Record<string, unknown> | null)?.title as string) ?? "Lesson",
          class_name: l.school_class_id ? classById.get(l.school_class_id) ?? null : null,
          author_name: l.created_by_client_user_id ? authorName.get(l.created_by_client_user_id) ?? null : null,
        });
      }
      for (const s of sessionRows ?? []) {
        const ids = (s.school_class_ids as string[] | null) ?? [];
        if (isTeacher && ids.length > 0 && !ids.some((id) => clientUser.class_ids.includes(id))) continue;
        sessions.push({
          id: s.id,
          date: s.date,
          time: s.time,
          sport: s.sport,
          coach_name: ((s.profiles as unknown as { name?: string } | null)?.name) ?? "TBC",
          class_names: ids.map((id) => classById.get(id)).filter((n): n is string => !!n),
        });
      }
    }

    const { count: students } = await supabase
      .from("centre_children")
      .select("child_id", { count: "exact", head: true })
      .eq("centre_id", centreId)
      .eq("status", "active");

    return {
      data: {
        schoolName: clientUser.centre_name,
        frameworkKey: frameworkOf(clientUser.centre_framework).key,
        isTeacher,
        term: term
          ? { id: term.id, name: term.name, weekCount: term.weekCount, currentWeek, weekStart }
          : null,
        planMatrix,
        planCounts,
        assessments: { done, total, bySubject, behind: behind.slice(0, 6) },
        release,
        quizzes: { count: quizzesRes.data.length, marked: quizzesRes.data.reduce((n, q) => n + q.marked_count, 0) },
        thisWeek: { lessons, sessions },
        students: students ?? 0,
      },
      error: null,
    };
  } catch (err) {
    console.error("getSchoolDashboard error:", err);
    return { data: null, error: "Failed to load the dashboard." };
  }
}
