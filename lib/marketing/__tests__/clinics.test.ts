import { describe, it, expect } from "vitest";
import { clinicAvailability, clinicIsListable } from "../clinics";

describe("clinicAvailability", () => {
  it("computes spots left", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 17 }))
      .toEqual({ spotsLeft: 3, soldOut: false, lowSpots: true }));
  it("flags sold out at zero", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 20 }).soldOut).toBe(true));
  it("never returns negative spots", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 25 }).spotsLeft).toBe(0));
  it("lowSpots only at 5 or fewer", () =>
    expect(clinicAvailability({ max_capacity: 20, current_bookings: 14 }).lowSpots).toBe(false));
});

describe("clinicIsListable (booking window)", () => {
  const now = new Date("2026-07-15T02:00:00Z");
  it("passes when both windows null", () =>
    expect(clinicIsListable({ booking_opens_at: null, booking_closes_at: null }, now)).toBe(true));
  it("excludes before opens_at", () =>
    expect(clinicIsListable({ booking_opens_at: "2026-08-01T00:00:00Z", booking_closes_at: null }, now)).toBe(false));
  it("excludes after closes_at", () =>
    expect(clinicIsListable({ booking_opens_at: null, booking_closes_at: "2026-07-01T00:00:00Z" }, now)).toBe(false));
});
