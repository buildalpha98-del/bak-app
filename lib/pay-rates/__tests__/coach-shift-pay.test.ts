import { describe, expect, it } from "vitest";
import { priceShiftForCoach, type ShiftPayInput } from "../coach-shift-pay";

const shift = (o: Partial<ShiftPayInput> = {}): ShiftPayInput => ({
  isLead: false,
  coachId: "second",
  date: "2026-09-10",
  durationMinutes: 90,
  centreType: "school",
  payRateOverride: null,
  payRateResolved: 80, // the LEAD's rate, stored on the shift
  ...o,
});
const hourly = { session_type: "school_local", rate: 40, rate_unit: "per_hour" as const, effective_from: "2026-01-01" };
const flat = { session_type: "childcare", rate: 55, rate_unit: "per_session" as const, effective_from: "2026-01-01" };

describe("the second coach is paid their own rate", () => {
  it("uses their session-type rate for the centre type — never the rate stored on the shift", () => {
    expect(priceShiftForCoach(shift(), [hourly, flat], { default_pay_rate: 50 })).toEqual({
      rate: 40,
      rate_unit: "per_hour",
      amount: 60, // 40/h × 1.5h, not the lead's 80
    });
    expect(priceShiftForCoach(shift({ centreType: "childcare_centre" }), [hourly, flat], null).amount).toBe(55);
  });

  it("falls back to their default rate", () => {
    expect(priceShiftForCoach(shift(), [], { default_pay_rate: 50 })).toEqual({ rate: 50, rate_unit: "per_session", amount: 50 });
  });

  it("ignores the shift's manual override — that is an override of the lead's pay", () => {
    expect(priceShiftForCoach(shift({ payRateOverride: 200, payRateResolved: 200 }), [], { default_pay_rate: 50 }).amount).toBe(50);
  });

  it("picks the rate in force on the day", () => {
    const rise = { ...hourly, rate: 44, effective_from: "2026-09-15" };
    expect(priceShiftForCoach(shift({ date: "2026-09-10" }), [hourly, rise], null).rate).toBe(40);
    expect(priceShiftForCoach(shift({ date: "2026-09-20" }), [hourly, rise], null).rate).toBe(44);
  });

  it("with no rate at all it is a visible $0 line, not a missing one", () => {
    expect(priceShiftForCoach(shift(), [], { default_pay_rate: null })).toEqual({ rate: null, rate_unit: "per_session", amount: 0 });
  });
});

describe("the lead's pay does not move", () => {
  const lead = (o: Partial<ShiftPayInput> = {}) => shift({ isLead: true, coachId: "lead", ...o });

  it("is the rate the trigger stored on the shift, multiplied out when their rate is hourly", () => {
    expect(priceShiftForCoach(lead({ payRateResolved: 40 }), [hourly], null)).toEqual({ rate: 40, rate_unit: "per_hour", amount: 60 });
    expect(priceShiftForCoach(lead({ payRateResolved: 80 }), [flat], null)).toEqual({ rate: 80, rate_unit: "per_session", amount: 80 });
  });

  it("an override is a flat amount for the shift", () => {
    expect(priceShiftForCoach(lead({ payRateOverride: 120, payRateResolved: 120 }), [hourly], null)).toEqual({
      rate: 120,
      rate_unit: "per_session",
      amount: 120,
    });
  });

  it("falls back to their default when the shift carries no resolved rate", () => {
    expect(priceShiftForCoach(lead({ payRateResolved: null }), [], { default_pay_rate: 65 }).amount).toBe(65);
    expect(priceShiftForCoach(lead({ payRateResolved: null }), [], null)).toEqual({ rate: null, rate_unit: "per_session", amount: 0 });
  });
});

describe("two coaches, one shift", () => {
  it("each is paid their own amount and the shift costs the sum", () => {
    const leadPay = priceShiftForCoach(shift({ isLead: true, coachId: "lead", payRateResolved: 80 }), [flat], null);
    const secondPay = priceShiftForCoach(shift(), [hourly], null);
    expect([leadPay.amount, secondPay.amount]).toEqual([80, 60]);
  });
});
