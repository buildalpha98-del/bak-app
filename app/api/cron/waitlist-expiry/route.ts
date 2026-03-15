import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { processWaitlistForSession } from "@/lib/bookings/actions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  // Find all waitlist entries with expired offers
  const { data: expiredOffers, error } = await admin
    .from("waitlist")
    .select("id, bookable_session_id, parent_id")
    .eq("status", "offered")
    .lt("offer_expires_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expiredOffers || expiredOffers.length === 0) {
    return NextResponse.json({
      message: "No expired waitlist offers",
      expired: 0,
      reoffered: 0,
    });
  }

  let expiredCount = 0;
  let reofferedCount = 0;
  const sessionsToProcess = new Set<string>();

  // Mark all expired offers
  for (const offer of expiredOffers) {
    const { error: updateError } = await admin
      .from("waitlist")
      .update({ status: "expired" })
      .eq("id", offer.id);

    if (!updateError) {
      expiredCount++;
      sessionsToProcess.add(offer.bookable_session_id);

      // Send expiry notification to parent
      const { data: parent } = await admin
        .from("parent_profiles")
        .select("user_id")
        .eq("id", offer.parent_id)
        .single();

      const { data: session } = await admin
        .from("bookable_sessions")
        .select("title, date")
        .eq("id", offer.bookable_session_id)
        .single();

      if (parent && session) {
        await admin.from("notifications").insert({
          user_id: parent.user_id,
          type: "waitlist_expired",
          title: "Waitlist offer expired",
          body: `Your spot offer for ${session.title} on ${new Date(session.date).toLocaleDateString("en-AU")} has expired.`,
          tier: "informational",
          entity_type: "waitlist",
          entity_id: offer.id,
          data: { bookable_session_id: offer.bookable_session_id },
        });
      }
    }
  }

  // Process waitlist for each affected session (offer to next person)
  for (const sessionId of sessionsToProcess) {
    const { offered } = await processWaitlistForSession(sessionId);
    if (offered) reofferedCount++;
  }

  return NextResponse.json({
    message: "Waitlist expiry processed",
    expired: expiredCount,
    reoffered: reofferedCount,
  });
}
