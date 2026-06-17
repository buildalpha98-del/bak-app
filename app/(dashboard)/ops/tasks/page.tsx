import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTaskColumns, getTasks, getTeamMembers } from "@/lib/tasks/actions";
import { getTasksStatusPulse } from "@/lib/tasks/status-pulse-actions";
import { TasksStatusPulseStrip } from "@/components/tasks/tasks-status-pulse";
import { OpsTasksClient } from "./client";

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
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
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
