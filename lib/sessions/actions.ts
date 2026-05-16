"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionStatus, CentreType } from "@/lib/types/enums";
import type { Session, Profile } from "@/lib/types/database";
import {
  bulkCheckCoachCertsForSessions,
  checkCoachCertsForSession,
  checkCoachCertsForSessionDates,
} from "@/lib/utils/compliance/check-coach-certs";
import {
  setSessionCoaches,
  type SessionCoachInput,
} from "@/lib/sessions/session-coaches";

// ============================================================
// Types
// ============================================================

export interface SessionWithRelations extends Session {
  centre_name: string;
  centre_type: CentreType;
  coach_name: string | null;
  coach_phone: string | null;
  term_name: string;
  program_title: string | null;
  notes: string | null;
}

export interface CreateSessionData {
  term_id: string;
  date: string;
  time: string;
  duration_minutes: number;
  centre_id: string;
  sport: string;
  coach_id?: string;
  pay_rate_override?: number;
}

export interface UpdateSessionData {
  date?: string;
  time?: string;
  duration_minutes?: number;
  centre_id?: string;
  sport?: string;
  coach_id?: string | null;
  pay_rate_override?: number | null;
  cancellation_reason?: string;
  program_id?: string | null;
}

// ============================================================
// Status transition rules
// ============================================================

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["pending_confirmation", "cancelled"],
  pending_confirmation: ["confirmed", "cancelled", "needs_replacement"],
  confirmed: ["in_progress", "cancelled", "needs_replacement"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  needs_replacement: ["confirmed", "cancelled"],
};

function isValidTransition(
  from: SessionStatus,
  to: SessionStatus
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================
// 1. getSessionsForWeek
// ============================================================

export async function getSessionsForWeek(
  weekStartDate: string // Monday "YYYY-MM-DD"
): Promise<{ data: SessionWithRelations[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Calculate Friday
    const monday = new Date(weekStartDate + "T00:00:00");
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    const weekEndDate = friday.toISOString().split("T")[0];

    const { data: raw, error } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type), profiles:coach_id(name, phone), terms:term_id(name), programs:program_id(sport, skill_focus)"
      )
      .gte("date", weekStartDate)
      .lte("date", weekEndDate)
      .order("date")
      .order("time");

    if (error) throw error;

    const sessions: SessionWithRelations[] = (raw ?? []).map((s) => ({
      id: s.id,
      term_id: s.term_id,
      template_id: s.template_id,
      date: s.date,
      time: s.time,
      duration_minutes: s.duration_minutes,
      centre_id: s.centre_id,
      coach_id: s.coach_id,
      sport: s.sport,
      program_id: s.program_id,
      equipment_kit_id: s.equipment_kit_id,
      status: s.status as SessionStatus,
      pay_rate_override: s.pay_rate_override,
      pay_rate_resolved: s.pay_rate_resolved,
      cancellation_reason: s.cancellation_reason,
      actual_duration_minutes: (s as Record<string, unknown>).actual_duration_minutes as number | null ?? null,
      headcount: (s as Record<string, unknown>).headcount as number | null ?? null,
      coach_notes: (s as Record<string, unknown>).coach_notes as string | null ?? null,
      notes: (s as Record<string, unknown>).notes as string | null ?? null,
      needs_ops_review: (s as Record<string, unknown>).needs_ops_review as boolean ?? false,
      is_trial: (s as Record<string, unknown>).is_trial as boolean ?? false,
      started_at: s.started_at,
      completed_at: s.completed_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
      centre_name:
        (s.centres as unknown as { name: string } | null)?.name ?? "Unknown",
      centre_type:
        (s.centres as unknown as { type: CentreType } | null)?.type ??
        "childcare_centre",
      coach_name:
        (s.profiles as unknown as { name: string } | null)?.name ?? null,
      coach_phone:
        (s.profiles as unknown as { phone: string } | null)?.phone ?? null,
      term_name:
        (s.terms as unknown as { name: string } | null)?.name ?? "Unknown",
      program_title: ((): string | null => {
        const p = s.programs as unknown as { sport?: string; skill_focus?: string } | null;
        if (!p) return null;
        if (p.skill_focus && p.sport) return `${p.sport} · ${p.skill_focus}`;
        return p.skill_focus ?? p.sport ?? null;
      })(),
    }));

    return { data: sessions, error: null };
  } catch (err) {
    console.error("getSessionsForWeek error:", err);
    return { data: null, error: "Failed to load sessions." };
  }
}

// ============================================================
// 2. getSessionDetail
// ============================================================

export async function getSessionDetail(
  id: string
): Promise<{ data: SessionWithRelations | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: s, error } = await supabase
      .from("sessions")
      .select(
        "*, centres:centre_id(name, type), profiles:coach_id(name, phone), terms:term_id(name), programs:program_id(sport, skill_focus)"
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    const session: SessionWithRelations = {
      id: s.id,
      term_id: s.term_id,
      template_id: s.template_id,
      date: s.date,
      time: s.time,
      duration_minutes: s.duration_minutes,
      centre_id: s.centre_id,
      coach_id: s.coach_id,
      sport: s.sport,
      program_id: s.program_id,
      equipment_kit_id: s.equipment_kit_id,
      status: s.status as SessionStatus,
      pay_rate_override: s.pay_rate_override,
      pay_rate_resolved: s.pay_rate_resolved,
      cancellation_reason: s.cancellation_reason,
      actual_duration_minutes: (s as Record<string, unknown>).actual_duration_minutes as number | null ?? null,
      headcount: (s as Record<string, unknown>).headcount as number | null ?? null,
      coach_notes: (s as Record<string, unknown>).coach_notes as string | null ?? null,
      notes: (s as Record<string, unknown>).notes as string | null ?? null,
      needs_ops_review: (s as Record<string, unknown>).needs_ops_review as boolean ?? false,
      is_trial: (s as Record<string, unknown>).is_trial as boolean ?? false,
      started_at: s.started_at,
      completed_at: s.completed_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
      centre_name:
        (s.centres as unknown as { name: string } | null)?.name ?? "Unknown",
      centre_type:
        (s.centres as unknown as { type: CentreType } | null)?.type ??
        "childcare_centre",
      coach_name:
        (s.profiles as unknown as { name: string } | null)?.name ?? null,
      coach_phone:
        (s.profiles as unknown as { phone: string } | null)?.phone ?? null,
      term_name:
        (s.terms as unknown as { name: string } | null)?.name ?? "Unknown",
      program_title: ((): string | null => {
        const p = s.programs as unknown as { sport?: string; skill_focus?: string } | null;
        if (!p) return null;
        if (p.skill_focus && p.sport) return `${p.sport} · ${p.skill_focus}`;
        return p.skill_focus ?? p.sport ?? null;
      })(),
    };

    return { data: session, error: null };
  } catch (err) {
    console.error("getSessionDetail error:", err);
    return { data: null, error: "Failed to load session." };
  }
}

// ============================================================
// 3. createSession
// ============================================================

export async function createSession(
  data: CreateSessionData
): Promise<{ data: Session | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    if (data.coach_id) {
      const certCheck = await checkCoachCertsForSession(data.coach_id, data.date);
      if (!certCheck.ok) {
        return { data: null, error: certCheck.message };
      }
    }

    // Auth — needed for assigned_by on the session_coaches row.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Insert the session WITHOUT coach_id. The trigger will populate
    // it once we write the primary into session_coaches below.
    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        term_id: data.term_id,
        date: data.date,
        time: data.time,
        duration_minutes: data.duration_minutes,
        centre_id: data.centre_id,
        sport: data.sport,
        pay_rate_override: data.pay_rate_override ?? null,
        status: "draft" as SessionStatus,
      })
      .select()
      .single();

    if (error) throw error;

    // If a coach was provided, write a primary row through the helper.
    if (data.coach_id) {
      const { error: writeErr } = await setSessionCoaches({
        sessionId: session.id,
        coaches: [{ userId: data.coach_id, isPrimary: true }],
        assignedBy: user.id,
      });
      if (writeErr) {
        // Rollback: delete the session we just created so we don't leave
        // an unstaffed draft when the caller expected a staffed insert.
        await supabase.from("sessions").delete().eq("id", session.id);
        return { data: null, error: writeErr };
      }
      // Re-fetch so the returned row has the trigger-populated coach_id.
      const { data: refetched } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", session.id)
        .single();
      return { data: refetched ?? session, error: null };
    }

    return { data: session, error: null };
  } catch (err) {
    console.error("createSession error:", err);
    return { data: null, error: "Failed to create session." };
  }
}

// ============================================================
// 4. updateSession
// ============================================================

export async function updateSession(
  id: string,
  data: UpdateSessionData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Cert guard for coach assignment (unchanged behaviour).
    if (data.coach_id) {
      const { data: existing, error: fetchErr } = await supabase
        .from("sessions")
        .select("date")
        .eq("id", id)
        .single();
      if (fetchErr || !existing) return { error: "Session not found." };
      const sessionDate = (data.date as string | undefined) ?? existing.date;
      const certCheck = await checkCoachCertsForSession(data.coach_id, sessionDate);
      if (!certCheck.ok) return { error: certCheck.message };
    }

    // Separate coach_id from the rest of the patch — it now writes
    // through session_coaches; the trigger maintains the cache column.
    const coachKeyInPatch = Object.prototype.hasOwnProperty.call(data, "coach_id");
    const { coach_id: nextCoachId, ...patch } = data;

    // Apply the non-coach patch directly (status, date, time, etc.)
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("sessions").update(patch).eq("id", id);
      if (error) throw error;
    }

    // Apply the coach change, if any, through the helper.
    if (coachKeyInPatch) {
      const coaches =
        nextCoachId === null || nextCoachId === undefined
          ? []
          : [{ userId: nextCoachId, isPrimary: true }];
      const { error: writeErr } = await setSessionCoaches({
        sessionId: id,
        coaches,
        assignedBy: user.id,
      });
      if (writeErr) return { error: writeErr };
    }

    return { error: null };
  } catch (err) {
    console.error("updateSession error:", err);
    return { error: "Failed to update session." };
  }
}

// ============================================================
// 5. updateSessionStatus
// ============================================================

export async function updateSessionStatus(
  id: string,
  newStatus: SessionStatus,
  cancellationReason?: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch current status
    const { data: current, error: fetchError } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;
    if (!current) return { error: "Session not found." };

    const currentStatus = current.status as SessionStatus;
    if (!isValidTransition(currentStatus, newStatus)) {
      return {
        error: `Cannot transition from "${currentStatus}" to "${newStatus}".`,
      };
    }

    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === "in_progress") {
      updateData.started_at = new Date().toISOString();
    }
    if (newStatus === "completed") {
      updateData.completed_at = new Date().toISOString();
    }
    if (newStatus === "cancelled" && cancellationReason) {
      updateData.cancellation_reason = cancellationReason;
    }

    const { error } = await supabase
      .from("sessions")
      .update(updateData)
      .eq("id", id);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("updateSessionStatus error:", err);
    return { error: "Failed to update session status." };
  }
}

// ============================================================
// 6. bulkUpdateSessionStatus
// ============================================================

export async function bulkUpdateSessionStatus(
  ids: string[],
  newStatus: SessionStatus
): Promise<{ data: { updated: number; skipped: number } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Fetch current statuses
    const { data: sessions, error: fetchError } = await supabase
      .from("sessions")
      .select("id, status")
      .in("id", ids);

    if (fetchError) throw fetchError;

    const validIds = (sessions ?? [])
      .filter((s) => isValidTransition(s.status as SessionStatus, newStatus))
      .map((s) => s.id);

    const skipped = ids.length - validIds.length;

    if (validIds.length > 0) {
      const updateData: Record<string, unknown> = { status: newStatus };
      if (newStatus === "in_progress") {
        updateData.started_at = new Date().toISOString();
      }
      if (newStatus === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("sessions")
        .update(updateData)
        .in("id", validIds);

      if (error) throw error;
    }

    return { data: { updated: validIds.length, skipped }, error: null };
  } catch (err) {
    console.error("bulkUpdateSessionStatus error:", err);
    return { data: null, error: "Failed to bulk update sessions." };
  }
}

// ============================================================
// 7. bulkReassignCoach
// ============================================================

export async function bulkReassignCoach(
  ids: string[],
  coachId: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Cert guard (unchanged) — fan out across all target session dates.
    if (coachId && ids.length > 0) {
      const { data: targetSessions, error: fetchErr } = await supabase
        .from("sessions")
        .select("date")
        .in("id", ids);
      if (fetchErr) throw fetchErr;
      const dates = Array.from(
        new Set((targetSessions ?? []).map((s) => s.date as string)),
      );
      const certCheck = await checkCoachCertsForSessionDates(coachId, dates);
      if (!certCheck.ok) return { error: certCheck.message };
    }

    // Route through setSessionCoaches per session. coachId=null clears.
    const coaches =
      coachId === null ? [] : [{ userId: coachId, isPrimary: true }];
    for (const id of ids) {
      const { error } = await setSessionCoaches({
        sessionId: id,
        coaches,
        assignedBy: user.id,
      });
      if (error) return { error };
    }

    return { error: null };
  } catch (err) {
    console.error("bulkReassignCoach error:", err);
    return { error: "Failed to reassign coach." };
  }
}

// ============================================================
// 7b. assignCoaches — multi-coach UI write path
// ============================================================

/**
 * Server action: assign N coaches to a session, with one designated
 * primary. Admin/ops only. Runs the cert guard for every coach against
 * the session's date — any single failure refuses the whole write
 * (no partial assignments). Backed by `setSessionCoaches` (the single
 * write path to `session_coaches`).
 *
 * Empty coachIds is allowed: clears the shift and lets the sync
 * trigger flip the status (edge case 4 in spec §9).
 *
 * @see docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5
 */
export async function assignCoaches(
  sessionId: string,
  coachIds: SessionCoachInput[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Auth — only admin / ops can write the coach roster.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Only admin or ops can assign coaches." };
    }

    // Cert guard — fan out across every (coach, session) pair.
    const { data: session } = await supabase
      .from("sessions")
      .select("date")
      .eq("id", sessionId)
      .single();
    if (!session) return { error: "Session not found." };

    const pairs = coachIds.map((c) => ({
      coachId: c.userId,
      sessionId,
      sessionDate: session.date as string,
    }));
    const certResult = await bulkCheckCoachCertsForSessions(pairs);
    if (certResult.blocked.length > 0) {
      // Resolve coach names so the error message is human-readable
      // for ops — UUIDs only get used as a fallback when a profile
      // lookup turns up nothing (e.g. archived coach hard-deleted).
      const blockedIds = certResult.blocked.map((b) => b.coachId);
      const { data: blockedProfiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", blockedIds);
      const nameById = new Map(
        (blockedProfiles ?? []).map((p) => [
          p.id as string,
          (p.name as string | null) ?? null,
        ])
      );
      const summary = certResult.blocked
        .map((b) => `${nameById.get(b.coachId) ?? b.coachId}: ${b.result.message}`)
        .join("; ");
      return { error: `Cert guard refused assignment — ${summary}` };
    }

    // Snapshot existing roster for diff (activity log).
    const { data: existing } = await supabase
      .from("session_coaches")
      .select("user_id, is_primary")
      .eq("session_id", sessionId);

    // Atomic write.
    const writeResult = await setSessionCoaches({
      sessionId,
      coaches: coachIds,
      assignedBy: user.id,
    });
    if (writeResult.error) return { error: writeResult.error };

    // Activity log — one row per added/removed/changed coach.
    const existingByUser = new Map(
      (existing ?? []).map((r) => [r.user_id as string, r.is_primary as boolean])
    );
    const newByUser = new Map(coachIds.map((c) => [c.userId, c.isPrimary]));

    const logRows: Array<Record<string, unknown>> = [];
    for (const c of coachIds) {
      const wasAssigned = existingByUser.has(c.userId);
      const wasPrimary = existingByUser.get(c.userId) ?? false;
      if (!wasAssigned) {
        logRows.push({
          user_id: user.id,
          action: "staff_assigned_to_session",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: c.userId, is_primary: c.isPrimary },
        });
      } else if (wasPrimary !== c.isPrimary) {
        logRows.push({
          user_id: user.id,
          action: "session_primary_changed",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: c.userId, is_primary_now: c.isPrimary },
        });
      }
    }
    for (const [userId] of existingByUser) {
      if (!newByUser.has(userId)) {
        logRows.push({
          user_id: user.id,
          action: "staff_removed_from_session",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: userId },
        });
      }
    }
    if (logRows.length > 0) {
      await supabase.from("activity_log").insert(logRows);
    }

    return { error: null };
  } catch (err) {
    console.error("assignCoaches error:", err);
    return { error: "Failed to assign coaches." };
  }
}

// ============================================================
// 8. deleteSession — only draft
// ============================================================

export async function deleteSession(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: session } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", id)
      .single();

    if (session?.status !== "draft") {
      return { error: "Only draft sessions can be deleted." };
    }

    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("deleteSession error:", err);
    return { error: "Failed to delete session." };
  }
}

// ============================================================
// 10. duplicateSession — admin/ops only; creates a new draft
// ============================================================

/**
 * Copies a session into a new draft row with `coach_id = null` and
 * resets the started_at / completed_at / cancellation_reason fields.
 * Returns the new id so the caller can open it for editing.
 *
 * Useful for "same shift Tuesday too" — admin clicks Duplicate,
 * then changes the date in the resulting edit dialog.
 */
export async function duplicateSession(
  id: string
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { data: null, error: "Only admin or ops can duplicate sessions." };
    }

    const { data: original, error: fetchErr } = await supabase
      .from("sessions")
      .select(
        "term_id, date, time, duration_minutes, centre_id, sport, program_id, pay_rate_override, notes"
      )
      .eq("id", id)
      .single();
    if (fetchErr || !original) {
      return { data: null, error: "Session not found." };
    }

    const { data: copy, error: insertErr } = await supabase
      .from("sessions")
      .insert({
        term_id: original.term_id,
        date: original.date,
        time: original.time,
        duration_minutes: original.duration_minutes,
        centre_id: original.centre_id,
        sport: original.sport,
        program_id: original.program_id,
        pay_rate_override: original.pay_rate_override,
        notes: original.notes,
        coach_id: null,
        status: "draft" as SessionStatus,
      })
      .select("id")
      .single();

    if (insertErr || !copy) {
      return { data: null, error: insertErr?.message ?? "Failed to duplicate." };
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_duplicated",
      entity_type: "session",
      entity_id: copy.id,
      metadata: { source_session_id: id },
    });

    return { data: { id: copy.id }, error: null };
  } catch (err) {
    console.error("duplicateSession error:", err);
    return { data: null, error: "Failed to duplicate session." };
  }
}

// ============================================================
// 11. updateSessionNotes — admin/ops or the assigned coach
// ============================================================

/**
 * Write-through edit for the per-session note text. Permission:
 * admin/ops, OR the coach currently assigned to the session
 * (via sessions.coach_id — which is also the denormalised primary
 * coach cache post-P5).
 */
export async function updateSessionNotes(
  id: string,
  notes: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const [profileRes, sessionRes] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase.from("sessions").select("coach_id").eq("id", id).single(),
    ]);

    if (sessionRes.error || !sessionRes.data) {
      return { error: "Session not found." };
    }

    const role = profileRes.data?.role;
    const isAdminOrOps = role === "admin" || role === "ops";
    const isAssignedCoach = sessionRes.data.coach_id === user.id;

    if (!isAdminOrOps && !isAssignedCoach) {
      return { error: "You don't have permission to edit notes for this session." };
    }

    // Empty string allowed — wipes the note. Null treated the same.
    const trimmed = notes.trim();
    if (trimmed.length > 2000) {
      return { error: "Note is too long (max 2000 characters)." };
    }

    const { error } = await supabase
      .from("sessions")
      .update({ notes: trimmed === "" ? null : trimmed })
      .eq("id", id);

    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_notes_updated",
      entity_type: "session",
      entity_id: id,
      metadata: { note_length: trimmed.length },
    });

    return { error: null };
  } catch (err) {
    console.error("updateSessionNotes error:", err);
    return { error: "Failed to update notes." };
  }
}

// ============================================================
// 9. suggestCoachesForSession
// ============================================================

export async function suggestCoachesForSession(
  sessionId: string
): Promise<{
  data: Pick<Profile, "id" | "name">[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    // Get session details
    const { data: session, error: sessError } = await supabase
      .from("sessions")
      .select("date, time, duration_minutes")
      .eq("id", sessionId)
      .single();

    if (sessError) throw sessError;
    if (!session) return { data: null, error: "Session not found." };

    // Calculate day of week (1=Mon...5=Fri)
    const d = new Date(session.date + "T00:00:00");
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay; // Convert Sun=0 to 7

    // Get all active coaches
    const { data: coaches, error: coachError } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name");

    if (coachError) throw coachError;
    if (!coaches || coaches.length === 0) return { data: [], error: null };

    // Get availability slots for this day
    const { data: slots } = await supabase
      .from("availability_slots")
      .select("user_id, start_time, end_time")
      .eq("day_of_week", dayOfWeek);

    // Get existing sessions for these coaches on this date (to check clashes)
    const coachIds = coaches.map((c) => c.id);
    const { data: existingSessions } = await supabase
      .from("sessions")
      .select("coach_id, time, duration_minutes")
      .eq("date", session.date)
      .in("coach_id", coachIds)
      .not("status", "eq", "cancelled");

    // Build clash set
    const clashCoaches = new Set<string>();
    const sessTime = session.time.slice(0, 5);
    const sessEnd = addMinutes(sessTime, session.duration_minutes);

    for (const es of existingSessions ?? []) {
      if (!es.coach_id) continue;
      const esTime = es.time.slice(0, 5);
      const esEnd = addMinutes(esTime, es.duration_minutes);
      // Check overlap
      if (sessTime < esEnd && sessEnd > esTime) {
        clashCoaches.add(es.coach_id);
      }
    }

    // Build availability set
    const availableCoaches = new Set<string>();
    for (const slot of slots ?? []) {
      const slotStart = slot.start_time.slice(0, 5);
      const slotEnd = slot.end_time.slice(0, 5);
      if (sessTime >= slotStart && sessEnd <= slotEnd) {
        availableCoaches.add(slot.user_id);
      }
    }

    // Score and sort: available + no clash first, then just no clash
    const scored = coaches
      .filter((c) => !clashCoaches.has(c.id))
      .sort((a, b) => {
        const aAvail = availableCoaches.has(a.id) ? 0 : 1;
        const bAvail = availableCoaches.has(b.id) ? 0 : 1;
        return aAvail - bAvail || a.name.localeCompare(b.name);
      });

    return { data: scored, error: null };
  } catch (err) {
    console.error("suggestCoachesForSession error:", err);
    return { data: null, error: "Failed to suggest coaches." };
  }
}

// ============================================================
// Helpers
// ============================================================

/** Add minutes to "HH:mm" time, returns "HH:mm" */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMin = h * 60 + m + minutes;
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
}
