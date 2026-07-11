import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTaskColumns, getTasks, getTeamMembers } from "@/lib/tasks/actions";
import { getTasksStatusPulse } from "@/lib/tasks/status-pulse-actions";
import { AdminTasksClient } from "./client";
import { LoadError } from "@/components/ui/load-error";

export default async function AdminTasksPage() {
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

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const [columnsResult, tasksResult, membersResult, pulse] = await Promise.all([
    getTaskColumns(),
    getTasks(),
    getTeamMembers(),
    getTasksStatusPulse(),
  ]);

  const firstError = columnsResult.error || tasksResult.error || membersResult.error;
  if (firstError) {
    return (
      <LoadError message="Failed to load page data. Please try refreshing." />
    );
  }

  return (
    <AdminTasksClient
      columns={columnsResult.data ?? []}
      initialTasks={tasksResult.data ?? []}
      teamMembers={(membersResult.data ?? []).map((m) => ({ id: m.id, name: m.name }))}
      currentUserId={user.id}
      pulse={pulse}
      basePath="/admin/tasks"
    />
  );
}
