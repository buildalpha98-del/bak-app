import { describe, expect, it } from "vitest";
import { detectClashes, sessionCrewIds } from "../scheduling";
import type { SessionWithRelations } from "@/lib/sessions/actions";

// A second coach can be double-booked or out of compliance just like a
// lead. Before migration 099's follow-up the roster grouped shifts by
// `coach_id` (the lead only), so neither ever raised a warning.

const shift = (o: Partial<SessionWithRelations> & { id: string }): SessionWithRelations =>
  ({
    date: "2026-10-14",
    time: "09:00:00",
    duration_minutes: 60,
    centre_id: "centre-a",
    coach_id: null,
    status: "confirmed",
    sport: "Netball",
    assigned_coaches: [],
    ...o,
  }) as unknown as SessionWithRelations;

const crew = (lead: string, second?: string) => [
  { user_id: lead, name: lead, is_primary: true },
  ...(second ? [{ user_id: second, name: second, is_primary: false }] : []),
];

describe("sessionCrewIds", () => {
  it("is the whole crew, the lead included even when the crew list is missing", () => {
    expect(sessionCrewIds({ coach_id: "sam", assigned_coaches: crew("sam", "carla") }).sort()).toEqual(["carla", "sam"]);
    expect(sessionCrewIds({ coach_id: "sam", assigned_coaches: null })).toEqual(["sam"]);
    expect(sessionCrewIds({ coach_id: null, assigned_coaches: [] })).toEqual([]);
  });
});

describe("detectClashes — second coaches", () => {
  const names = new Map([["sam", "Sam"], ["carla", "Carla"], ["abz", "Abz"]]);
  // A missing document is itself a compliance clash, so everyone not under
  // test carries valid WWCC + first aid.
  const valid = (coach: string) =>
    (["wwcc", "first_aid"] as const).map((doc_type) => ({ coach_id: coach, doc_type, expiry_date: "2030-01-01", status: "verified" }));

  it("flags a coach who is second on one shift and lead on an overlapping one", () => {
    const shared = shift({ id: "shared", coach_id: "sam", assigned_coaches: crew("sam", "carla") });
    const own = shift({ id: "own", coach_id: "carla", centre_id: "centre-b", time: "09:30:00", assigned_coaches: crew("carla") });
    const clashes = detectClashes([shared, own], [...valid("sam"), ...valid("carla")], [], names);
    const overlap = clashes.filter((c) => c.type === "time_overlap");
    expect(overlap).toHaveLength(1);
    expect(overlap[0].coachId).toBe("carla");
    // Sam is only on one of them — no clash for the lead.
    expect(clashes.some((c) => c.coachId === "sam")).toBe(false);
  });

  it("flags a second coach's expired compliance document", () => {
    const shared = shift({ id: "shared", coach_id: "sam", assigned_coaches: crew("sam", "abz") });
    const clashes = detectClashes(
      [shared],
      [
        ...valid("sam"),
        { coach_id: "abz", doc_type: "wwcc", expiry_date: "2026-01-01", status: "expired" },
        { coach_id: "abz", doc_type: "first_aid", expiry_date: "2030-01-01", status: "verified" },
      ],
      [],
      names
    );
    expect(clashes.filter((c) => c.type === "compliance").map((c) => c.coachId)).toEqual(["abz"]);
  });
});
