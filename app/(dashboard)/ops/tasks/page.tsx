import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTaskColumns, getTasks, getTeamMembers } from "@/lib/tasks/actions";
import { getTasksStatusPulse } from "@/lib/tasks/status-pulse-actions";
import { TasksStatusPulseStrip } from "@/components/tasks/tasks-status-pulse";
import { OpsTasksClient } from "./client";
import { LoadError } from "@/components/ui/load-error";

export default async function OpsTasksPage() {
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

  if (!profile || (profile.role !== "ops" && profile.role !== "admin")) {
    redirect("/");
  }

  // Pulse fan-out mirrors /admin/tasks — Abdul gets the same overdue /
  // due-today / mine / unassigned glance, with jump-links that drop
  // into the existing filter URL shape.
  const [columnsResult, tasksResult, membersResult, pulse] = await Promise.all([
    getTaskColumns(),
    getTasks(),
    getTeamMembers(),
    getTasksStatusPulse(),
  ]);

  const firstError =
    columnsResult.error || tasksResult.error || membersResult.error;
  if (firstError) {
    return (
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <TasksStatusPulseStrip pulse={pulse} basePath="/ops/tasks" />
      <OpsTasksClient
        columns={columnsResult.data ?? []}
        initialTasks={tasksResult.data ?? []}
        teamMembers={(membersResult.data ?? []).map((m) => ({
          id: m.id,
          name: m.name,
        }))}
        userRole={profile.role}
        currentUserId={user.id}
      />
    </div>
  );
}
