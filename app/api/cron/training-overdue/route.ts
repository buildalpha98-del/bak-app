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
  const now = new Date().toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Find all assignments that are overdue: due_date < now AND status != 'completed'
  const { data: overdueAssignments, error } = await admin
    .from("training_assignments")
    .select(
      "id, coach_id, due_date, module:training_modules(title), pathway:training_pathways(title)"
    )
    .lt("due_date", now)
    .neq("status", "completed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!overdueAssignments || overdueAssignments.length === 0) {
    return NextResponse.json({
      message: "No overdue training assignments",
      count: 0,
    });
  }

  // Check which assignments already have a notification today to avoid duplicates
  const assignmentIds = overdueAssignments.map((a) => a.id);
  const { data: existingNotifications } = await admin
    .from("notifications")
    .select("entity_id")
    .eq("type", "training_overdue")
    .gte("created_at", todayStart.toISOString())
    .lte("created_at", todayEnd.toISOString())
    .in("entity_id", assignmentIds);

  const alreadyNotified = new Set(
    (existingNotifications ?? []).map((n) => n.entity_id)
  );

  // Filter to only assignments not yet notified today
  const toNotify = overdueAssignments.filter(
    (a) => !alreadyNotified.has(a.id)
  );

  if (toNotify.length === 0) {
    return NextResponse.json({
      message: "All overdue assignments already notified today",
      count: 0,
    });
  }

  // Group by coach for sending
  const byCoach: Record<
    string,
    Array<{ assignmentId: string; title: string }>
  > = {};

  for (const assignment of toNotify) {
    const coachId = assignment.coach_id;
    if (!byCoach[coachId]) byCoach[coachId] = [];

    const mod = assignment.module as unknown as { title: string } | null;
    const pw = assignment.pathway as unknown as { title: string } | null;
    const title = mod?.title ?? pw?.title ?? "Unknown";

    byCoach[coachId].push({ assignmentId: assignment.id, title });
  }

  let notificationsSent = 0;
  let failed = 0;

  for (const [coachId, items] of Object.entries(byCoach)) {
    try {
      const { data: coach } = await admin
        .from("profiles")
        .select("id, email, name, role")
        .eq("id", coachId)
        .single();

      if (!coach) {
        failed++;
        continue;
      }

      const moduleList = items.map((i) => i.title).join(", ");

      await triggerNotification(
        {
          type: "training_overdue",
          title: `${items.length} overdue training module${items.length > 1 ? "s" : ""}`,
          body:
            items.length === 1
              ? `"${items[0].title}" is past its due date`
              : `${items.length} modules overdue: ${moduleList}`,
          entityType: "training_assignment",
          entityId: items[0].assignmentId,
          data: {
            count: items.length,
            assignmentIds: items.map((i) => i.assignmentId),
          },
        },
        [
          {
            userId: coach.id,
            email: coach.email,
            name: coach.name,
            role: coach.role,
          },
        ]
      );

      notificationsSent++;
    } catch (err) {
      failed++;
      console.error(
        `training-overdue: notification failed for coach ${coachId}:`,
        err
      );
    }
  }

  return NextResponse.json({
    message: "Overdue training reminders sent",
    overdueAssignments: toNotify.length,
    coachesNotified: notificationsSent,
    failed,
  });
}
