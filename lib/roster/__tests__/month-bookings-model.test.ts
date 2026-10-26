import { describe, expect, it } from "vitest";
import {
  buildMonthBookings,
  isMonthKey,
  isoWeekday,
  monthBounds,
  shiftMonth,
  type MonthCentre,
  type MonthSession,
} from "../month-bookings-model";

const centres: MonthCentre[] = [
  { id: "a", name: "Al Bayan Liverpool", type: "school", colour: "#E8712A", contract_status: "active", agreed_rate: 165 },
  { id: "b", name: "Birds Of Paradise", type: "childcare_centre", colour: "#2A7BE8", contract_status: "active", agreed_rate: null },
  { id: "c", name: "Quiet Centre", type: "childcare_centre", colour: "#2AE87B", contract_status: "active", agreed_rate: 150 },
  { id: "d", name: "Churned School", type: "school", colour: "#999999", contract_status: "churned", agreed_rate: 150 },
];

let n = 0;
const s = (o: Partial<MonthSession> & { date: string }): MonthSession => ({
  id: `s${++n}`,
  centre_id: "a",
  time: "15:00:00",
  duration_minutes: 45,
  sport: "Soccer",
  status: "confirmed",
  is_trial: false,
  coach_name: "Abz",
  coach_count: 1,
  ...o,
});

describe("month helpers", () => {
  it("validates, bounds and shifts months", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey(undefined)).toBe(false);
    expect(monthBounds("2026-11")).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(monthBounds("2028-02").last).toBe("2028-02-29");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(isoWeekday("2026-11-02")).toBe(1); // Monday
    expect(isoWeekday("2026-11-01")).toBe(7); // Sunday
  });
});

describe("buildMonthBookings", () => {
  it("lays the month out as Monday-start weeks", () => {
    const m = buildMonthBookings("2026-11", centres, []);
    // 1 Nov 2026 is a Sunday: six leading blanks.
    expect(m.weeks[0].slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(m.weeks[0][6]?.date).toBe("2026-11-01");
    expect(m.weeks.every((w) => w.length === 7)).toBe(true);
    expect(m.weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("rolls each centre up: days, sports, times, hours, coach and confirmation state", () => {
    const m = buildMonthBookings("2026-11", centres, [
      s({ date: "2026-11-02" }), // Mon
      s({ date: "2026-11-04", sport: "Basketball", time: "15:30:00", status: "pending_confirmation" }), // Wed
      s({ date: "2026-11-09", coach_count: 0, coach_name: null, status: "draft" }), // Mon, no coach
      s({ date: "2026-11-11", status: "cancelled" }),
      s({ date: "2026-10-30" }), // outside the month
    ]);
    const a = m.rows.find((r) => r.centre.id === "a")!;
    expect(a.booked).toBe(3);
    expect(a.cancelled).toBe(1);
    expect(a.weekdays).toEqual([1, 3]);
    expect(a.sports).toEqual(["Basketball", "Soccer"]);
    expect(a.times).toEqual(["15:00", "15:30"]);
    expect(a.minutes).toBe(135);
    expect(a.no_coach).toBe(1);
    expect(a.unconfirmed).toBe(1);
    expect(a.confirmed).toBe(1);
  });

  it("values sessions at the agreed rate, never trials, and flags unpriced centres", () => {
    const m = buildMonthBookings("2026-11", centres, [
      s({ date: "2026-11-02" }),
      s({ date: "2026-11-03" }),
      s({ date: "2026-11-04", is_trial: true }),
      s({ date: "2026-11-05", status: "cancelled" }),
      s({ date: "2026-11-02", centre_id: "b" }),
    ]);
    expect(m.rows.find((r) => r.centre.id === "a")!.value).toBe(330);
    expect(m.rows.find((r) => r.centre.id === "b")!.value).toBeNull();
    expect(m.totals.value).toBe(330);
    expect(m.totals.trials).toBe(1);
    expect(m.totals.unpriced).toBe(1);
  });

  it("counts schools and centres booked, and lists active centres with nothing booked", () => {
    const m = buildMonthBookings("2026-11", centres, [
      s({ date: "2026-11-02" }),
      s({ date: "2026-11-02", centre_id: "b", time: "09:30:00" }),
    ]);
    expect(m.totals.schools).toBe(1);
    expect(m.totals.centres).toBe(1);
    // Churned centres aren't a gap.
    expect(m.not_booked.map((c) => c.id)).toEqual(["c"]);
    const day = m.weeks.flat().find((d) => d?.date === "2026-11-02")!;
    expect(day.centre_ids).toEqual(["b", "a"]); // earliest session first
    expect(day.sessions).toHaveLength(2);
  });

  it("keeps cancelled sessions off the calendar, and a fully cancelled centre counts as not booked", () => {
    const m = buildMonthBookings("2026-11", centres, [s({ date: "2026-11-02", centre_id: "c", status: "cancelled" })]);
    expect(m.weeks.flat().find((d) => d?.date === "2026-11-02")!.sessions).toHaveLength(0);
    expect(m.totals.booked).toBe(0);
    expect(m.totals.cancelled).toBe(1);
    expect(m.not_booked.map((c) => c.id)).toContain("c");
  });
});
