"use server";

// Portal self-service: session change requests (migration 086).
// The portal submits and reads through the cookie client — RLS
// (auth_client_centre_ids + session-belongs-to-centre) is the gate,
// with the same join-aware caller resolution as sendCentreMessage.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotificationForOps } from "@/lib/notifications/send";

export interface SessionChangeRequest {
  id: string;
  session_id: string;
  request_type: "reschedule" | "cancel";
  requested_date: string | null;
  requested_time: string | null;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const SELECT_COLS =
  "id, session_id, request_type, requested_date, requested_time, reason, status, resolution_note, created_at, resolved_at";

export async function submitSessionChangeRequest(
  centreId: string,
  sessionId: string,
  input: {
    requestType: "reschedule" | "cancel";
    requestedDate?: string;
    requestedTime?: string;
    reason: string;
  }
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const reason = input.reason.trim();
    if (reason.length < 5) {
      return { error: "Please tell us briefly why — it helps us re-plan." };
    }
    if (input.requestType === "reschedule") {
      if (!input.requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.requestedDate)) {
        return { error: "Pick a preferred new date." };
      }
      if (input.requestedTime && !/^\d{2}:\d{2}$/.test(input.requestedTime)) {
        return { error: "Preferred time must look like 09:30." };
      }
    }

    // Join-aware caller row (multi-campus: their row may default to
    // another centre; RLS re-checks centre access on the insert).
    const { data: cuRows } = await supabase
      .from("client_users")
      .select("id, centre_id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    const clientUser =
      cuRows?.find((r) => r.centre_id === centreId) ?? cuRows?.[0];
    if (!clientUser) return { error: "Not authorised." };

    // Only upcoming, non-terminal sessions can be changed.
    const { data: session } = await supabase
      .from("sessions")
      .select("id, date, time, sport, status, centre_id")
      .eq("id", sessionId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!session) return { error: "Session not found." };
    if (["completed", "cancelled"].includes(session.status)) {
      return { error: "This session has already run or been cancelled." };
    }

    // One open request per session keeps the office queue sane.
    const { data: existing } = await supabase
      .from("session_change_requests")
      .select("id")
      .eq("session_id", sessionId)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) {
      return { error: "There's already a pending request for this session." };
    }

    const { error } = await supabase.from("session_change_requests").insert({
      session_id: sessionId,
      centre_id: centreId,
      requested_by: clientUser.id,
      request_type: input.requestType,
      requested_date: input.requestType === "reschedule" ? input.requestedDate : null,
      requested_time:
        input.requestType === "reschedule" ? (input.requestedTime ?? null) : null,
      reason,
    });
    if (error) return { error: error.message };

    // Tell the office — this is the whole point of self-service.
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", centreId)
      .maybeSingle();
    triggerNotificationForOps({
      type: "session_change_requested",
      title: `${centre?.name ?? "A centre"} asked to ${
        input.requestType === "cancel" ? "cancel" : "reschedule"
      } a session`,
      body: `${session.sport} on ${session.date}${
        input.requestType === "reschedule" && input.requestedDate
          ? ` → preferred ${input.requestedDate}${input.requestedTime ? ` ${input.requestedTime}` : ""}`
          : ""
      } — ${reason.length > 100 ? `${reason.slice(0, 100)}…` : reason}`,
      entityType: "session_change",
      entityId: sessionId,
    }).catch((err) =>
      console.error("session change ops notification failed:", err)
    );

    return { error: null };
  } catch (err) {
    console.error("submitSessionChangeRequest error:", err);
    return { error: "Failed to submit the request." };
  }
}

/** The portal's view of a session's change requests, newest first. */
export async function getSessionChangeRequests(
  centreId: string,
  sessionId: string
): Promise<{ data: SessionChangeRequest[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("session_change_requests")
      .select(SELECT_COLS)
      .eq("centre_id", centreId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as SessionChangeRequest[], error: null };
  } catch (err) {
    console.error("getSessionChangeRequests error:", err);
    return { data: [], error: "Failed to load requests." };
  }
}
