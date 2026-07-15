import { describe, it, expect } from "vitest";
import {
  clinicAgeLabel,
  clinicWeekLabel,
  clinicWeekMondayIso,
  formatClinicDate,
  formatClinicPrice,
  formatClinicTime,
  formatClinicTimeRange,
  groupClinicsByWeek,
  type PublicClinic,
} from "../clinics-shared";

function clinic(overrides: Partial<PublicClinic> = {}): PublicClinic {
  return {
    id: "c1",
    title: "Soccer Skills Blast",
    sport: "Soccer",
    date: "2026-07-20",
    start_time: "09:00:00",
    end_time: "15:00:00",
    location_name: "Whitlam Leisure Centre",
    suburb: "Liverpool",
    age_group_min: 5,
    age_group_max: 12,
    price_cents: 6500,
    max_capacity: 30,
    current_bookings: 10,
    booking_opens_at: null,
    booking_closes_at: null,
    ...overrides,
  };
}

describe("formatClinicDate", () => {
  it("formats a single-digit day without padding", () =>
    expect(formatClinicDate("2026-07-06")).toBe("Mon 6 Jul"));
  it("gets the day-of-week right (2026-07-21 is a Tuesday)", () =>
    expect(formatClinicDate("2026-07-21")).toBe("Tue 21 Jul"));
  it("gets a Sunday right", () =>
    expect(formatClinicDate("2026-07-26")).toBe("Sun 26 Jul"));
});

describe("formatClinicTime", () => {
  it("formats a morning hour on the hour", () =>
    expect(formatClinicTime("09:00:00")).toBe("9am"));
  it("formats midnight as 12am", () =>
    expect(formatClinicTime("00:00:00")).toBe("12am"));
  it("formats noon as 12pm", () =>
    expect(formatClinicTime("12:00:00")).toBe("12pm"));
  it("keeps :30 minutes", () =>
    expect(formatClinicTime("15:30:00")).toBe("3:30pm"));
});

describe("formatClinicTimeRange", () => {
  it("joins start and end with an en dash", () =>
    expect(formatClinicTimeRange("09:00:00", "15:00:00")).toBe("9am – 3pm"));
});

describe("clinicAgeLabel", () => {
  it("min + max → range", () => expect(clinicAgeLabel(5, 12)).toBe("Ages 5–12"));
  it("min only → open-ended", () => expect(clinicAgeLabel(8, null)).toBe("Ages 8+"));
  it("max only → capped", () => expect(clinicAgeLabel(null, 12)).toBe("Ages up to 12"));
  it("neither → null", () => expect(clinicAgeLabel(null, null)).toBeNull());
});

describe("formatClinicPrice", () => {
  it("formats cents as AUD", () => expect(formatClinicPrice(6500)).toBe("$65.00"));
  it("keeps non-zero cents", () => expect(formatClinicPrice(4550)).toBe("$45.50"));
});

describe("clinicWeekMondayIso", () => {
  it("mid-week date maps to that week's Monday", () =>
    expect(clinicWeekMondayIso("2026-07-22")).toBe("2026-07-20"));
  it("Sunday belongs to the preceding Monday's week", () =>
    expect(clinicWeekMondayIso("2026-07-26")).toBe("2026-07-20"));
  it("a Monday maps to itself", () =>
    expect(clinicWeekMondayIso("2026-07-20")).toBe("2026-07-20"));
  it("crosses a year boundary (Thu 1 Jan 2026 → Mon 29 Dec 2025)", () =>
    expect(clinicWeekMondayIso("2026-01-01")).toBe("2025-12-29"));
});

describe("clinicWeekLabel", () => {
  it("labels with the week's Monday", () =>
    expect(clinicWeekLabel("2026-07-22")).toBe("Week of Mon 20 Jul"));
});

describe("groupClinicsByWeek", () => {
  it("buckets two weeks in order with per-week clinics", () => {
    const groups = groupClinicsByWeek([
      clinic({ id: "a", date: "2026-07-20" }),
      clinic({ id: "b", date: "2026-07-22" }),
      clinic({ id: "c", date: "2026-07-28" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      mondayIso: "2026-07-20",
      label: "Week of Mon 20 Jul",
    });
    expect(groups[0].clinics.map((c) => c.id)).toEqual(["a", "b"]);
    expect(groups[1]).toMatchObject({
      mondayIso: "2026-07-27",
      label: "Week of Mon 27 Jul",
    });
    expect(groups[1].clinics.map((c) => c.id)).toEqual(["c"]);
  });

  it("is robust to unsorted input — sorts by date then start time", () => {
    const groups = groupClinicsByWeek([
      clinic({ id: "late", date: "2026-07-28" }),
      clinic({ id: "pm", date: "2026-07-20", start_time: "13:00:00" }),
      clinic({ id: "am", date: "2026-07-20", start_time: "09:00:00" }),
      clinic({ id: "mid", date: "2026-07-22" }),
    ]);
    expect(groups.map((g) => g.mondayIso)).toEqual(["2026-07-20", "2026-07-27"]);
    expect(groups[0].clinics.map((c) => c.id)).toEqual(["am", "pm", "mid"]);
    expect(groups[1].clinics.map((c) => c.id)).toEqual(["late"]);
  });

  it("does not mutate its input", () => {
    const input = [
      clinic({ id: "b", date: "2026-07-22" }),
      clinic({ id: "a", date: "2026-07-20" }),
    ];
    groupClinicsByWeek(input);
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("returns an empty array for no clinics", () =>
    expect(groupClinicsByWeek([])).toEqual([]));
});
