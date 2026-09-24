"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CREW_EMBED, crewOf } from "@/lib/sessions/coach-membership";
import type {
  SchedulingCoach,
  SchedulingInput,
  SchedulingSession,
  SchedulingCentre,
  SchedulingPreferenceInput,
  SessionHistory,
} from "./types";

/**
 * Assemble all data needed for scheduling a week.
 */
export async function assembleSchedulingInput(
  weekStart: string,
  weekEnd: string
): Promise<SchedulingInput> {
  const supabase = await createSupabaseServerClient();

  // 1. Sessions for the week needing assignment
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id")
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .in("status", ["draft", "published"])
    .order("date")
    .order("time");

  // 2. Active coaches with availability, compliance, pay rates.
  // compliance_docs points at profiles twice (the coach and the
  // verifier), so the embed must name the foreign key — without it
  // PostgREST refuses the whole query, `coaches` is null, and the solver
  // reports "No coaches available" for every session. That is what
  // happened on every AI run until Sept 2026.
  const { data: coaches, error: coachErr } = await supabase
    .from("profiles")
    .select(`
      id, name, phone, default_pay_rate, status,
      availability_slots(day_of_week, start_time, end_time, location_preferences),
      compliance_docs!compliance_docs_user_id_fkey(doc_type, status, expiry_date),
      pay_rates(session_type, rate, rate_unit)
    `)
    .eq("role", "coach")
    .eq("status", "active");
  if (coachErr) throw new Error(`Could not load coaches for scheduling: ${coachErr.message}`);

  // 3. Centres with coordinates
  const { data: centreRows } = await supabase
    .from("centres")
    .select("id, name, latitude, longitude, address")
    .eq("contract_status", "active");

  const centres = new Map<string, SchedulingCentre>();
  (centreRows || []).forEach((c) => centres.set(c.id, c));

  // 4. Scheduling preferences
  const { data: prefRows } = await supabase
    .from("scheduling_preferences")
    .select("coach_id, centre_id, preference_type");

  const preferences: SchedulingPreferenceInput[] = (prefRows || []).map((p) => ({
    coach_id: p.coach_id,
    centre_id: p.centre_id,
    preference_type: p.preference_type as "preferred" | "avoid",
  }));

  // 5. Last 4 weeks session history for familiarity
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const { data: historyRows } = await supabase
    .from("sessions")
    .select(`coach_id, centre_id, ${CREW_EMBED}`)
    .gte("date", fourWeeksAgo.toISOString().split("T")[0])
    .lt("date", weekStart)
    .in("status", ["completed", "confirmed", "in_progress"]);

  // Aggregate history — familiarity is earned by everyone on the shift.
  const historyMap = new Map<string, number>();
  (historyRows || []).forEach((h) => {
    for (const { userId } of crewOf(h)) {
      const key = `${userId}:${h.centre_id}`;
      historyMap.set(key, (historyMap.get(key) || 0) + 1);
    }
  });
  const history: SessionHistory[] = Array.from(historyMap.entries()).map(([key, count]) => {
    const [coach_id, centre_id] = key.split(":");
    return { coach_id, centre_id, session_count: count };
  });

  // 6. Current week existing assignments (confirmed/in_progress)
  const { data: existingAssignments } = await supabase
    .from("sessions")
    .select(`id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id, ${CREW_EMBED}`)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .in("status", ["confirmed", "pending_confirmation", "in_progress"]);

  // A coach's existing commitments include shifts they work as second —
  // the solver must not book them over the top of one.
  const currentAssignments = new Map<string, SchedulingSession[]>();
  (existingAssignments || []).forEach((s) => {
    for (const { userId } of crewOf(s)) {
      const list = currentAssignments.get(userId) || [];
      list.push({ ...(s as unknown as SchedulingSession), coach_id: userId });
      currentAssignments.set(userId, list);
    }
  });

  return {
    sessions: (sessions || []) as SchedulingSession[],
    coaches: (coaches || []) as unknown as SchedulingCoach[],
    centres,
    preferences,
    history,
    currentAssignments,
  };
}
