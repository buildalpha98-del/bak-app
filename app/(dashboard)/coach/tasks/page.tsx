import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTasks, getTaskColumns } from "@/lib/tasks/actions";
import { getCoachTasksPulse } from "@/lib/coach/page-pulses";
import { CoachTasksClient } from "./client";
import { CoachPulseStrip } from "@/components/coach/coach-pulse-strip";
import { LoadError } from "@/components/ui/load-error";

export default async function CoachTasksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "coach") {
    redirect("/");
  }

  const [columnsResult, tasksResult, pulse] = await Promise.all([
    getTaskColumns(),
    getTasks({ myTasksOnly: true }),
    getCoachTasksPulse(user.id),
  ]);

  const firstError = columnsResult.error || tasksResult.error;
  if (firstError) {
    return (
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
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
            label: "done this week",
          },
        ]}
      />
      <CoachTasksClient
        columns={columnsResult.data ?? []}
        tasks={tasksResult.data ?? []}
        currentUserId={user.id}
      />
    </div>
  );
}
