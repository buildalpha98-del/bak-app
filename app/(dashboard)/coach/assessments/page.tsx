import { getCoachAssessmentTasks } from "@/lib/assessments/actions";
import CoachAssessmentView from "@/components/assessments/coach-assessment-view";

export default async function CoachAssessmentsPage() {
  const { data } = await getCoachAssessmentTasks();
  return <CoachAssessmentView tasks={data} />;
}
