import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCoachAvailableTemplates,
  getCoachSubmissions,
} from "@/lib/forms/actions";
import { getCoachFormsPulse } from "@/lib/coach/page-pulses";
import { CoachFormsView } from "@/components/forms/coach-forms-view";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";

export default async function CoachFormsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get coach display name
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const coachName = profile?.name ?? user.email ?? "Coach";

  const [templatesResult, submissionsResult, pulse] = await Promise.all([
    getCoachAvailableTemplates(),
    getCoachSubmissions(),
    getCoachFormsPulse(user.id),
  ]);

  const firstError = templatesResult.error || submissionsResult.error;
  if (firstError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 animate-fade-up">
      <CoachPulseStrip
        items={[
          {
            icon: "alert-triangle",
            count: pulse.overdueCount,
            label: "overdue",
            accent: true,
          },
          {
            icon: "clock",
            count: pulse.dueTodayCount,
            label: "due today",
            accent: pulse.dueTodayCount > 0,
          },
          {
            icon: "check-circle",
            count: pulse.completedThisWeekCount,
            label: "completed this week",
          },
        ]}
      />
      <CoachFormsView
        templates={templatesResult.data ?? []}
        submissions={submissionsResult.data ?? []}
        coachName={coachName}
      />
    </div>
  );
}
