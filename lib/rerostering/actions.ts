"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { suggestReplacements } from "@/lib/utils/scheduling/rerostering";
import { triggerNotification, triggerNotificationForOps } from "@/lib/notifications/send";
import { autoCreateTask } from "@/lib/tasks/auto-create";
import { checkCoachCertsForSession } from "@/lib/utils/compliance/check-coach-certs";
import type { CancellationReasonType } from "@/lib/types/enums";

/**
 * Coach cancels a confirmed session — triggers rerostering flow.
 */
export async function cancelSessionAsCoach(
  sessionId: string,
  reason: CancellationReasonType,
  details?: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify coach owns this session
  const { data: session } = await supabase
    .from("sessions")
    .select("id, coach_id, centre_id, date, time, sport, status, duration_minutes, centres(name)")
    .eq("id", sessionId)
    .single();

  if (!session || session.coach_id !== user.id) {
    return { error: "Session not found or not your session" };
  }

  if (!["confirmed", "pending_confirmation"].includes(session.status)) {
    return { error: "Can only cancel confirmed or pending sessions" };
  }

  // Update session status
  await supabase
    .from("sessions")
    .update({
      status: "needs_replacement",
      coach_id: null,
      cancellation_reason: `Coach cancelled: ${reason}${details ? ` - ${details}` : ""}`,
    })
    .eq("id", sessionId);

  // Generate replacement suggestions
  const suggestions = await suggestReplacements(sessionId);

  // Create rerostering event
  const { data: event } = await supabase
    .from("rerostering_events")
    .insert({
      session_id: sessionId,
      original_coach_id: user.id,
      cancellation_reason: reason,
      cancellation_details: details || null,
      suggestions_json: suggestions,
      offer_status: "pending_offer",
    })
    .select()
    .single();

  // Get coach name for notification
  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const centreName = (session as any).centres?.name || "Unknown Centre";

  // Notify ops (URGENT — tier derived from EVENT_TIER_MAP)
  await triggerNotificationForOps({
    type: "rerostering_escalation",
    title: "Coach Cancellation",
    body: `${coachProfile?.name || "Coach"} cancelled ${session.sport} at ${centreName} on ${session.date} at ${session.time} — ${suggestions.length} replacement options available`,
    entityType: "session",
    entityId: sessionId,
    data: { rerostering_event_id: event?.id },
  });

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "coach_cancelled_session",
    entity_type: "session",
    entity_id: sessionId,
    metadata: { reason, details, suggestions_count: suggestions.length },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  revalidatePath("/coach/schedule");

  return { data: event };
}

/**
 * Ops sends a replacement offer to a coach.
 */
export async function sendReplacementOffer(
  eventId: string,
  coachId: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get the event with session details
  const { data: event } = await supabase
    .from("rerostering_events")
    .select("id, session_id, offer_status")
    .eq("id", eventId)
    .single();

  if (!event) return { error: "Rerostering event not found" };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, date, time, sport, duration_minutes, centre_id, centres(name)")
    .eq("id", event.session_id)
    .single();

  if (!session) return { error: "Session not found" };

  // Set offer expiry (30 minutes)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  // Update event
  await supabase
    .from("rerostering_events")
    .update({
      selected_replacement_id: coachId,
      offer_status: "offer_sent",
      offer_sent_at: new Date().toISOString(),
      offer_expires_at: expiresAt.toISOString(),
      approved_by: user.id,
    })
    .eq("id", eventId);

  const centreName = (session as any).centres?.name || "Unknown Centre";

  // Send URGENT notification to the coach
  const { data: targetCoach } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", coachId)
    .single();

  if (targetCoach) {
    await triggerNotification(
      {
        type: "rerostering_offer",
        title: "Can You Cover?",
        body: `${session.sport} at ${centreName} on ${session.date} at ${session.time} — Accept or Decline (30 min to respond)`,
        entityType: "rerostering_event",
        entityId: eventId,
        data: { session_id: session.id, expires_at: expiresAt.toISOString() },
      },
      [{ userId: targetCoach.id, email: targetCoach.email, name: targetCoach.name, role: targetCoach.role }]
    );
  }

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "replacement_offer_sent",
    entity_type: "rerostering_event",
    entity_id: eventId,
    metadata: { coach_id: coachId, expires_at: expiresAt.toISOString() },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/coach/schedule");
  return { data: { sent: true } };
}

/**
 * Coach responds to a replacement offer.
 */
export async function respondToReplacementOffer(
  eventId: string,
  accept: boolean
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: event } = await supabase
    .from("rerostering_events")
    .select("id, session_id, selected_replacement_id, offer_status, original_coach_id, offer_expires_at")
    .eq("id", eventId)
    .single();

  if (!event || event.selected_replacement_id !== user.id) {
    return { error: "Event not found or not your offer" };
  }

  if (event.offer_status !== "offer_sent") {
    return { error: "Offer is no longer active" };
  }

  // Check if expired
  if (event.offer_expires_at && new Date(event.offer_expires_at) < new Date()) {
    return { error: "Offer has expired" };
  }

  if (accept) {
    // Cert guard: even though the offer was sent, refuse to attach
    // an expired-cert coach. Race-safe: the session's date is fixed
    // by the time we get here.
    const { data: targetSession } = await supabase
      .from("sessions")
      .select("date")
      .eq("id", event.session_id)
      .single();
    if (targetSession?.date) {
      const certCheck = await checkCoachCertsForSession(user.id, targetSession.date);
      if (!certCheck.ok) return { error: certCheck.message };
    }

    // Update session with new coach
    await supabase
      .from("sessions")
      .update({ coach_id: user.id, status: "confirmed", cancellation_reason: null })
      .eq("id", event.session_id);

    // Resolve event
    await supabase
      .from("rerostering_events")
      .update({
        offer_status: "accepted",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    // Notify ops
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    await triggerNotificationForOps({
      type: "rerostering_accepted",
      title: "Replacement Accepted",
      body: `${coachProfile?.name || "Coach"} accepted the replacement shift`,
      entityType: "session",
      entityId: event.session_id,
    });

    // Notify original coach
    const { data: originalCoach } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", event.original_coach_id)
      .single();

    if (originalCoach) {
      await triggerNotification(
        {
          type: "rerostering_accepted",
          title: "Replacement Found",
          body: `${coachProfile?.name || "A coach"} is covering your cancelled session`,
          entityType: "session",
          entityId: event.session_id,
        },
        [{ userId: originalCoach.id, email: originalCoach.email, name: originalCoach.name, role: originalCoach.role }]
      );
    }
  } else {
    // Declined
    await supabase
      .from("rerostering_events")
      .update({ offer_status: "declined" })
      .eq("id", eventId);

    // Notify ops to try next suggestion
    await triggerNotificationForOps({
      type: "rerostering_declined",
      title: "Replacement Declined",
      body: "Coach declined the replacement offer — select next candidate",
      entityType: "rerostering_event",
      entityId: eventId,
    });
  }

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: accept ? "replacement_accepted" : "replacement_declined",
    entity_type: "rerostering_event",
    entity_id: eventId,
  });

  revalidatePath("/ops/roster");
  revalidatePath("/coach/schedule");
  return { data: { accepted: accept } };
}

/**
 * Check for expired offers and escalations. Called by cron or on page load.
 */
export async function processRerosteringEscalations() {
  const supabase = await createSupabaseServerClient();

  // Find expired offers
  const { data: expiredOffers } = await supabase
    .from("rerostering_events")
    .select("id, session_id, selected_replacement_id, suggestions_json")
    .eq("offer_status", "offer_sent")
    .lt("offer_expires_at", new Date().toISOString());

  for (const event of expiredOffers || []) {
    await supabase
      .from("rerostering_events")
      .update({ offer_status: "expired" })
      .eq("id", event.id);

    // Notify ops
    await triggerNotificationForOps({
      type: "rerostering_expired",
      title: "Replacement Offer Expired",
      body: "Coach did not respond in time — select next candidate",
      entityType: "rerostering_event",
      entityId: event.id,
    });
  }

  // Find sessions within 4 hours that still need replacement
  const today = new Date().toISOString().split("T")[0];

  const { data: urgentSessions } = await supabase
    .from("sessions")
    .select("id, date, time, centre_id, sport")
    .eq("status", "needs_replacement")
    .eq("date", today);

  for (const session of urgentSessions || []) {
    const sessionDateTime = new Date(`${session.date}T${session.time}`);
    const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    // Check if already escalated
    const { data: event } = await supabase
      .from("rerostering_events")
      .select("id, escalated")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (event?.escalated) continue;

    if (hoursUntil <= 4 && hoursUntil > 2) {
      // Escalate to admin
      await triggerNotificationForOps({
        type: "rerostering_escalation",
        title: "Urgent: No Replacement",
        body: `Session at ${session.time} today still needs a replacement coach — ${Math.round(hoursUntil)} hours remaining`,
        entityType: "session",
        entityId: session.id,
      });
    } else if (hoursUntil <= 2) {
      // Notify centre + create urgent task
      const { data: centre } = await supabase
        .from("centres")
        .select("primary_contact_email, name")
        .eq("id", session.centre_id)
        .single();

      if (centre?.primary_contact_email) {
        // Send email to centre (fire and forget — positional params)
        const { sendEmail } = await import("@/lib/email/send");
        sendEmail(
          centre.primary_contact_email,
          `Update: Today's ${session.sport} Session`,
          `<p>Hi,</p><p>We're arranging a replacement coach for today's session at ${centre.name}. We'll confirm as soon as possible.</p><p>Build Alpha Kids</p>`
        ).catch(console.error);
      }

      // Create urgent task
      await autoCreateTask({
        title: `No replacement found for ${session.sport} session`,
        description: `Session at ${session.time} on ${session.date} still has no coach. All suggestions exhausted.`,
        priority: "urgent",
        source: "rerostering",
        linkedEntityType: "session",
        linkedEntityId: session.id,
      });

      // Mark escalated
      if (event) {
        await supabase
          .from("rerostering_events")
          .update({ escalated: true })
          .eq("id", event.id);
      }
    }
  }
}

/**
 * Get active rerostering events (for ops command centre widget).
 */
export async function getActiveRerosteringEvents() {
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("rerostering_events")
    .select(`
      id, session_id, original_coach_id, cancellation_reason,
      suggestions_json, selected_replacement_id, offer_status,
      offer_sent_at, offer_expires_at, escalated, created_at
    `)
    .in("offer_status", ["pending_offer", "offer_sent"])
    .order("created_at", { ascending: false });

  if (!events || events.length === 0) return [];

  // Enrich with session + coach details
  const sessionIds = events.map((e) => e.session_id);
  const coachIds = [
    ...events.map((e) => e.original_coach_id),
    ...events.filter((e) => e.selected_replacement_id).map((e) => e.selected_replacement_id!),
  ];

  const [{ data: sessions }, { data: coaches }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, date, time, sport, duration_minutes, centre_id, centres(name)")
      .in("id", sessionIds),
    supabase
      .from("profiles")
      .select("id, name, phone")
      .in("id", coachIds),
  ]);

  const sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
  const coachMap = new Map((coaches || []).map((c) => [c.id, c]));

  return events.map((event) => ({
    ...event,
    session: sessionMap.get(event.session_id),
    original_coach: coachMap.get(event.original_coach_id),
    selected_replacement: event.selected_replacement_id
      ? coachMap.get(event.selected_replacement_id)
      : null,
  }));
}

/**
 * Get rerostering history for reporting.
 */
export async function getRerosteringHistory(limit = 50) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("rerostering_events")
    .select(`
      id, session_id, original_coach_id, cancellation_reason,
      offer_status, escalated, created_at, resolved_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
