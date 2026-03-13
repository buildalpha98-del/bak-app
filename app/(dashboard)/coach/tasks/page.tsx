import { createSupabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTasks, getTaskColumns } from "@/lib/tasks/actions";
import { CoachTasksClient } from "./client";

export default async function CoachTasksPage() {
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

  if (!profile || profile.role !== "coach") {
    redirect("/");
  }

  const [columnsResult, tasksResult] = await Promise.all([
    getTaskColumns(),
    getTasks({ myTasksOnly: true }),
  ]);

  const firstError = columnsResult.error || tasksResult.error;
  if (firstError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load page data. Please try refreshing.
      </div>
    );
  }

  return (
    <CoachTasksClient
      columns={columnsResult.data ?? []}
      tasks={tasksResult.data ?? []}
      currentUserId={user.id}
    />
  );
}
