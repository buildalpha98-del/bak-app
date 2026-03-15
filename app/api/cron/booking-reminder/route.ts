import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { bookingReminderEmail } from "@/lib/bookings/booking-emails";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  // Calculate tomorrow's date in YYYY-MM-DD format (Australian Eastern Time)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // Find confirmed bookings for tomorrow's sessions
  const { data: bookings, error: bookingsError } = await admin
    .from("bookings")
    .select(
      "id, parent_id, children_json, bookable_sessions(id, title, date, start_time, end_time, location_name, location_address)"
    )
    .eq("status", "confirmed")
    .eq("bookable_sessions.date", tomorrowStr);

  if (bookingsError) {
    return NextResponse.json(
      { error: bookingsError.message },
      { status: 500 }
    );
  }

  // Filter out bookings where the session join returned null (date didn't match)
  const validBookings = (bookings ?? []).filter(
    (b) => (b as Record<string, unknown>).bookable_sessions !== null
  );

  if (validBookings.length === 0) {
    return NextResponse.json({
      message: "No bookings to remind for tomorrow",
      reminders_sent: 0,
    });
  }

  const todayStr = now.toISOString().split("T")[0];
  let remindersSent = 0;

  for (const booking of validBookings) {
    const session = (booking as Record<string, unknown>)
      .bookable_sessions as {
      id: string;
      title: string;
      date: string;
      start_time: string;
      end_time: string;
      location_name: string;
      location_address: string;
    };

    // Check if a reminder was already sent today for this booking
    const { data: existingNotification } = await admin
      .from("notifications")
      .select("id")
      .eq("type", "booking_reminder")
      .eq("entity_id", booking.id)
      .gte("created_at", `${todayStr}T00:00:00`)
      .lt("created_at", `${todayStr}T23:59:59`)
      .limit(1);

    if (existingNotification && existingNotification.length > 0) {
      continue;
    }

    // Get parent's user details for email and notification
    const { data: parentProfile } = await admin
      .from("parent_profiles")
      .select("user_id")
      .eq("id", booking.parent_id)
      .single();

    if (!parentProfile) continue;

    const { data: user } = await admin.auth.admin.getUserById(
      parentProfile.user_id
    );

    if (!user?.user?.email) continue;

    const children = (
      booking.children_json as Array<{ child_name: string }>
    ).map((c) => ({ name: c.child_name }));

    // Generate email
    const { subject, html } = bookingReminderEmail(session, children);

    // Send email
    await sendEmail(user.user.email, subject, html);

    // Create notification record
    await admin.from("notifications").insert({
      user_id: parentProfile.user_id,
      type: "booking_reminder",
      title: `Tomorrow: ${session.title}`,
      body: `Your session is tomorrow at ${session.start_time}. Don't forget to bring comfortable clothes and a water bottle!`,
      tier: "important",
      entity_type: "booking",
      entity_id: booking.id,
      data: { bookable_session_id: session.id },
    });

    remindersSent++;
  }

  return NextResponse.json({
    message: "Booking reminders processed",
    reminders_sent: remindersSent,
    total_bookings_checked: validBookings.length,
  });
}
