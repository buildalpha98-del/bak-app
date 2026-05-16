"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { triggerNotification, triggerNotificationForOps } from "@/lib/notifications/send";
import { checkCoachCertsForSession } from "@/lib/utils/compliance/check-coach-certs";
import { setSessionCoaches } from "@/lib/sessions/session-coaches";
import type { SwapStatus } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

/** Swap request with joined session + coach details for ops/coach views */
export interface SwapRequestWithDetails {
  id: string;
  session_id: string;
  status: SwapStatus;
  created_at: string;
  coach_responded_at: string | null;
  ops_responded_at: string | null;
  // Joined
  session_date: string;
  session_time: string;
  session_sport: string;
  session_duration_minutes: number;
  centre_name: string;
  requesting_coach_name: string;
  proposed_coach_name: string;
}

/** Incoming swap request for the proposed coach */
export interface IncomingSwapRequest {
  swap_request_id: string;
  session_id: string;
  session_date: string;
  session_time: string;
  session_sport: string;
  session_duration_minutes: number;
  centre_name: string;
  requesting_coach_name: string;
  created_at: string;
}

/** Unconfirmed shift for ops banner */
export interface UnconfirmedShift {
  session_id: string;
  date: string;
  time: string;
  sport: string;
  centre_name: string;
  coach_id: string;
  coach_name: string;
  pending_since: string;
  hours_pending: number;
}

// ============================================================
// 1. confirmShift
// ============================================================

export async function confirmShift(
  sessionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Fetch session with centre name for notification
    const { data: session, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, coach_id, status, date, time, sport, centres:centre_id(name)")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) return { error: "Session not found." };
    if (session.coach_id !== user.id) return { error: "Session not found." };
    if (session.status !== "pending_confirmation") {
      return { error: `Cannot confirm a session with status "${session.status}".` };
    }

    // Update status
    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId);

    if (updateErr) throw updateErr;

    const centre = session.centres as unknown as Record<string, unknown> | null;
    const centreName = (centre?.name as string) ?? "Unknown";

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "shift_confirmed",
      entity_type: "session",
      entity_id: sessionId,
      metadata: {
        date: session.date,
        sport: session.sport,
        centre_name: centreName,
      },
    });

    // Notify ops
    await triggerNotificationForOps({
      type: "shift_confirmed",
      title: "Shift Confirmed",
      body: `Coach confirmed ${session.sport} at ${centreName} on ${session.date}.`,
      entityType: "session",
      entityId: sessionId,
    });

    return { error: null };
  } catch (err) {
    console.error("confirmShift error:", err);
    return { error: "Failed to confirm shift." };
  }
}

// ============================================================
// 2. declineShift
// ============================================================

export async function declineShift(
  sessionId: string,
  reason: string
): Promise<{ error: string | null }> {
  try {
    if (!reason.trim()) return { error: "A reason is required to decline." };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Fetch session
    const { data: session, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, coach_id, status, date, time, sport, centres:centre_id(name)")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) return { error: "Session not found." };
    if (session.coach_id !== user.id) return { error: "Session not found." };
    if (session.status !== "pending_confirmation") {
      return { error: `Cannot decline a session with status "${session.status}".` };
    }

    const previousCoachId = session.coach_id;

    // Clear the coach through the helper. The trigger would auto-flip
    // status to needs_replacement, but we immediately overwrite with
    // "published" per the existing decline-shift contract.
    const { error: clearErr } = await setSessionCoaches({
      sessionId,
      coaches: [],
      assignedBy: user.id,
    });
    if (clearErr) return { error: clearErr };

    const { error: statusErr } = await supabase
      .from("sessions")
      .update({ status: "published" })
      .eq("id", sessionId);

    if (statusErr) return { error: "Failed to update shift." };

    const centre = session.centres as unknown as Record<string, unknown> | null;
    const centreName = (centre?.name as string) ?? "Unknown";

    // Log activity with reason
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "shift_declined",
      entity_type: "session",
      entity_id: sessionId,
      metadata: {
        reason: reason.trim(),
        previous_coach_id: previousCoachId,
        date: session.date,
        sport: session.sport,
        centre_name: centreName,
      },
    });

    // Notify ops (urgent — needs replacement coach)
    await triggerNotificationForOps({
      type: "shift_declined",
      title: "Shift Declined — Replacement Needed",
      body: `Coach declined ${session.sport} at ${centreName} on ${session.date}. Reason: ${reason.trim()}`,
      entityType: "session",
      entityId: sessionId,
    });

    return { error: null };
  } catch (err) {
    console.error("declineShift error:", err);
    return { error: "Failed to decline shift." };
  }
}

// ============================================================
// 3. bulkConfirmShifts
// ============================================================

export async function bulkConfirmShifts(
  sessionIds: string[]
): Promise<{
  data: { confirmed: number; skipped: number } | null;
  error: string | null;
}> {
  try {
    if (sessionIds.length === 0) return { data: { confirmed: 0, skipped: 0 }, error: null };

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Fetch all sessions
    const { data: sessions, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, coach_id, status, date, sport, centres:centre_id(name)")
      .in("id", sessionIds);

    if (fetchErr) throw fetchErr;

    // Filter valid sessions (owned by this coach + pending_confirmation)
    const validSessions = (sessions ?? []).filter(
      (s) => s.coach_id === user.id && s.status === "pending_confirmation"
    );
    const validIds = validSessions.map((s) => s.id);
    const skipped = sessionIds.length - validIds.length;

    if (validIds.length === 0) {
      return { data: { confirmed: 0, skipped }, error: null };
    }

    // Bulk update
    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ status: "confirmed" })
      .in("id", validIds);

    if (updateErr) throw updateErr;

    // Log each confirmation
    const logRows = validSessions.map((s) => {
      const centre = s.centres as unknown as Record<string, unknown> | null;
      return {
        user_id: user.id,
        action: "shift_confirmed",
        entity_type: "session",
        entity_id: s.id,
        metadata: {
          date: s.date,
          sport: s.sport,
          centre_name: (centre?.name as string) ?? "Unknown",
          bulk: true,
        },
      };
    });
    await supabase.from("activity_log").insert(logRows);

    // Notify ops once with count
    await triggerNotificationForOps({
      type: "bulk_shifts_confirmed",
      title: "Shifts Confirmed",
      body: `Coach confirmed ${validIds.length} shift${validIds.length > 1 ? "s" : ""}.`,
      entityType: "session",
      entityId: validIds[0],
    });

    return { data: { confirmed: validIds.length, skipped }, error: null };
  } catch (err) {
    console.error("bulkConfirmShifts error:", err);
    return { data: null, error: "Failed to confirm shifts." };
  }
}

// ============================================================
// 4. respondToSwapRequest
// ============================================================

export async function respondToSwapRequest(
  swapRequestId: string,
  accept: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Fetch swap request with session details
    const { data: swap, error: fetchErr } = await supabase
      .from("swap_requests")
      .select(
        "id, proposed_coach_id, requesting_coach_id, status, session_id, sessions:session_id(date, time, sport, centres:centre_id(name))"
      )
      .eq("id", swapRequestId)
      .single();

    if (fetchErr || !swap) return { error: "Swap request not found." };
    if (swap.proposed_coach_id !== user.id) return { error: "Swap request not found." };
    if (swap.status !== "pending_coach") {
      return { error: `Cannot respond to a swap request with status "${swap.status}".` };
    }

    const now = new Date().toISOString();

    if (accept) {
      // Accept → pending_ops
      const { error: updateErr } = await supabase
        .from("swap_requests")
        .update({ status: "pending_ops", coach_responded_at: now })
        .eq("id", swapRequestId);

      if (updateErr) throw updateErr;

      const session = swap.sessions as unknown as Record<string, unknown> | null;
      const centre = session?.centres as unknown as Record<string, unknown> | null;
      const centreName = (centre?.name as string) ?? "Unknown";

      // Notify ops
      await triggerNotificationForOps({
        type: "swap_request_accepted",
        title: "Swap Request Awaiting Approval",
        body: `Coach accepted swap for ${(session?.sport as string) ?? "session"} at ${centreName} on ${(session?.date as string) ?? ""}. Ops approval required.`,
        entityType: "swap_request",
        entityId: swapRequestId,
      });
    } else {
      // Decline → rejected
      const { error: updateErr } = await supabase
        .from("swap_requests")
        .update({ status: "rejected", coach_responded_at: now })
        .eq("id", swapRequestId);

      if (updateErr) throw updateErr;

      // Notify requesting coach
      await triggerNotification(
        {
          type: "swap_request_declined",
          title: "Swap Request Declined",
          body: "The proposed coach declined your swap request. You can try requesting a different coach.",
          entityType: "swap_request",
          entityId: swapRequestId,
        },
        [{ userId: swap.requesting_coach_id }]
      );
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "swap_request_responded",
      entity_type: "swap_request",
      entity_id: swapRequestId,
      metadata: { accepted: accept, session_id: swap.session_id },
    });

    return { error: null };
  } catch (err) {
    console.error("respondToSwapRequest error:", err);
    return { error: "Failed to respond to swap request." };
  }
}

// ============================================================
// 5. opsApproveSwap
// ============================================================

export async function opsApproveSwap(
  swapRequestId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify ops/admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Insufficient permissions." };
    }

    // Fetch swap request
    const { data: swap, error: fetchErr } = await supabase
      .from("swap_requests")
      .select(
        "id, session_id, requesting_coach_id, proposed_coach_id, status, sessions:session_id(date, time, sport, coach_id, centres:centre_id(name))"
      )
      .eq("id", swapRequestId)
      .single();

    if (fetchErr || !swap) return { error: "Swap request not found." };
    if (swap.status !== "pending_ops") {
      return { error: `Cannot approve a swap request with status "${swap.status}".` };
    }

    // Cert guard: refuse if the proposed coach has expired/rejected
    // wwcc or first_aid by the session date.
    const sessionForCheck = swap.sessions as unknown as { date?: string } | null;
    if (sessionForCheck?.date && swap.proposed_coach_id) {
      const certCheck = await checkCoachCertsForSession(
        swap.proposed_coach_id,
        sessionForCheck.date,
      );
      if (!certCheck.ok) return { error: certCheck.message };
    }

    const now = new Date().toISOString();

    // Update swap request
    const { error: swapErr } = await supabase
      .from("swap_requests")
      .update({
        status: "approved",
        ops_approved_by: user.id,
        ops_responded_at: now,
      })
      .eq("id", swapRequestId);

    if (swapErr) throw swapErr;

    // Update session coach through the helper
    const { error: writeErr } = await setSessionCoaches({
      sessionId: swap.session_id,
      coaches: [{ userId: swap.proposed_coach_id, isPrimary: true }],
      assignedBy: user.id,
    });
    if (writeErr) return { error: writeErr };

    const session = swap.sessions as unknown as Record<string, unknown> | null;
    const centre = session?.centres as unknown as Record<string, unknown> | null;
    const centreName = (centre?.name as string) ?? "Unknown";
    const sport = (session?.sport as string) ?? "session";
    const date = (session?.date as string) ?? "";

    // Notify both coaches
    await triggerNotification(
      {
        type: "swap_approved",
        title: "Swap Approved",
        body: `Your swap request for ${sport} at ${centreName} on ${date} has been approved. You are no longer assigned to this session.`,
        entityType: "swap_request",
        entityId: swapRequestId,
      },
      [{ userId: swap.requesting_coach_id }]
    );

    await triggerNotification(
      {
        type: "swap_approved",
        title: "Swap Approved — New Assignment",
        body: `You have been assigned to ${sport} at ${centreName} on ${date} via an approved swap.`,
        entityType: "session",
        entityId: swap.session_id,
      },
      [{ userId: swap.proposed_coach_id }]
    );

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "swap_approved",
      entity_type: "swap_request",
      entity_id: swapRequestId,
      metadata: {
        session_id: swap.session_id,
        original_coach_id: swap.requesting_coach_id,
        new_coach_id: swap.proposed_coach_id,
      },
    });

    return { error: null };
  } catch (err) {
    console.error("opsApproveSwap error:", err);
    return { error: "Failed to approve swap request." };
  }
}

// ============================================================
// 6. opsRejectSwap
// ============================================================

export async function opsRejectSwap(
  swapRequestId: string,
  reason?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify ops/admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Insufficient permissions." };
    }

    // Fetch swap request
    const { data: swap, error: fetchErr } = await supabase
      .from("swap_requests")
      .select("id, session_id, requesting_coach_id, status")
      .eq("id", swapRequestId)
      .single();

    if (fetchErr || !swap) return { error: "Swap request not found." };
    if (swap.status !== "pending_ops") {
      return { error: `Cannot reject a swap request with status "${swap.status}".` };
    }

    const now = new Date().toISOString();

    // Update swap request
    const { error: swapErr } = await supabase
      .from("swap_requests")
      .update({ status: "rejected", ops_responded_at: now })
      .eq("id", swapRequestId);

    if (swapErr) throw swapErr;

    // Notify requesting coach
    const reasonText = reason?.trim()
      ? ` Reason: ${reason.trim()}`
      : "";
    await triggerNotification(
      {
        type: "swap_rejected",
        title: "Swap Request Rejected",
        body: `Your swap request was rejected by operations.${reasonText}`,
        entityType: "swap_request",
        entityId: swapRequestId,
      },
      [{ userId: swap.requesting_coach_id }]
    );

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "swap_rejected",
      entity_type: "swap_request",
      entity_id: swapRequestId,
      metadata: {
        session_id: swap.session_id,
        reason: reason?.trim() ?? null,
      },
    });

    return { error: null };
  } catch (err) {
    console.error("opsRejectSwap error:", err);
    return { error: "Failed to reject swap request." };
  }
}

// ============================================================
// 7. getIncomingSwapRequests
// ============================================================

export async function getIncomingSwapRequests(
  coachId: string
): Promise<{ data: IncomingSwapRequest[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("swap_requests")
      .select(
        "id, session_id, created_at, requesting_coach:requesting_coach_id(name), sessions:session_id(date, time, sport, duration_minutes, centres:centre_id(name))"
      )
      .eq("proposed_coach_id", coachId)
      .eq("status", "pending_coach")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mapped: IncomingSwapRequest[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const session = r.sessions as unknown as Record<string, unknown> | null;
        const centre = session?.centres as unknown as Record<string, unknown> | null;
        const coach = r.requesting_coach as unknown as Record<string, unknown> | null;

        return {
          swap_request_id: r.id as string,
          session_id: r.session_id as string,
          session_date: (session?.date as string) ?? "",
          session_time: (session?.time as string) ?? "",
          session_sport: (session?.sport as string) ?? "",
          session_duration_minutes: (session?.duration_minutes as number) ?? 0,
          centre_name: (centre?.name as string) ?? "Unknown",
          requesting_coach_name: (coach?.name as string) ?? "Unknown",
          created_at: r.created_at as string,
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getIncomingSwapRequests error:", err);
    return { data: null, error: "Failed to fetch incoming swap requests." };
  }
}

// ============================================================
// 8. getSwapRequestsForOps
// ============================================================

export async function getSwapRequestsForOps(): Promise<{
  data: SwapRequestWithDetails[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("swap_requests")
      .select(
        "id, session_id, status, created_at, coach_responded_at, ops_responded_at, requesting_coach:requesting_coach_id(name), proposed_coach:proposed_coach_id(name), sessions:session_id(date, time, sport, duration_minutes, centres:centre_id(name))"
      )
      .eq("status", "pending_ops")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { data: mapSwapResults(data ?? []), error: null };
  } catch (err) {
    console.error("getSwapRequestsForOps error:", err);
    return { data: null, error: "Failed to fetch swap requests." };
  }
}

// ============================================================
// 9. getSwapRequestHistory
// ============================================================

export async function getSwapRequestHistory(): Promise<{
  data: SwapRequestWithDetails[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("swap_requests")
      .select(
        "id, session_id, status, created_at, coach_responded_at, ops_responded_at, requesting_coach:requesting_coach_id(name), proposed_coach:proposed_coach_id(name), sessions:session_id(date, time, sport, duration_minutes, centres:centre_id(name))"
      )
      .in("status", ["approved", "rejected", "cancelled"])
      .order("ops_responded_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return { data: mapSwapResults(data ?? []), error: null };
  } catch (err) {
    console.error("getSwapRequestHistory error:", err);
    return { data: null, error: "Failed to fetch swap request history." };
  }
}

/** Map raw Supabase swap results to SwapRequestWithDetails */
function mapSwapResults(
  data: Record<string, unknown>[]
): SwapRequestWithDetails[] {
  return data.map((r) => {
    const session = r.sessions as unknown as Record<string, unknown> | null;
    const centre = session?.centres as unknown as Record<string, unknown> | null;
    const reqCoach = r.requesting_coach as unknown as Record<string, unknown> | null;
    const propCoach = r.proposed_coach as unknown as Record<string, unknown> | null;

    return {
      id: r.id as string,
      session_id: r.session_id as string,
      status: r.status as SwapStatus,
      created_at: r.created_at as string,
      coach_responded_at: (r.coach_responded_at as string) ?? null,
      ops_responded_at: (r.ops_responded_at as string) ?? null,
      session_date: (session?.date as string) ?? "",
      session_time: (session?.time as string) ?? "",
      session_sport: (session?.sport as string) ?? "",
      session_duration_minutes: (session?.duration_minutes as number) ?? 0,
      centre_name: (centre?.name as string) ?? "Unknown",
      requesting_coach_name: (reqCoach?.name as string) ?? "Unknown",
      proposed_coach_name: (propCoach?.name as string) ?? "Unknown",
    };
  });
}

// ============================================================
// 10. getUnconfirmedShifts
// ============================================================

export async function getUnconfirmedShifts(
  hours: number = 24
): Promise<{ data: UnconfirmedShift[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, date, time, sport, coach_id, updated_at, centres:centre_id(name), profiles:coach_id(name)"
      )
      .eq("status", "pending_confirmation")
      .lt("updated_at", cutoff)
      .not("coach_id", "is", null)
      .order("updated_at");

    if (error) throw error;

    const now = Date.now();
    const mapped: UnconfirmedShift[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const centre = r.centres as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        const updatedAt = r.updated_at as string;
        const hoursP = Math.floor(
          (now - new Date(updatedAt).getTime()) / (60 * 60 * 1000)
        );

        return {
          session_id: r.id as string,
          date: r.date as string,
          time: r.time as string,
          sport: r.sport as string,
          centre_name: (centre?.name as string) ?? "Unknown",
          coach_id: r.coach_id as string,
          coach_name: (profile?.name as string) ?? "Unknown",
          pending_since: updatedAt,
          hours_pending: hoursP,
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getUnconfirmedShifts error:", err);
    return { data: null, error: "Failed to fetch unconfirmed shifts." };
  }
}

// ============================================================
// 11. sendShiftReminder
// ============================================================

export async function sendShiftReminder(
  sessionId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Verify ops/admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Insufficient permissions." };
    }

    // Fetch session
    const { data: session, error: fetchErr } = await supabase
      .from("sessions")
      .select("id, coach_id, status, date, time, sport, centres:centre_id(name)")
      .eq("id", sessionId)
      .single();

    if (fetchErr || !session) return { error: "Session not found." };
    if (session.status !== "pending_confirmation") {
      return { error: "Session is not pending confirmation." };
    }
    if (!session.coach_id) {
      return { error: "Session has no assigned coach." };
    }

    const centre = session.centres as unknown as Record<string, unknown> | null;
    const centreName = (centre?.name as string) ?? "Unknown";

    // Send reminder notification
    await triggerNotification(
      {
        type: "shift_reminder",
        title: "Shift Confirmation Reminder",
        body: `Please confirm your ${session.sport} session at ${centreName} on ${session.date} at ${session.time}.`,
        entityType: "session",
        entityId: sessionId,
      },
      [{ userId: session.coach_id }]
    );

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "shift_reminder_sent",
      entity_type: "session",
      entity_id: sessionId,
      metadata: {
        coach_id: session.coach_id,
        date: session.date,
      },
    });

    return { error: null };
  } catch (err) {
    console.error("sendShiftReminder error:", err);
    return { error: "Failed to send reminder." };
  }
}
