"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionStatus, CentreType } from "@/lib/types/enums";
import type { Session, Profile } from "@/lib/types/database";
import {
  checkCoachCertsForSession,
  checkCoachCertsForSessionDates,
} from "@/lib/utils/compliance/check-coach-certs";

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

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        term_id: data.term_id,
        date: data.date,
        time: data.time,
        duration_minutes: data.duration_minutes,
        centre_id: data.centre_id,
        sport: data.sport,
        coach_id: data.coach_id ?? null,
        pay_rate_override: data.pay_rate_override ?? null,
        status: "draft" as SessionStatus,
      })
      .select()
      .single();

    if (error) throw error;
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

    const { error } = await supabase
      .from("sessions")
      .update(data)
      .eq("id", id);

    if (error) throw error;
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

    const { error } = await supabase
      .from("sessions")
      .update({ coach_id: coachId })
      .in("id", ids);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("bulkReassignCoach error:", err);
    return { error: "Failed to reassign coach." };
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
