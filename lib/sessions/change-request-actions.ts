"use server";

// Staff side of portal session-change requests (migration 086).
// Approval applies the change through the EXISTING session write
// paths (updateSession / updateSessionStatus) so every invariant —
// status transitions, activity log, coach notifications — holds.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSession, updateSessionStatus } from "@/lib/sessions/actions";
import { createNotification } from "@/lib/launch/notifications";

export interface PendingChangeRequest {
  id: string;
  session_id: string;
  centre_id: string;
  request_type: "reschedule" | "cancel";
  requested_date: string | null;
  requested_time: string | null;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  created_at: string;
  requester_name: string | null;
}

async function requireStaff(): Promise<{ userId: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, error: "Not authenticated." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();
  if (
    !profile ||
    profile.status !== "active" ||
    (profile.role !== "admin" && profile.role !== "ops")
  ) {
    return { userId: null, error: "Not authorised." };
  }
  return { userId: user.id, error: null };
}

/** Pending requests for one session (the roster sheet's banner). */
export async function getChangeRequestsForSession(
  sessionId: string
): Promise<{ data: PendingChangeRequest[]; error: string | null }> {
  try {
    const { error: authError } = await requireStaff();
    if (authError) return { data: [], error: authError };
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("session_change_requests")
      .select(
        "id, session_id, centre_id, request_type, requested_date, requested_time, reason, status, created_at, client_users:requested_by(name)"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error: error.message };
    return {
      data: (data ?? []).map((r) => ({
        id: r.id,
        session_id: r.session_id,
        centre_id: r.centre_id,
        request_type: r.request_type as "reschedule" | "cancel",
        requested_date: r.requested_date,
        requested_time: r.requested_time,
        reason: r.reason,
        status: r.status as PendingChangeRequest["status"],
        created_at: r.created_at,
        requester_name:
          (r.client_users as unknown as { name: string | null } | null)?.name ??
          null,
      })),
      error: null,
    };
  } catch (err) {
    console.error("getChangeRequestsForSession error:", err);
    return { data: [], error: "Failed to load change requests." };
  }
}

/**
 * Approve or decline. Approving a cancel cancels the session (with the
 * request reason); approving a reschedule moves the session to the
 * requested date (and time when given). The requester is notified in
 * their portal either way.
 */
export async function resolveChangeRequest(
  requestId: string,
  action: "approve" | "decline",
  note?: string
): Promise<{ error: string | null }> {
  try {
    const { userId, error: authError } = await requireStaff();
    if (authError) return { error: authError };
    const supabase = await createSupabaseServerClient();

    const { data: req } = await supabase
      .from("session_change_requests")
      .select(
        "id, session_id, centre_id, request_type, requested_date, requested_time, reason, status, client_users:requested_by(user_id)"
      )
      .eq("id", requestId)
      .maybeSingle();
    if (!req) return { error: "Request not found." };
    if (req.status !== "pending") return { error: "Already resolved." };

    if (action === "approve") {
      if (req.request_type === "cancel") {
        const { error } = await updateSessionStatus(
          req.session_id,
          "cancelled",
          `Centre requested: ${req.reason ?? "no reason given"}`
        );
        if (error) return { error };
      } else {
        if (!req.requested_date) return { error: "Request has no new date." };
        const { error } = await updateSession(req.session_id, {
          date: req.requested_date,
          ...(req.requested_time
            ? { time: String(req.requested_time).slice(0, 5) }
            : {}),
        });
        if (error) return { error };
      }
    }

    const { error: updateErr } = await supabase
      .from("session_change_requests")
      .update({
        status: action === "approve" ? "approved" : "declined",
        resolved_by: userId,
        resolution_note: note?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (updateErr) return { error: updateErr.message };

    // Close the loop with the requester in their portal.
    const requesterUserId = (
      req.client_users as unknown as { user_id: string } | null
    )?.user_id;
    if (requesterUserId) {
      const verb = req.request_type === "cancel" ? "cancellation" : "reschedule";
      void createNotification({
        userId: requesterUserId,
        type: "general",
        title:
          action === "approve"
            ? `Your ${verb} request was approved`
            : `Your ${verb} request was declined`,
        message:
          note?.trim() ||
          (action === "approve"
            ? "We've updated the schedule — see your portal for the latest."
            : "Talk to us in Messages if you'd like to work out an alternative."),
        actionUrl: `/client/${req.centre_id}/schedule`,
        metadata: { change_request_id: requestId },
      }).catch(console.error);
    }

    await supabase.from("activity_log").insert({
      user_id: userId,
      action: `session_change_request_${action}d`,
      entity_type: "session",
      entity_id: req.session_id,
      metadata: {
        request_id: requestId,
        request_type: req.request_type,
        requested_date: req.requested_date,
      },
    });

    return { error: null };
  } catch (err) {
    console.error("resolveChangeRequest error:", err);
    return { error: "Failed to resolve the request." };
  }
}
