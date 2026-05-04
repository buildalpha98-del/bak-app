/**
 * Weekly roster cost projection.
 *
 * Pure aggregator: caller pre-prices each session (using the existing
 * `resolvePayRate` + `calculateSessionPay` helpers in `lib/utils/payRates.ts`),
 * then this helper rolls them up for the chip above the weekly grid.
 *
 * Mid-week pay-rate proration falls out for free: the existing
 * `pay_rate_resolved` trigger and `resolvePayRate` both pick the rate
 * effective on the session's `date`, so a coach whose rate changes
 * mid-week will have early-week sessions priced at the old rate and
 * later-week sessions at the new rate.
 *
 * Adapted from amana-eos-dashboard's `roster-cost.ts` (PR #55).
 */

export interface PricedSession {
  sessionId: string;
  coachId: string | null;
  coachName: string | null;
  durationMinutes: number;
  /** null when the session is unassigned OR when the coach has no rate. */
  amount: number | null;
}

export interface CoachCostRow {
  coachId: string;
  coachName: string;
  sessions: number;
  hours: number;
  cost: number;
}

export interface CostProjection {
  totalCost: number;
  totalHours: number;
  pricedSessions: number;
  unpricedSessions: number;
  unassignedSessions: number;
  byCoach: CoachCostRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function projectWeekCost(sessions: PricedSession[]): CostProjection {
  let totalCost = 0;
  let totalHours = 0;
  let pricedSessions = 0;
  let unpricedSessions = 0;
  let unassignedSessions = 0;

  const byCoachMap = new Map<string, CoachCostRow>();

  for (const sess of sessions) {
    if (!sess.coachId) {
      unassignedSessions += 1;
      continue;
    }

    const hours = sess.durationMinutes / 60;
    totalHours += hours;

    const row = byCoachMap.get(sess.coachId) ?? {
      coachId: sess.coachId,
      coachName: sess.coachName ?? "(unknown)",
      sessions: 0,
      hours: 0,
      cost: 0,
    };
    row.sessions += 1;
    row.hours += hours;

    if (sess.amount == null) {
      unpricedSessions += 1;
    } else {
      pricedSessions += 1;
      totalCost += sess.amount;
      row.cost += sess.amount;
    }

    byCoachMap.set(sess.coachId, row);
  }

  const byCoach = Array.from(byCoachMap.values())
    .map((row) => ({
      ...row,
      hours: round2(row.hours),
      cost: round2(row.cost),
    }))
    .sort((a, b) => b.cost - a.cost);

  return {
    totalCost: round2(totalCost),
    totalHours: round2(totalHours),
    pricedSessions,
    unpricedSessions,
    unassignedSessions,
    byCoach,
  };
}
