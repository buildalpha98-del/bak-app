"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEligibleCoaches, scoreCoachForSession } from "./solver";
import type { ScoringContext, SchedulingSession } from "./types";
import { assembleSchedulingInput } from "./data-assembly";
import type { RerosteringSuggestion } from "@/lib/types/database";

/**
 * Suggest ranked replacement coaches for a single session.
 * Reuses the scheduler's eligibility + scoring logic.
 */
export async function suggestReplacements(
  sessionId: string
): Promise<RerosteringSuggestion[]> {
  const supabase = await createSupabaseServerClient();

  // Fetch the session
  const { data: session } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id")
    .eq("id", sessionId)
    .single();

  if (!session) return [];

  // Get the week boundaries for this session
  const sessionDate = new Date(session.date);
  const dayOfWeek = sessionDate.getDay();
  const monday = new Date(sessionDate);
  monday.setDate(sessionDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const weekStart = monday.toISOString().split("T")[0];
  const weekEnd = friday.toISOString().split("T")[0];

  // Assemble full scheduling context
  const input = await assembleSchedulingInput(weekStart, weekEnd);

  const context: ScoringContext = {
    input,
    runningAssignments: new Map(input.currentAssignments),
  };

  // Exclude original coach from eligibility
  const availableCoaches = input.coaches.filter(
    (c) => c.id !== session.coach_id
  );

  const eligible = getEligibleCoaches(
    session as SchedulingSession,
    availableCoaches,
    context
  );

  // Score and rank
  const scored = eligible.map((coach) => {
    const { score, reasoning } = scoreCoachForSession(
      coach,
      session as SchedulingSession,
      context
    );

    // Determine availability confidence
    const dayNum = sessionDate.getDay() === 0 ? 7 : sessionDate.getDay();
    const availabilityStatus: "confirmed" | "potentially_available" =
      coach.availability_slots.some((slot) => slot.day_of_week === dayNum)
        ? "confirmed"
        : "potentially_available";

    // Find last time at this centre
    const historyEntry = input.history.find(
      (h) => h.coach_id === coach.id && h.centre_id === session.centre_id
    );

    // Current week hours
    const coachAssignments = input.currentAssignments.get(coach.id) || [];
    const weekHours = coachAssignments.reduce(
      (sum, s) => sum + s.duration_minutes / 60, 0
    );

    // Build score breakdown
    const pref = input.preferences.find(
      (p) => p.coach_id === coach.id && p.centre_id === session.centre_id
    );
    const mandatoryTypes = ["wwcc", "first_aid"];
    const hasExpired = coach.compliance_docs.some((doc) =>
      mandatoryTypes.includes(doc.doc_type) &&
      (doc.status === "expired" || (doc.expiry_date && new Date(doc.expiry_date) < new Date()))
    );

    return {
      coach_id: coach.id,
      coach_name: coach.name,
      coach_phone: coach.phone,
      availability_status: availabilityStatus,
      score,
      score_breakdown: {
        familiarity: historyEntry ? 3 : 0,
        utilisation: weekHours < 10 ? 2 : weekHours > 15 ? -1 : 0,
        location: reasoning.includes("Centre in preferred location") ? 1 : 0,
        preference: pref ? (pref.preference_type === "preferred" ? 5 : -10) : 0,
        compliance: hasExpired ? -3 : 0,
      },
      last_at_centre: historyEntry ? "Within last 4 weeks" : null,
      current_week_hours: weekHours,
    } satisfies RerosteringSuggestion;
  });

  // Sort by score descending, return top 5
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}
