import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAllHealthScores } from "@/lib/utils/healthScore";
import { triggerNotification } from "@/lib/notifications/send";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { HealthStatus } from "@/lib/types/enums";

// Vercel cron: daily at 6am AEST (8pm UTC previous day)
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret or authenticated admin/ops user
    const cronSecret = request.headers.get("authorization");
    const isCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || !["admin", "ops"].includes(profile.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { results, error } = await calculateAllHealthScores();

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    // Handle status changes — send notifications
    const admin = createSupabaseAdmin();

    // Get ops/admin users for notifications
    const { data: staffUsers } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .in("role", ["admin", "ops"])
      .eq("status", "active");

    const opsUsers = (staffUsers ?? []).filter((u) => u.role === "ops");
    const adminUsers = (staffUsers ?? []).filter((u) => u.role === "admin");
    const opsIds = opsUsers.map((u) => u.id);
    const adminIds = adminUsers.map((u) => u.id);

    for (const result of results) {
      if (!result.previousStatus || result.previousStatus === result.status) continue;

      const statusChanged = result.previousStatus !== result.status;
      if (!statusChanged) continue;

      const isDecline =
        (result.previousStatus === "green" && result.status === "amber") ||
        (result.previousStatus === "amber" && result.status === "red") ||
        (result.previousStatus === "green" && result.status === "red");

      const isImprove =
        (result.previousStatus === "red" && result.status === "amber") ||
        (result.previousStatus === "amber" && result.status === "green") ||
        (result.previousStatus === "red" && result.status === "green");

      if (isDecline) {
        const isRed = result.status === "red";
        const recipientUsers = isRed ? [...opsUsers, ...adminUsers] : opsUsers;

        await triggerNotification(
          {
            type: isRed ? "task_assigned" : "feedback_received",
            title: `Health Alert: ${result.centreName}`,
            body: `${result.centreName} dropped from ${formatStatus(result.previousStatus)} to ${formatStatus(result.status)} (${result.score}/100)`,
            entityType: "centre",
            entityId: result.centreId,
          },
          recipientUsers.map((u) => ({
            userId: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
          }))
        );

        // Auto-create task for red status
        if (isRed) {
          const { data: todoColumn } = await admin
            .from("task_columns")
            .select("id")
            .eq("name", "To Do")
            .single();

          if (todoColumn) {
            await admin.from("tasks").insert({
              title: `Attention needed: ${result.centreName} health score dropped to red (${result.score}/100)`,
              description: `Centre health score declined from ${formatStatus(result.previousStatus)} to red. Review the health breakdown and take action.`,
              assignee_id: opsIds[0] ?? adminIds[0] ?? null,
              column_id: todoColumn.id,
              priority: "high",
              source: "health_score",
              linked_entity_type: "centre",
              linked_entity_id: result.centreId,
            });
          }
        }
      } else if (isImprove) {
        await triggerNotification(
          {
            type: "feedback_received",
            title: `Health Improving: ${result.centreName}`,
            body: `${result.centreName} improved from ${formatStatus(result.previousStatus)} to ${formatStatus(result.status)} (${result.score}/100)`,
            entityType: "centre",
            entityId: result.centreId,
          },
          opsUsers.map((u) => ({
            userId: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
          }))
        );
      }
    }

    const summary = {
      green: results.filter((r) => r.status === "green").length,
      amber: results.filter((r) => r.status === "amber").length,
      red: results.filter((r) => r.status === "red").length,
      total: results.length,
      statusChanges: results.filter((r) => r.previousStatus && r.previousStatus !== r.status).length,
    };

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    console.error("Health score calculation error:", err);
    return NextResponse.json({ error: "Calculation failed" }, { status: 500 });
  }
}

function formatStatus(status: HealthStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
