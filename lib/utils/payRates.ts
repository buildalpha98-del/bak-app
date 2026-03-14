// ============================================================
// Pay Rate Resolution — Three-tier hierarchy
// ============================================================
//
// Tier 1: session.pay_rate_override (admin/ops manual override)
// Tier 2: pay_rates table (coach + session type rate)
// Tier 3: profiles.default_pay_rate (coach base rate)
// Fallback: null (flag for ops attention)

import type { RateUnit, SessionType, CentreType } from "@/lib/types/enums";

// ============================================================
// Types
// ============================================================

export interface RateResolutionInput {
  pay_rate_override: number | null;
  coach_id: string | null;
  duration_minutes: number;
  centre_type: CentreType;
}

export interface PayRateRecord {
  session_type: string;
  rate: number;
  rate_unit: RateUnit;
  effective_from: string;
}

export interface CoachProfile {
  default_pay_rate: number | null;
}

export type RateTier = "override" | "session_type" | "default" | null;

export interface ResolvedRate {
  rate: number;
  rate_unit: RateUnit;
  tier: RateTier;
  tierLabel: string;
}

export interface CalculatedPay {
  rate: number;
  rate_unit: RateUnit;
  duration_minutes: number;
  amount: number;
  tier: RateTier;
  tierLabel: string;
}

// ============================================================
// Centre type → Session type mapping
// ============================================================

export function centreTypeToSessionType(centreType: CentreType): SessionType {
  switch (centreType) {
    case "childcare_centre":
      return "childcare";
    case "school":
      return "school_local";
    default:
      return "childcare";
  }
}

// ============================================================
// Tier label for UI display
// ============================================================

const TIER_LABELS: Record<string, string> = {
  override: "Manual override",
  session_type: "Session-type rate",
  default: "Coach default rate",
};

function tierLabel(tier: RateTier): string {
  return tier ? TIER_LABELS[tier] ?? "Unknown" : "Not set";
}

// ============================================================
// resolvePayRate — Pure function, no DB calls
// ============================================================
// Takes pre-fetched data and returns the resolved rate.
// The caller is responsible for fetching pay_rates and profile.

export function resolvePayRate(
  session: RateResolutionInput,
  coachPayRates: PayRateRecord[],
  coachProfile: CoachProfile | null,
  sessionDate?: string
): ResolvedRate | null {
  // Tier 1: Session-level override
  if (session.pay_rate_override != null && session.pay_rate_override > 0) {
    return {
      rate: session.pay_rate_override,
      rate_unit: "per_session",
      tier: "override",
      tierLabel: tierLabel("override"),
    };
  }

  // Tier 2: Session-type rate from pay_rates table
  if (session.coach_id && coachPayRates.length > 0) {
    const sessionType = centreTypeToSessionType(session.centre_type);
    const matchingRates = coachPayRates
      .filter((r) => r.session_type === sessionType)
      .sort(
        (a, b) =>
          new Date(b.effective_from).getTime() -
          new Date(a.effective_from).getTime()
      );

    // Find the most recent rate that's effective on or before the session date
    const referenceDate = sessionDate ?? new Date().toISOString().split("T")[0];
    const effectiveRate = matchingRates.find(
      (r) => r.effective_from <= referenceDate
    );

    // If no date-filtered match, use the most recent rate overall
    const rate = effectiveRate ?? matchingRates[0];

    if (rate) {
      return {
        rate: rate.rate,
        rate_unit: rate.rate_unit,
        tier: "session_type",
        tierLabel: tierLabel("session_type"),
      };
    }
  }

  // Tier 3: Coach default rate
  if (
    coachProfile?.default_pay_rate != null &&
    coachProfile.default_pay_rate > 0
  ) {
    return {
      rate: coachProfile.default_pay_rate,
      rate_unit: "per_session",
      tier: "default",
      tierLabel: tierLabel("default"),
    };
  }

  // Fallback: no rate found
  return null;
}

// ============================================================
// calculateSessionPay — Pure function
// ============================================================

export function calculateSessionPay(
  resolvedRate: ResolvedRate,
  durationMinutes: number
): CalculatedPay {
  let amount: number;

  if (resolvedRate.rate_unit === "per_session") {
    amount = resolvedRate.rate;
  } else {
    // per_hour: rate × (duration / 60)
    amount = Math.round(resolvedRate.rate * (durationMinutes / 60) * 100) / 100;
  }

  return {
    rate: resolvedRate.rate,
    rate_unit: resolvedRate.rate_unit,
    duration_minutes: durationMinutes,
    amount,
    tier: resolvedRate.tier,
    tierLabel: resolvedRate.tierLabel,
  };
}

// ============================================================
// Formatting helpers
// ============================================================

export function formatRate(rate: number, unit: RateUnit): string {
  return `$${rate.toFixed(2)}/${unit === "per_hour" ? "hr" : "session"}`;
}

export function formatAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// ============================================================
// Fortnightly period helpers
// ============================================================

/**
 * Returns the start and end dates of the fortnightly pay period
 * that contains the given date. Periods start on a Monday.
 * The epoch Monday used is 2024-01-01 (a Monday).
 */
export function getFortnightlyPeriod(date: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const epoch = new Date("2024-01-01T00:00:00"); // A Monday
  const daysSinceEpoch = Math.floor(
    (date.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24)
  );
  const fortnightIndex = Math.floor(daysSinceEpoch / 14);
  const start = new Date(epoch);
  start.setDate(start.getDate() + fortnightIndex * 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 13);

  // Set times
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function formatPeriod(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
  };
  return `${start.toLocaleDateString("en-AU", opts)} – ${end.toLocaleDateString("en-AU", opts)}`;
}
