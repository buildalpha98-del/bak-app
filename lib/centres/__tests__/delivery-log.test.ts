import { describe, expect, it } from "vitest";
import { buildDeliveryLog, deliveryLogCsv, type DeliveryLogSession } from "../delivery-log";

const s = (o: Partial<DeliveryLogSession> & { id: string; date: string }): DeliveryLogSession => ({
  time: "10:00:00",
  status: "completed",
  sport: "Netball",
  duration_minutes: 45,
  actual_duration_minutes: null,
  headcount: null,
  coach_names: ["Abz"],
  programme_title: "Netball Week 1",
  outcome_codes: ["PD2-4"],
  class_names: [],
  ...o,
});

describe("buildDeliveryLog", () => {
  it("counts what was delivered, in date order, with actual minutes where recorded", () => {
    const log = buildDeliveryLog([
      s({ id: "b", date: "2026-08-05", actual_duration_minutes: 60, headcount: 12, outcome_codes: ["PD2-4", "PD2-5"] }),
      s({ id: "a", date: "2026-07-29", headcount: 10, coach_names: ["Abz", "Carla"] }),
      s({ id: "c", date: "2026-08-12", status: "cancelled" }),
      s({ id: "d", date: "2026-08-19", status: "confirmed", sport: "Soccer" }),
    ]);
    expect(log.sessions.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(log.totals).toEqual({
      delivered: 2,
      cancelled: 1,
      upcoming: 1,
      minutes_delivered: 105,
      children_sum: 22,
      sports: ["Netball"],
      outcome_codes: ["PD2-4", "PD2-5"],
      coaches: ["Abz", "Carla"],
    });
  });
});

describe("deliveryLogCsv", () => {
  it("is one row per session with quoting where needed", () => {
    const csv = deliveryLogCsv(buildDeliveryLog([s({ id: "a", date: "2026-07-29", programme_title: 'Passing, "the basics"', class_names: ["4T", "6M"] })]));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Date,Time,Status,Sport,Classes,Coach(es),Programme,Outcomes,Rostered min,Actual min,Children");
    expect(lines[1]).toBe('2026-07-29,10:00,completed,Netball,4T; 6M,Abz,"Passing, ""the basics""",PD2-4,45,,');
  });
});
