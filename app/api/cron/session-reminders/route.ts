import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { createNotification } from "@/lib/launch/notifications";
import {
  sessionReminderParent,
  sessionReminderCoach,
} from "@/lib/launch/email-templates";

// ============================================================
// GET /api/cron/session-reminders
// Runs daily at 5 PM AEST (7 AM UTC) — sends 24-hour reminders
// for tomorrow's confirmed sessions.
// ============================================================

export async function GET(request: Request) {
  // 1. Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  // Check if reminders are enabled
  const { data: setting } = await supabase
    .from("business_settings")
    .select("value")
    .eq("key", "session_reminders_enabled")
    .maybeSingle();

  // Default to enabled if setting doesn't exist
  const isEnabled = setting ? setting.value === true || setting.value === "true" : true;

  if (!isEnabled) {
    return NextResponse.json({ message: "Reminders disabled", parentReminders: 0, coachReminders: 0, skipped: 0 });
  }

  // 2. Calculate tomorrow's date (AEST)
  const now = new Date();
  const aestOffset = 10 * 60; // AEST = UTC+10
  const aestNow = new Date(now.getTime() + aestOffset * 60 * 1000);
  const tomorrow = new Date(aestNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // 3. Get tomorrow's confirmed sessions with centre details + coach details
  const { data: sessions, error: sessErr } = await supabase
    .from("sessions")
    .select(
      `id, date, time, duration_minutes, sport, status, coach_id, centre_id,
       centres:centre_id(name, address, primary_contact_name, primary_contact_phone),
       coach:coach_id(id, name, email)`
    )
    .eq("date", tomorrowStr)
    .in("status", ["confirmed", "published"])
    .order("time");

  if (sessErr || !sessions || sessions.length === 0) {
    return NextResponse.json({
      message: sessions?.length === 0 ? "No sessions tomorrow" : "Query error",
      parentReminders: 0,
      coachReminders: 0,
      skipped: 0,
      error: sessErr?.message,
    });
  }

  let parentReminders = 0;
  let coachReminders = 0;
  let skipped = 0;

  // 4. Send PARENT reminders
  for (const session of sessions) {
    if (!session.centre_id) continue;

    const centre = (session as Record<string, unknown>).centres as {
      name: string;
      address: string | null;
      primary_contact_name: string | null;
      primary_contact_phone: string | null;
    } | null;

    // Get children enrolled at this centre
    const { data: childLinks } = await supabase
      .from("centre_children")
      .select("child_id")
      .eq("centre_id", session.centre_id)
      .eq("status", "active");

    if (!childLinks || childLinks.length === 0) continue;

    const childIds = childLinks.map((c: { child_id: string }) => c.child_id);

    // Get children with their parent links
    const { data: children } = await supabase
      .from("children")
      .select("id, first_name, last_name")
      .in("id", childIds)
      .eq("status", "active");

    if (!children || children.length === 0) continue;

    // Get parent links for these children
    const { data: parentLinks } = await supabase
      .from("parent_children")
      .select("child_id, parent_id")
      .in("child_id", childIds);

    if (!parentLinks || parentLinks.length === 0) continue;

    // Get parent profiles with user_ids and emails
    const parentIds = [...new Set(parentLinks.map((pl: { parent_id: string }) => pl.parent_id))];
    const { data: parents } = await supabase
      .from("parent_profiles")
      .select("id, user_id, first_name, email")
      .in("id", parentIds);

    if (!parents) continue;

    type ChildRow = { id: string; first_name: string; last_name: string };
    type ParentRow = { id: string; user_id: string; first_name: string; email: string };

    const childMap = new Map<string, ChildRow>(
      children.map((c: ChildRow) => [c.id, c])
    );
    const parentMap = new Map<string, ParentRow>(
      parents.map((p: ParentRow) => [p.id, p])
    );

    // Calculate end time
    const [h, m] = session.time.split(":").map(Number);
    const totalMin = h * 60 + m + session.duration_minutes;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

    // Send reminder per parent-child pair
    for (const link of parentLinks as Array<{ child_id: string; parent_id: string }>) {
      const parent = parentMap.get(link.parent_id);
      const child = childMap.get(link.child_id);
      if (!parent || !child || !parent.email) continue;

      // Check dedup: has this reminder already been sent?
      const { data: existing } = await supabase
        .from("reminder_log")
        .select("id")
        .eq("session_id", session.id)
        .eq("reminder_type", "parent_24hr")
        .eq("recipient_id", parent.user_id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Send email
      const emailData = sessionReminderParent({
        parentName: parent.first_name,
        childName: `${child.first_name} ${child.last_name}`,
        sessionName: session.sport,
        date: session.date,
        time: `${session.time} – ${endTime}`,
        location: centre?.name || "TBC",
      });

      await sendEmail({
        to: parent.email,
        subject: emailData.subject,
        html: emailData.html,
        recipientId: parent.user_id,
        emailType: "session_reminder",
        metadata: { session_id: session.id, child_id: link.child_id },
      });

      // Create notification
      await createNotification({
        userId: parent.user_id,
        type: "session_reminder",
        title: "Session Tomorrow",
        message: `${child.first_name} has ${session.sport} tomorrow at ${session.time}`,
        actionUrl: "/parent/bookings",
        metadata: { session_id: session.id },
      });

      // Log to prevent double-sends
      await supabase.from("reminder_log").insert({
        session_id: session.id,
        reminder_type: "parent_24hr",
        recipient_id: parent.user_id,
      });

      parentReminders++;
    }
  }

  // 5. Send COACH reminders — group sessions by coach
  const coachSessionMap = new Map<string, typeof sessions>();

  for (const session of sessions) {
    if (!session.coach_id) continue;
    const existing = coachSessionMap.get(session.coach_id) || [];
    existing.push(session);
    coachSessionMap.set(session.coach_id, existing);
  }

  for (const [coachId, coachSessions] of coachSessionMap) {
    // Check dedup using the first session
    const { data: existing } = await supabase
      .from("reminder_log")
      .select("id")
      .eq("session_id", coachSessions[0].id)
      .eq("reminder_type", "coach_24hr")
      .eq("recipient_id", coachId)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Get coach profile
    const coach = (coachSessions[0] as Record<string, unknown>).coach as {
      id: string;
      name: string;
      email: string;
    } | null;

    if (!coach?.email) continue;

    // Build session details for the email
    const sessionDetails: Array<{
      time: string;
      centreName: string;
      address: string;
      childCount: number;
      programme: string;
      contactName: string;
      contactPhone: string;
    }> = [];

    for (const s of coachSessions) {
      const centre = (s as Record<string, unknown>).centres as {
        name: string;
        address: string | null;
        primary_contact_name: string | null;
        primary_contact_phone: string | null;
      } | null;

      // Get child count for the session's centre
      let childCount = 0;
      if (s.centre_id) {
        const { count } = await supabase
          .from("centre_children")
          .select("id", { count: "exact", head: true })
          .eq("centre_id", s.centre_id)
          .eq("status", "active");
        childCount = count ?? 0;
      }

      const [h2, m2] = s.time.split(":").map(Number);
      const total2 = h2 * 60 + m2 + s.duration_minutes;
      const eH = Math.floor(total2 / 60) % 24;
      const eM = total2 % 60;

      sessionDetails.push({
        time: `${s.time} – ${String(eH).padStart(2, "0")}:${String(eM).padStart(2, "0")}`,
        centreName: centre?.name || "TBC",
        address: centre?.address || "",
        childCount,
        programme: s.sport,
        contactName: centre?.primary_contact_name || "",
        contactPhone: centre?.primary_contact_phone || "",
      });
    }

    // Send email
    const emailData = sessionReminderCoach({
      coachName: coach.name || "Coach",
      sessions: sessionDetails,
    });

    await sendEmail({
      to: coach.email,
      subject: emailData.subject,
      html: emailData.html,
      recipientId: coachId,
      emailType: "session_reminder",
      metadata: { session_count: coachSessions.length },
    });

    // Create notification
    await createNotification({
      userId: coachId,
      type: "session_reminder",
      title: "Sessions Tomorrow",
      message: `You have ${coachSessions.length} session${coachSessions.length > 1 ? "s" : ""} tomorrow`,
      actionUrl: "/coach",
      metadata: { session_count: coachSessions.length },
    });

    // Log all sessions for dedup. Supabase returns errors in the response
    // object rather than throwing, so duplicate-key errors are silently
    // ignored here (which is the desired behaviour for re-runs of the cron).
    for (const s of coachSessions) {
      await supabase.from("reminder_log").insert({
        session_id: s.id,
        reminder_type: "coach_24hr",
        recipient_id: coachId,
      });
    }

    coachReminders++;
  }

  return NextResponse.json({
    message: "Reminders sent",
    parentReminders,
    coachReminders,
    skipped,
    date: tomorrowStr,
  });
}
