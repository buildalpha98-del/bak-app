import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { dailyDigestEmail } from "@/lib/email/templates";

/**
 * Daily digest cron — runs at 20:00 UTC (07:00 AEST).
 * Compiles unread important/informational notifications from the last 24h
 * into a single email per user.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdmin();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch unread notifications from last 24h (important + informational only)
    const { data: notifications, error } = await admin
      .from("notifications")
      .select("user_id, title, body, created_at")
      .eq("read", false)
      .in("tier", ["important", "informational"])
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    // Group by user_id
    const byUser = new Map<
      string,
      { title: string; body: string; created_at: string }[]
    >();
    for (const n of notifications) {
      const existing = byUser.get(n.user_id) ?? [];
      existing.push({ title: n.title, body: n.body, created_at: n.created_at });
      byUser.set(n.user_id, existing);
    }

    // Fetch user emails + names
    const userIds = Array.from(byUser.keys());
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds);

    if (!profiles) {
      return NextResponse.json({ sent: 0 });
    }

    // Send digest email to each user
    let sent = 0;
    for (const profile of profiles) {
      const userNotifications = byUser.get(profile.id);
      if (!userNotifications || userNotifications.length === 0) continue;

      const { subject, html } = dailyDigestEmail(
        profile.name ?? "there",
        userNotifications
      );

      const result = await sendEmail(profile.email, subject, html);
      if (result.success) sent++;
    }

    return NextResponse.json({ sent, total_users: byUser.size });
  } catch (err) {
    console.error("Daily digest cron error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
