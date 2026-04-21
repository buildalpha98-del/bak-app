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

  // Tomorrow's date (AEST — cron runs at 20:00 UTC = 06:00 AEST)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find scheduled demos for tomorrow
  const { data: demos, error } = await admin
    .from("demo_sessions")
    .select("id, lead_id, scheduled_time, coach_id, duration_minutes")
    .eq("scheduled_date", tomorrowStr)
    .eq("status", "scheduled");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!demos || demos.length === 0) {
    return NextResponse.json({ message: "No demos tomorrow", count: 0 });
  }

  let notified = 0;

  for (const demo of demos) {
    if (!demo.coach_id) continue;

    // Get coach profile
    const { data: coach } = await admin
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", demo.coach_id)
      .single();

    if (!coach) continue;

    // Get lead centre name
    const { data: lead } = await admin
      .from("leads")
      .select("centre_name")
      .eq("id", demo.lead_id)
      .single();

    const centreName = lead?.centre_name ?? "a centre";
    const timeStr = demo.scheduled_time?.slice(0, 5) ?? "TBC";

    await triggerNotification(
      {
        type: "demo_reminder",
        title: `Demo tomorrow at ${centreName}`,
        body: `You have a ${demo.duration_minutes}min demo at ${timeStr} tomorrow. Make sure you're prepared!`,
        entityType: "demo_session",
        entityId: demo.id,
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

    notified++;
  }

  return NextResponse.json({
    message: "Demo reminders sent",
    demosFound: demos.length,
    coachesNotified: notified,
  });
}
