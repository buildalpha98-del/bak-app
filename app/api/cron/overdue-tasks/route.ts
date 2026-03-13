import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerNotification } from "@/lib/notifications/send";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const today = new Date().toISOString().split("T")[0];

  // Find overdue tasks (past due date, not in a final column)
  const { data: finalCols } = await admin
    .from("task_columns")
    .select("id")
    .eq("is_final", true);

  const finalColIds = finalCols?.map((c) => c.id) ?? [];

  let query = admin
    .from("tasks")
    .select("id, title, assignee_id, due_date, column_id")
    .lt("due_date", today)
    .not("assignee_id", "is", null);

  // Exclude tasks in final columns
  if (finalColIds.length > 0) {
    for (const id of finalColIds) {
      query = query.neq("column_id", id);
    }
  }

  const { data: overdueTasks, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!overdueTasks || overdueTasks.length === 0) {
    return NextResponse.json({ message: "No overdue tasks", count: 0 });
  }

  // Group by assignee
  const byAssignee: Record<string, typeof overdueTasks> = {};
  for (const task of overdueTasks) {
    if (!task.assignee_id) continue;
    if (!byAssignee[task.assignee_id]) byAssignee[task.assignee_id] = [];
    byAssignee[task.assignee_id].push(task);
  }

  // Send one notification per assignee
  let notified = 0;
  for (const [assigneeId, tasks] of Object.entries(byAssignee)) {
    const { data: assignee } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", assigneeId)
      .single();

    if (!assignee) continue;

    await triggerNotification(
      {
        type: "task_overdue_reminder",
        title: `${tasks.length} overdue task${tasks.length > 1 ? "s" : ""}`,
        body: tasks.length === 1
          ? tasks[0].title
          : `You have ${tasks.length} tasks past their due date`,
        entityType: "task",
        entityId: tasks[0].id,
        data: { count: tasks.length, taskIds: tasks.map((t) => t.id) },
      },
      [
        {
          userId: assignee.id,
          email: assignee.email,
          name: assignee.name,
          role: assignee.role,
        },
      ]
    );
    notified++;
  }

  return NextResponse.json({
    message: "Overdue reminders sent",
    overdueTasks: overdueTasks.length,
    usersNotified: notified,
  });
}
