import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTaskColumns, getTasks, getTeamMembers } from "@/lib/tasks/actions";
import { AdminTasksClient } from "./client";

export default async function AdminTasksPage() {
  const supabase = await createSupabaseServer();
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

  const [columnsResult, tasksResult, membersResult] = await Promise.all([
    getTaskColumns(),
    getTasks(),
    getTeamMembers(),
  ]);

  return (
    <AdminTasksClient
      columns={columnsResult.data ?? []}
      initialTasks={tasksResult.data ?? []}
      teamMembers={(membersResult.data ?? []).map((m) => ({ id: m.id, name: m.name }))}
      currentUserId={user.id}
    />
  );
}
