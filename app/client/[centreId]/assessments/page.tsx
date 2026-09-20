import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getClientAssessmentTasks } from "@/lib/client/assessment-actions";
import { isClassScoped } from "@/lib/client/assessment-scope";
import { ClientAssessmentsView } from "@/components/client/client-assessments-view";
import { getReportCardRelease } from "@/lib/client/report-card-actions";
import { ReportCardReleaseCard } from "@/components/client/report-card-release-card";
import { getSchoolQuizzes } from "@/lib/client/quiz-actions";
import { SchoolQuizzes } from "@/components/client/school-quizzes";

// Teachers (and the school's contacts) complete the term's skill
// assessments here — the same flow the coaches use, same table, so the
// report cards and term report need no second source (migration 088).

export default async function ClientAssessmentsPage({
  params,
}: {
  params: Promise<{ centreId: string }>;
}) {
  const { centreId } = await params;

  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false)
    redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}`);

  const [{ data: tasks, error }, { data: release }, { data: quizzes }] = await Promise.all([
    getClientAssessmentTasks(centreId),
    getReportCardRelease(centreId),
    getSchoolQuizzes(centreId),
  ]);
  const scoped = isClassScoped(clientUser.class_ids);
  // Distinct students with any rating this term, across every task.
  const students = new Map<string, boolean>();
  for (const t of tasks) for (const c of t.children) students.set(c.id, (students.get(c.id) ?? false) || c.already_rated);
  const assessed = [...students.values()].filter(Boolean).length;

  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Assessments</h1>
        <p className="text-muted-foreground mt-1">
          {scoped
            ? "Rate each student in your classes on this term's skills. Marks go straight onto their report cards."
            : "Rate students on this term's skills, class by class. Marks go straight onto their report cards and the term report."}
        </p>
      </div>

      <div className="rounded-xl border border-portal-200 bg-portal-50 p-4 flex items-start gap-3">
        <ClipboardCheck className="h-5 w-5 text-portal-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-portal-800">
          Each skill is rated 1 to 5 against the descriptor shown. A student your coach has
          already assessed this term shows as done — you can still add to the picture through
          the Feedback and Messages pages.
        </p>
      </div>

      {release && (
        <ReportCardReleaseCard
          centreId={centreId}
          release={release}
          isPrimary={clientUser.is_primary}
          assessed={assessed}
          total={students.size}
        />
      )}

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <ClientAssessmentsView centreId={centreId} tasks={tasks} scopedToClasses={scoped} />
      )}

      <SchoolQuizzes centreId={centreId} quizzes={quizzes} />
    </div>
  );
}
