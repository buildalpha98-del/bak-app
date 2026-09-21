import { calculateSessionPay, resolvePayRate, type CoachProfile, type PayRateRecord } from "@/lib/utils/payRates";
import type { CentreType, RateUnit } from "@/lib/types/enums";

// ============================================================
// What ONE coach is paid for ONE shift — the single pricing rule
// ============================================================
//
// A shift stores one resolved rate: `sessions.pay_rate_resolved`, the
// LEAD's (the 008 trigger resolves it from `sessions.coach_id`, and a
// manual `pay_rate_override` is an override of the lead's pay). A second
// coach on a shared shift is paid THEIR OWN rate — their session-type
// rate effective on the day, else their default — and the override never
// applies to them. (Roster redesign spec §10 Decision E.)
//
// Four places price a shift and they must agree to the cent: the weekly
// payroll batch (what ops actually pay), the coach's earnings card, the
// coach's self-generated invoice, and the roster cost projection. The
// first three call this; the projection prices whole crews in
// lib/roster/cost-actions.ts with the same two tiers.
//
// The lead's arithmetic is the long-standing one, kept exactly: take the
// trigger-resolved rate, read the UNIT from the coach's rate table, and
// multiply out per-hour rates. Changing it would move existing pay.

export interface ShiftPayInput {
  isLead: boolean;
  coachId: string;
  date: string;
  /** Actual duration when recorded, else rostered. */
  durationMinutes: number;
  centreType: CentreType;
  payRateOverride: number | null;
  payRateResolved: number | null;
}

export interface ShiftPay {
  /** null = no rate could be found — a visible $0 line for ops to fix. */
  rate: number | null;
  rate_unit: RateUnit;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceShiftForCoach(
  input: ShiftPayInput,
  coachRates: PayRateRecord[],
  profile: CoachProfile | null
): ShiftPay {
  if (input.isLead) {
    const resolved = input.payRateResolved ?? profile?.default_pay_rate ?? 0;
    let unit: RateUnit = "per_session";
    if (!input.payRateOverride) {
      const match = coachRates.find((r) => r.effective_from <= input.date);
      if (match) unit = match.rate_unit;
    }
    const amount = resolved > 0 && unit === "per_hour" ? round2(resolved * (input.durationMinutes / 60)) : resolved;
    return { rate: resolved > 0 ? resolved : null, rate_unit: unit, amount };
  }

  const resolved = resolvePayRate(
    {
      pay_rate_override: null, // the shift's override is the lead's
      coach_id: input.coachId,
      duration_minutes: input.durationMinutes,
      centre_type: input.centreType,
    },
    coachRates,
    profile,
    input.date
  );
  if (!resolved) return { rate: null, rate_unit: "per_session", amount: 0 };
  const pay = calculateSessionPay(resolved, input.durationMinutes);
  return { rate: pay.rate, rate_unit: pay.rate_unit, amount: pay.amount };
}
