import { describe, it, expect } from "vitest";
import {
  resolvePayRate,
  calculateSessionPay,
  centreTypeToSessionType,
  getFortnightlyPeriod,
  formatRate,
  formatAmount,
  formatPeriod,
} from "../payRates";
import type {
  RateResolutionInput,
  PayRateRecord,
  CoachProfile,
} from "../payRates";

// ============================================================
// Helper factories
// ============================================================

function makeSession(
  overrides: Partial<RateResolutionInput> = {}
): RateResolutionInput {
  return {
    pay_rate_override: null,
    coach_id: "coach-1",
    duration_minutes: 45,
    centre_type: "childcare_centre",
    ...overrides,
  };
}

function makePayRate(
  overrides: Partial<PayRateRecord> = {}
): PayRateRecord {
  return {
    session_type: "childcare",
    rate: 40,
    rate_unit: "per_session",
    effective_from: "2024-01-01",
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<CoachProfile> = {}
): CoachProfile {
  return {
    default_pay_rate: 35,
    ...overrides,
  };
}

// ============================================================
// centreTypeToSessionType
// ============================================================

describe("centreTypeToSessionType", () => {
  it("maps childcare_centre to childcare", () => {
    expect(centreTypeToSessionType("childcare_centre")).toBe("childcare");
  });

  it("maps school to school_local", () => {
    expect(centreTypeToSessionType("school")).toBe("school_local");
  });
});

// ============================================================
// resolvePayRate — Three-tier hierarchy
// ============================================================

describe("resolvePayRate", () => {
  // ---- Tier 1: Session override ----

  describe("Tier 1 — Session override", () => {
    it("returns override rate when set", () => {
      const session = makeSession({ pay_rate_override: 55 });
      const result = resolvePayRate(session, [], null);

      expect(result).not.toBeNull();
      expect(result!.rate).toBe(55);
      expect(result!.rate_unit).toBe("per_session");
      expect(result!.tier).toBe("override");
      expect(result!.tierLabel).toBe("Manual override");
    });

    it("takes priority over session-type and default rates", () => {
      const session = makeSession({ pay_rate_override: 60 });
      const rates = [makePayRate({ rate: 40 })];
      const profile = makeProfile({ default_pay_rate: 35 });
      const result = resolvePayRate(session, rates, profile);

      expect(result!.rate).toBe(60);
      expect(result!.tier).toBe("override");
    });

    it("ignores override of 0", () => {
      const session = makeSession({ pay_rate_override: 0 });
      const rates = [makePayRate({ rate: 40 })];
      const result = resolvePayRate(session, rates, null);

      expect(result!.tier).toBe("session_type");
    });

    it("ignores negative override", () => {
      const session = makeSession({ pay_rate_override: -10 });
      const rates = [makePayRate({ rate: 40 })];
      const result = resolvePayRate(session, rates, null);

      expect(result!.tier).toBe("session_type");
    });
  });

  // ---- Tier 2: Session-type rate ----

  describe("Tier 2 — Session-type rate", () => {
    it("returns session-type rate for childcare centre", () => {
      const session = makeSession({ centre_type: "childcare_centre" });
      const rates = [makePayRate({ session_type: "childcare", rate: 42 })];
      const result = resolvePayRate(session, rates, null);

      expect(result!.rate).toBe(42);
      expect(result!.tier).toBe("session_type");
      expect(result!.tierLabel).toBe("Session-type rate");
    });

    it("returns session-type rate for school", () => {
      const session = makeSession({ centre_type: "school" });
      const rates = [
        makePayRate({ session_type: "school_local", rate: 38, rate_unit: "per_hour" }),
      ];
      const result = resolvePayRate(session, rates, null);

      expect(result!.rate).toBe(38);
      expect(result!.rate_unit).toBe("per_hour");
      expect(result!.tier).toBe("session_type");
    });

    it("uses most recent effective rate for session date", () => {
      const session = makeSession({ centre_type: "childcare_centre" });
      const rates = [
        makePayRate({ rate: 40, effective_from: "2024-01-01" }),
        makePayRate({ rate: 45, effective_from: "2024-06-01" }),
        makePayRate({ rate: 50, effective_from: "2025-01-01" }),
      ];

      // Session in mid-2024: should get the June rate
      const result = resolvePayRate(session, rates, null, "2024-08-15");
      expect(result!.rate).toBe(45);
    });

    it("uses future rate if no effective rate before session date", () => {
      const session = makeSession({ centre_type: "childcare_centre" });
      const rates = [
        makePayRate({ rate: 50, effective_from: "2025-06-01" }),
      ];

      // Session before effective date — should still use the rate (first available)
      const result = resolvePayRate(session, rates, null, "2024-01-01");
      expect(result!.rate).toBe(50);
    });

    it("ignores rates for wrong session type", () => {
      const session = makeSession({ centre_type: "childcare_centre" });
      const rates = [
        makePayRate({ session_type: "school_local", rate: 50 }),
      ];
      const result = resolvePayRate(session, rates, makeProfile());

      // Should fall through to Tier 3
      expect(result!.tier).toBe("default");
    });

    it("skips Tier 2 when no coach assigned", () => {
      const session = makeSession({ coach_id: null });
      const rates = [makePayRate({ rate: 40 })];
      const profile = makeProfile();
      const result = resolvePayRate(session, rates, profile);

      // With no coach_id, Tier 2 is skipped; Tier 3 applies
      expect(result!.tier).toBe("default");
    });
  });

  // ---- Tier 3: Default rate ----

  describe("Tier 3 — Default rate", () => {
    it("returns coach default rate when no session-type rate exists", () => {
      const session = makeSession();
      const profile = makeProfile({ default_pay_rate: 36 });
      const result = resolvePayRate(session, [], profile);

      expect(result!.rate).toBe(36);
      expect(result!.rate_unit).toBe("per_session");
      expect(result!.tier).toBe("default");
      expect(result!.tierLabel).toBe("Coach default rate");
    });

    it("ignores default rate of 0", () => {
      const session = makeSession();
      const profile = makeProfile({ default_pay_rate: 0 });
      const result = resolvePayRate(session, [], profile);

      expect(result).toBeNull();
    });

    it("ignores null default rate", () => {
      const session = makeSession();
      const profile = makeProfile({ default_pay_rate: null });
      const result = resolvePayRate(session, [], profile);

      expect(result).toBeNull();
    });
  });

  // ---- Fallback: No rate ----

  describe("Fallback — No rate configured", () => {
    it("returns null when no rates exist and no default", () => {
      const session = makeSession();
      const result = resolvePayRate(session, [], null);

      expect(result).toBeNull();
    });

    it("returns null when no coach and no default", () => {
      const session = makeSession({ coach_id: null });
      const result = resolvePayRate(session, [], null);

      expect(result).toBeNull();
    });

    it("returns null with empty profile", () => {
      const session = makeSession();
      const profile = makeProfile({ default_pay_rate: null });
      const result = resolvePayRate(session, [], profile);

      expect(result).toBeNull();
    });
  });

  // ---- Full hierarchy priority ----

  describe("Full hierarchy priority", () => {
    it("override > session-type > default", () => {
      const session = makeSession({ pay_rate_override: 70 });
      const rates = [makePayRate({ rate: 50 })];
      const profile = makeProfile({ default_pay_rate: 35 });

      const r1 = resolvePayRate(session, rates, profile);
      expect(r1!.rate).toBe(70);
      expect(r1!.tier).toBe("override");

      // Remove override → session-type wins
      const session2 = makeSession({ pay_rate_override: null });
      const r2 = resolvePayRate(session2, rates, profile);
      expect(r2!.rate).toBe(50);
      expect(r2!.tier).toBe("session_type");

      // Remove session-type rates → default wins
      const r3 = resolvePayRate(session2, [], profile);
      expect(r3!.rate).toBe(35);
      expect(r3!.tier).toBe("default");

      // Remove everything → null
      const r4 = resolvePayRate(session2, [], null);
      expect(r4).toBeNull();
    });
  });
});

// ============================================================
// calculateSessionPay
// ============================================================

describe("calculateSessionPay", () => {
  it("returns flat rate for per_session", () => {
    const resolved = {
      rate: 40,
      rate_unit: "per_session" as const,
      tier: "session_type" as const,
      tierLabel: "Session-type rate",
    };
    const pay = calculateSessionPay(resolved, 45);

    expect(pay.amount).toBe(40);
    expect(pay.rate).toBe(40);
    expect(pay.rate_unit).toBe("per_session");
    expect(pay.duration_minutes).toBe(45);
  });

  it("calculates per_hour rate × duration correctly", () => {
    const resolved = {
      rate: 35,
      rate_unit: "per_hour" as const,
      tier: "session_type" as const,
      tierLabel: "Session-type rate",
    };
    const pay = calculateSessionPay(resolved, 60);

    // 35 × (60/60) = 35
    expect(pay.amount).toBe(35);
  });

  it("handles 45-minute session at per_hour rate", () => {
    const resolved = {
      rate: 40,
      rate_unit: "per_hour" as const,
      tier: "default" as const,
      tierLabel: "Coach default rate",
    };
    const pay = calculateSessionPay(resolved, 45);

    // 40 × (45/60) = 40 × 0.75 = 30
    expect(pay.amount).toBe(30);
  });

  it("handles 30-minute session at per_hour rate", () => {
    const resolved = {
      rate: 50,
      rate_unit: "per_hour" as const,
      tier: "override" as const,
      tierLabel: "Manual override",
    };
    const pay = calculateSessionPay(resolved, 30);

    // 50 × (30/60) = 25
    expect(pay.amount).toBe(25);
  });

  it("handles 90-minute session at per_hour rate", () => {
    const resolved = {
      rate: 35,
      rate_unit: "per_hour" as const,
      tier: "session_type" as const,
      tierLabel: "Session-type rate",
    };
    const pay = calculateSessionPay(resolved, 90);

    // 35 × (90/60) = 35 × 1.5 = 52.50
    expect(pay.amount).toBe(52.5);
  });

  it("rounds to 2 decimal places", () => {
    const resolved = {
      rate: 33,
      rate_unit: "per_hour" as const,
      tier: "session_type" as const,
      tierLabel: "Session-type rate",
    };
    const pay = calculateSessionPay(resolved, 45);

    // 33 × 0.75 = 24.75
    expect(pay.amount).toBe(24.75);
  });

  it("handles awkward rate/duration combos with proper rounding", () => {
    const resolved = {
      rate: 37.5,
      rate_unit: "per_hour" as const,
      tier: "session_type" as const,
      tierLabel: "Session-type rate",
    };
    const pay = calculateSessionPay(resolved, 40);

    // 37.5 × (40/60) = 37.5 × 0.6667 = 25.00
    expect(pay.amount).toBe(25);
  });

  it("preserves tier information", () => {
    const resolved = {
      rate: 55,
      rate_unit: "per_session" as const,
      tier: "override" as const,
      tierLabel: "Manual override",
    };
    const pay = calculateSessionPay(resolved, 45);

    expect(pay.tier).toBe("override");
    expect(pay.tierLabel).toBe("Manual override");
  });
});

// ============================================================
// Formatting helpers
// ============================================================

describe("formatRate", () => {
  it("formats per_session rate", () => {
    expect(formatRate(40, "per_session")).toBe("$40.00/session");
  });

  it("formats per_hour rate", () => {
    expect(formatRate(35.5, "per_hour")).toBe("$35.50/hr");
  });
});

describe("formatAmount", () => {
  it("formats dollar amount", () => {
    expect(formatAmount(52.5)).toBe("$52.50");
  });

  it("formats zero", () => {
    expect(formatAmount(0)).toBe("$0.00");
  });
});

// ============================================================
// Fortnightly period helpers
// ============================================================

describe("getFortnightlyPeriod", () => {
  it("returns a 14-day window", () => {
    const { start, end } = getFortnightlyPeriod(new Date("2024-01-08"));

    const daysDiff =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    // end is set to 23:59:59 of day 13, so rounds to 14
    expect(daysDiff).toBeGreaterThanOrEqual(13);
    expect(daysDiff).toBeLessThanOrEqual(14);
  });

  it("start is a Monday", () => {
    const { start } = getFortnightlyPeriod(new Date("2024-03-15"));
    expect(start.getDay()).toBe(1); // Monday
  });

  it("same period for dates within the same fortnight", () => {
    const p1 = getFortnightlyPeriod(new Date("2024-01-01"));
    const p2 = getFortnightlyPeriod(new Date("2024-01-10"));

    expect(p1.start.toISOString().split("T")[0]).toBe(
      p2.start.toISOString().split("T")[0]
    );
  });

  it("different periods for dates in different fortnights", () => {
    const p1 = getFortnightlyPeriod(new Date("2024-01-01"));
    const p2 = getFortnightlyPeriod(new Date("2024-01-15"));

    expect(p1.start.toISOString().split("T")[0]).not.toBe(
      p2.start.toISOString().split("T")[0]
    );
  });
});

describe("formatPeriod", () => {
  it("formats start and end dates", () => {
    const result = formatPeriod(
      new Date("2024-01-01"),
      new Date("2024-01-14")
    );
    expect(result).toContain("Jan");
    expect(result).toContain("–");
  });
});

// ============================================================
// Integration-style: Full resolution + calculation
// ============================================================

describe("Integration: resolve + calculate", () => {
  it("childcare coach with session-type rate", () => {
    const session = makeSession({
      centre_type: "childcare_centre",
      duration_minutes: 45,
    });
    const rates = [
      makePayRate({ session_type: "childcare", rate: 40, rate_unit: "per_session" }),
    ];
    const profile = makeProfile({ default_pay_rate: 35 });

    const resolved = resolvePayRate(session, rates, profile, "2024-06-01");
    expect(resolved).not.toBeNull();

    const pay = calculateSessionPay(resolved!, session.duration_minutes);
    expect(pay.amount).toBe(40); // per_session, flat rate
    expect(pay.tier).toBe("session_type");
  });

  it("school coach with per_hour rate", () => {
    const session = makeSession({
      centre_type: "school",
      duration_minutes: 60,
    });
    const rates = [
      makePayRate({ session_type: "school_local", rate: 35, rate_unit: "per_hour" }),
    ];

    const resolved = resolvePayRate(session, rates, null, "2024-06-01");
    const pay = calculateSessionPay(resolved!, session.duration_minutes);

    expect(pay.amount).toBe(35); // 35/hr × 1hr
    expect(pay.rate_unit).toBe("per_hour");
  });

  it("admin override for special session", () => {
    const session = makeSession({
      pay_rate_override: 65,
      duration_minutes: 90,
    });
    const rates = [makePayRate({ rate: 40 })];
    const profile = makeProfile({ default_pay_rate: 35 });

    const resolved = resolvePayRate(session, rates, profile);
    const pay = calculateSessionPay(resolved!, session.duration_minutes);

    expect(pay.amount).toBe(65); // Override is always per_session
    expect(pay.tier).toBe("override");
  });

  it("no rate configured flags for attention", () => {
    const session = makeSession();
    const resolved = resolvePayRate(session, [], null);

    expect(resolved).toBeNull();
    // Caller should flag this session for ops review
  });
});
