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

  // 1. Find leads with follow-up due today
  const { data: dueLeads, error: leadsError } = await admin
    .from("leads")
    .select("id, centre_name, owner_id, next_follow_up_date")
    .eq("next_follow_up_date", today)
    .not("owner_id", "is", null)
    .not("stage", "in", "(won,lost,churned)");

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  let followUpNotified = 0;
  let followUpFailed = 0;

  if (dueLeads && dueLeads.length > 0) {
    // Group by owner to batch notifications
    const byOwner: Record<string, typeof dueLeads> = {};
    for (const lead of dueLeads) {
      if (!lead.owner_id) continue;
      if (!byOwner[lead.owner_id]) byOwner[lead.owner_id] = [];
      byOwner[lead.owner_id].push(lead);
    }

    for (const [ownerId, leads] of Object.entries(byOwner)) {
      try {
        const { data: owner } = await admin
          .from("profiles")
          .select("id, email, name, role")
          .eq("id", ownerId)
          .single();

        if (!owner) {
          followUpFailed++;
          continue;
        }

        const body =
          leads.length === 1
            ? `${leads[0].centre_name} is due for follow-up today`
            : `You have ${leads.length} leads due for follow-up today: ${leads.map((l) => l.centre_name).join(", ")}`;

        await triggerNotification(
          {
            type: "task_overdue_reminder", // reuse existing type
            title: `${leads.length} follow-up${leads.length > 1 ? "s" : ""} due today`,
            body,
            entityType: "lead",
            entityId: leads[0].id,
            data: { leadIds: leads.map((l) => l.id), count: leads.length },
          },
          [
            {
              userId: owner.id,
              email: owner.email,
              name: owner.name,
              role: owner.role,
            },
          ]
        );

        followUpNotified++;
      } catch (err) {
        followUpFailed++;
        console.error(
          `lead-followups: notification failed for owner ${ownerId}:`,
          err
        );
      }
    }
  }

  // 2. Find overdue follow-ups (past due, still active)
  const { data: overdueLeads } = await admin
    .from("leads")
    .select("id, centre_name, owner_id")
    .lt("next_follow_up_date", today)
    .not("owner_id", "is", null)
    .not("stage", "in", "(won,lost,churned)");

  let overdueCount = overdueLeads?.length ?? 0;

  return NextResponse.json({
    message: "Lead follow-up reminders sent",
    followUpsDueToday: dueLeads?.length ?? 0,
    ownersNotified: followUpNotified,
    failed: followUpFailed,
    overdueLeads: overdueCount,
  });
}
