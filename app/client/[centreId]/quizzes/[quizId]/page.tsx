import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "@/components/ui/app-link";
import { getCurrentClientUser } from "@/lib/client/actions";
import { getQuizMarkingSheet } from "@/lib/client/quiz-actions";
import { QuizMarking } from "@/components/client/quiz-marking";
import { subjectOf } from "@/lib/curriculum/subjects";

// One quiz's marking sheet (migration 092).

export default async function QuizPage({
  params,
}: {
  params: Promise<{ centreId: string; quizId: string }>;
}) {
  const { centreId, quizId } = await params;
  const { data: clientUser, error: authError } = await getCurrentClientUser(centreId);
  if (authError || !clientUser) redirect("/client-login");
  if (clientUser.is_authorised_for_current === false) redirect(`/client/${clientUser.centre_id}`);
  if (clientUser.centre_type !== "school") redirect(`/client/${centreId}`);

  const { data: sheet, error } = await getQuizMarkingSheet(centreId, quizId);
  if (error || !sheet) redirect(`/client/${centreId}/assessments`);

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <Link
          href={sheet.quiz.program_id ? `/client/${centreId}/programs/${sheet.quiz.program_id}` : `/client/${centreId}/assessments`}
          className="inline-flex items-center gap-1 text-sm text-portal-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {sheet.quiz.program_id ? "Back to the lesson" : "Back to Assessments"}
        </Link>
        <h1 className="mt-1 text-2xl font-bold font-heading text-foreground">{sheet.quiz.title}</h1>
        <p className="text-muted-foreground mt-1">
          {subjectOf(sheet.quiz.subject).label} · {sheet.quiz.focus} · ages {sheet.quiz.age_band}
        </p>
      </div>
      <QuizMarking centreId={centreId} sheet={sheet} />
    </div>
  );
}
