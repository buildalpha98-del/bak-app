/**
 * Smart Scheduling Constraint Solver
 * Pure algorithm functions — no server dependencies.
 */

import type {
  SchedulingCoach,
  SchedulingSession,
  SchedulingInput,
  ScoringContext,
  AssignmentResult,
} from "./types";
import {
  timeToMinutes,
  sessionEndMinutes,
  hasAdequateTravelBuffer,
} from "./travel";

/**
 * Get coaches eligible for a session (pass ALL hard constraints).
 */
export function getEligibleCoaches(
  session: SchedulingSession,
  coaches: SchedulingCoach[],
  context: ScoringContext
): SchedulingCoach[] {
  const sessionDay = new Date(session.date).getDay(); // 0=Sun, 1=Mon...
  const dayOfWeek = sessionDay === 0 ? 7 : sessionDay;
  const sessionStart = timeToMinutes(session.time);
  const sessionEnd = sessionEndMinutes(session.time, session.duration_minutes);
  const centre = context.input.centres.get(session.centre_id);

  return coaches.filter((coach) => {
    // Hard 1: availability slot covers this day + time
    const hasSlot = coach.availability_slots.some((slot) => {
      if (slot.day_of_week !== dayOfWeek) return false;
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      return sessionStart >= slotStart && sessionEnd <= slotEnd;
    });
    if (!hasSlot) return false;

    // Get all assignments for this coach on this day (existing + running)
    const existingToday = [
      ...(context.input.currentAssignments.get(coach.id) || []),
      ...(context.runningAssignments.get(coach.id) || []),
    ].filter((s) => s.date === session.date && s.id !== session.id);

    // Hard 2: no overlapping sessions
    const hasOverlap = existingToday.some((other) => {
      const otherStart = timeToMinutes(other.time);
      const otherEnd = sessionEndMinutes(other.time, other.duration_minutes);
      return sessionStart < otherEnd && sessionEnd > otherStart;
    });
    if (hasOverlap) return false;

    // Hard 3: adequate travel buffer (>= 30 min accounting for travel)
    if (centre) {
      const hasTravelConflict = existingToday.some((other) => {
        const otherCentre = context.input.centres.get(other.centre_id);
        if (!otherCentre) return false;
        if (other.centre_id === session.centre_id) return false;

        const otherStart = timeToMinutes(other.time);
        const otherEnd = sessionEndMinutes(other.time, other.duration_minutes);

        if (sessionEnd <= otherStart) {
          return !hasAdequateTravelBuffer(sessionEnd, otherStart, centre, otherCentre);
        }
        if (otherEnd <= sessionStart) {
          return !hasAdequateTravelBuffer(otherEnd, sessionStart, otherCentre, centre);
        }
        return true;
      });
      if (hasTravelConflict) return false;
    }

    return true;
  });
}

/**
 * Score a coach for a specific session. Higher is better.
 */
export function scoreCoachForSession(
  coach: SchedulingCoach,
  session: SchedulingSession,
  context: ScoringContext
): { score: number; reasoning: string[] } {
  let score = 0;
  const reasoning: string[] = [];

  // 1. Centre familiarity (+3 recent, +1 ever)
  const recentHistory = context.input.history.find(
    (h) => h.coach_id === coach.id && h.centre_id === session.centre_id
  );
  if (recentHistory && recentHistory.session_count > 0) {
    score += 3;
    reasoning.push(`Regular coach (${recentHistory.session_count} sessions in last 4 weeks)`);
  }

  // 2. Utilisation balance
  const coachSessions = [
    ...(context.input.currentAssignments.get(coach.id) || []),
    ...(context.runningAssignments.get(coach.id) || []),
  ];
  const coachHours = coachSessions.reduce((sum, s) => sum + s.duration_minutes / 60, 0);

  const allCoachHours: number[] = [];
  for (const c of context.input.coaches) {
    const sessions = [
      ...(context.input.currentAssignments.get(c.id) || []),
      ...(context.runningAssignments.get(c.id) || []),
    ];
    allCoachHours.push(sessions.reduce((sum, s) => sum + s.duration_minutes / 60, 0));
  }
  const avgHours = allCoachHours.length > 0
    ? allCoachHours.reduce((a, b) => a + b, 0) / allCoachHours.length
    : 0;

  if (coachHours < avgHours) {
    score += 2;
    reasoning.push("Below average hours — balances utilisation");
  } else if (coachHours > avgHours + 2) {
    score -= 1;
    reasoning.push("Above average hours this week");
  }

  // 3. Location preference (+1)
  const centre = context.input.centres.get(session.centre_id);
  if (centre?.address) {
    const matchesLocation = coach.availability_slots.some((slot) =>
      slot.location_preferences.some((pref) =>
        centre.address!.toLowerCase().includes(pref.toLowerCase())
      )
    );
    if (matchesLocation) {
      score += 1;
      reasoning.push("Centre in preferred location");
    }
  }

  // 4. Scheduling preferences (+5 preferred, -10 avoid)
  const pref = context.input.preferences.find(
    (p) => p.coach_id === coach.id && p.centre_id === session.centre_id
  );
  if (pref) {
    if (pref.preference_type === "preferred") {
      score += 5;
      reasoning.push("Preferred coach for this centre");
    } else {
      score -= 10;
      reasoning.push("Marked as avoid for this centre");
    }
  }

  // 5. Compliance penalty (-3 for expired mandatory docs)
  const mandatoryTypes = ["wwcc", "first_aid"];
  const hasExpired = coach.compliance_docs.some((doc) => {
    if (!mandatoryTypes.includes(doc.doc_type)) return false;
    if (doc.status === "expired") return true;
    if (doc.expiry_date && new Date(doc.expiry_date) < new Date()) return true;
    return false;
  });
  if (hasExpired) {
    score -= 3;
    reasoning.push("Expired mandatory compliance documents");
  }

  return { score, reasoning };
}

/**
 * Generate a full roster: greedy assignment with single-level backtracking.
 */
export function generateRoster(input: SchedulingInput): AssignmentResult[] {
  const context: ScoringContext = {
    input,
    runningAssignments: new Map(),
  };

  // Sort sessions by difficulty (fewest eligible coaches first)
  const sessionDifficulty = input.sessions.map((session) => ({
    session,
    eligibleCount: getEligibleCoaches(session, input.coaches, context).length,
  }));
  sessionDifficulty.sort((a, b) => a.eligibleCount - b.eligibleCount);

  const results: AssignmentResult[] = [];
  const assignmentMap = new Map<string, string>(); // sessionId -> coachId

  for (const { session } of sessionDifficulty) {
    const eligible = getEligibleCoaches(session, input.coaches, context);

    const scored = eligible
      .map((coach) => {
        const { score, reasoning } = scoreCoachForSession(coach, session, context);
        return { coach, score, reasoning };
      })
      .sort((a, b) => b.score - a.score);

    let assigned = false;

    for (const candidate of scored) {
      // Try assigning this coach
      const coachSessions = context.runningAssignments.get(candidate.coach.id) || [];
      coachSessions.push(session);
      context.runningAssignments.set(candidate.coach.id, coachSessions);

      // Check if this assignment causes downstream issues (simple backtracking)
      const unassignedSessions = sessionDifficulty
        .filter(({ session: s }) => s.id !== session.id && !assignmentMap.has(s.id))
        .map(({ session: s }) => s);

      const causesConflict = unassignedSessions.some((futureSession) => {
        const futureEligible = getEligibleCoaches(futureSession, input.coaches, context);
        return futureEligible.length === 0;
      });

      if (causesConflict && scored.indexOf(candidate) < scored.length - 1) {
        // Backtrack: remove this assignment and try next
        const updated = coachSessions.filter((s) => s.id !== session.id);
        context.runningAssignments.set(candidate.coach.id, updated);
        continue;
      }

      // Accept this assignment
      assignmentMap.set(session.id, candidate.coach.id);
      const eligibleCount = eligible.length;
      const confidence: "green" | "amber" | "red" =
        candidate.score >= 5 && eligibleCount >= 3
          ? "green"
          : candidate.score >= 0 || eligibleCount >= 1
          ? "amber"
          : "red";

      results.push({
        sessionId: session.id,
        assignedCoachId: candidate.coach.id,
        score: candidate.score,
        confidence,
        reasoning: candidate.reasoning,
        eligibleCoaches: scored.map((s) => ({
          coachId: s.coach.id,
          score: s.score,
          name: s.coach.name,
        })),
      });
      assigned = true;
      break;
    }

    if (!assigned) {
      const reason = eligible.length === 0
        ? "No coaches available at this time"
        : "All eligible coaches already assigned";

      results.push({
        sessionId: session.id,
        assignedCoachId: null,
        score: -1,
        confidence: "red",
        reasoning: [reason],
        eligibleCoaches: [],
      });
    }
  }

  return results;
}
