import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoachAssessmentTasks } from "@/lib/assessments/actions";
import { getCoachAssessmentsPulse } from "@/lib/coach/page-pulses";
import CoachAssessmentView from "@/components/assessments/coach-assessment-view";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";
import { ClipboardList, CheckCircle2 } from "lucide-react";

export default async function CoachAssessmentsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data }, pulse] = await Promise.all([
    getCoachAssessmentTasks(),
    getCoachAssessmentsPulse(user.id),
  ]);

  return (
    <div className="space-y-4 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: ClipboardList,
            count: pulse.childrenPendingCount,
            label:
              pulse.childrenPendingCount === 1
                ? "child pending"
                : "children pending",
            accent: true,
          },
          {
            icon: CheckCircle2,
            count: pulse.submittedThisTermCount,
            label: "submitted this term",
          },
        ]}
      />
      <CoachAssessmentView tasks={data} />
    </div>
  );
}
