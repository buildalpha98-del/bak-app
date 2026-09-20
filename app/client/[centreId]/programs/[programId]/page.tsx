import { redirect } from "next/navigation";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientProgramDetail } from "@/lib/client/portal-actions";
import { ProgramView } from "@/components/programs/program-view";
import Link from "@/components/ui/app-link";
import { ArrowLeft, Download } from "lucide-react";
import { getSchoolLesson } from "@/lib/client/lesson-actions";
import { getSchoolQuizzes } from "@/lib/client/quiz-actions";
import { QuizBuilder } from "@/components/client/quiz-builder";
import { SchoolQuizzes } from "@/components/client/school-quizzes";
import { LessonWeekPicker } from "@/components/client/lesson-week-picker";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { termWeeks } from "@/lib/schools/term-weeks";
import { subjectOf } from "@/lib/curriculum/subjects";

export default async function ClientProgramDetailPage({
  params,
}: {
  params: Promise<{ centreId: string; programId: string }>;
}) {
  const { centreId, programId } = await params;
  const { data: clientUser } = await getCurrentClientUser(centreId);

  if (!clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);

  const { data: program, error } = await getClientProgramDetail(programId, centreId);

  if (error || !program) {
    // Not a delivered programme — perhaps one of the school's own
    // lessons (migration 091).
    const { data: lesson } = await getSchoolLesson(centreId, programId);
    if (!lesson) redirect(`/client/${centreId}/programs`);
    const supabase = await createSupabaseServerClient();
    const [{ data: quizzes }, { data: term }] = await Promise.all([
      getSchoolQuizzes(centreId, lesson.id),
      supabase.from("terms").select("name, start_date, end_date").eq("status", "active").limit(1).maybeSingle(),
    ]);
    return (
      <div className="animate-fade-up space-y-4">
        <Link
          href={`/client/${centreId}/programs`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Programs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{lesson.title}</h1>
            <p className="text-sm text-gray-500">
              {subjectOf(lesson.subject).label} · {lesson.focus} · {lesson.duration_minutes} min
              {lesson.class_name ? ` · ${lesson.class_name}` : ""}
              {lesson.author_name ? ` · written by ${lesson.author_name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {term && (
              <LessonWeekPicker
                centreId={centreId}
                programId={lesson.id}
                termName={term.name}
                weeks={termWeeks(term.start_date, term.end_date)}
                plannedFor={lesson.planned_for}
              />
            )}
            <a
              href={`/api/client/${centreId}/lesson-pdf?programId=${lesson.id}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border border-portal-600/30 bg-portal-600/5 px-3 py-2 text-sm font-medium text-portal-600 hover:bg-portal-600/10"
            >
              <Download className="h-4 w-4" /> Lesson plan PDF
            </a>
          </div>
        </div>
        <ProgramView content={lesson.content_json} />
        <QuizBuilder centreId={centreId} programId={lesson.id} lessonTitle={lesson.title} />
        {quizzes.length > 0 && <SchoolQuizzes centreId={centreId} quizzes={quizzes} />}
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Link
        href={`/client/${centreId}/programs`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Programs
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {program.skill_focus ?? program.sport}
        </h1>
        <p className="text-sm text-gray-500">
          {program.sport} • Ages {program.age_group ?? "All"} •
          Delivered {program.times_used} time{program.times_used !== 1 ? "s" : ""}
        </p>
      </div>

      <ProgramView content={program.content_json} />
    </div>
  );
}
