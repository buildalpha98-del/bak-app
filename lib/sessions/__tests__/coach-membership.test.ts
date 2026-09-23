import { describe, expect, it } from "vitest";
import { crewOf, isLeadOf } from "../coach-membership";

describe("crewOf", () => {
  it("returns every coach on the shift, lead first", () => {
    expect(
      crewOf({ coach_id: "a", crew: [{ user_id: "b", is_primary: false }, { user_id: "a", is_primary: true }] })
    ).toEqual([{ userId: "a", isLead: true }, { userId: "b", isLead: false }]);
  });

  it("with a filtered join it is only the matching coaches — the attribution an aggregate wants", () => {
    expect(crewOf({ coach_id: "a", crew: [{ user_id: "b", is_primary: false }] })).toEqual([{ userId: "b", isLead: false }]);
  });

  it("accepts a single object embed", () => {
    expect(crewOf({ crew: { user_id: "b", is_primary: false } })).toEqual([{ userId: "b", isLead: false }]);
  });

  it("falls back to the lead column when there is no crew embed, and to nobody when unassigned", () => {
    expect(crewOf({ coach_id: "a" })).toEqual([{ userId: "a", isLead: true }]);
    expect(crewOf({ coach_id: "a", crew: [] })).toEqual([{ userId: "a", isLead: true }]);
    expect(crewOf({ coach_id: null, crew: [] })).toEqual([]);
    expect(crewOf(null)).toEqual([]);
  });
});

describe("isLeadOf", () => {
  it("reads the membership join in either shape", () => {
    expect(isLeadOf({ membership: [{ user_id: "a", is_primary: true }] })).toBe(true);
    expect(isLeadOf({ membership: { user_id: "a", is_primary: false } })).toBe(false);
    expect(isLeadOf({})).toBe(false);
  });
});
