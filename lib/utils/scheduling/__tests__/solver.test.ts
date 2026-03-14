import { describe, it, expect } from "vitest";
import {
  haversineDistance,
  estimatedTravelMinutes,
  hasAdequateTravelBuffer,
  timeToMinutes,
  sessionEndMinutes,
} from "../travel";
import {
  getEligibleCoaches,
  scoreCoachForSession,
  generateRoster,
} from "../solver";
import type {
  SchedulingCoach,
  SchedulingSession,
  SchedulingCentre,
  SchedulingInput,
  ScoringContext,
  SchedulingPreferenceInput,
  SessionHistory,
} from "../types";

// ============================================================
// Factories
// ============================================================

function makeCoach(overrides: Partial<SchedulingCoach> = {}): SchedulingCoach {
  return {
    id: "coach-1",
    name: "Test Coach",
    phone: null,
    default_pay_rate: 50,
    status: "active",
    availability_slots: [
      {
        day_of_week: 1, // Monday
        start_time: "07:00",
        end_time: "17:00",
        location_preferences: [],
      },
    ],
    compliance_docs: [],
    pay_rates: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SchedulingSession> = {}): SchedulingSession {
  return {
    id: "session-1",
    date: "2026-03-16", // Monday
    time: "09:00",
    duration_minutes: 45,
    centre_id: "centre-1",
    coach_id: null,
    sport: "Soccer",
    status: "draft",
    template_id: null,
    ...overrides,
  };
}

function makeCentre(overrides: Partial<SchedulingCentre> = {}): SchedulingCentre {
  return {
    id: "centre-1",
    name: "Test Centre",
    latitude: -33.9173, // Bankstown area
    longitude: 151.0355,
    address: "123 Test St, Bankstown",
    ...overrides,
  };
}

function makeInput(overrides: Partial<SchedulingInput> = {}): SchedulingInput {
  return {
    sessions: [],
    coaches: [],
    centres: new Map(),
    preferences: [],
    history: [],
    currentAssignments: new Map(),
    ...overrides,
  };
}

function makeContext(inputOverrides: Partial<SchedulingInput> = {}): ScoringContext {
  const input = makeInput(inputOverrides);
  return { input, runningAssignments: new Map() };
}

// ============================================================
// Travel calculations
// ============================================================

describe("Travel calculations", () => {
  it("haversineDistance returns correct km for Bankstown to Liverpool", () => {
    // Bankstown: -33.9173, 151.0355
    // Liverpool: -33.9209, 150.9236
    const dist = haversineDistance(-33.9173, 151.0355, -33.9209, 150.9236);
    expect(dist).toBeGreaterThan(7);
    expect(dist).toBeLessThan(12);
  });

  it("estimatedTravelMinutes applies road factor and speed", () => {
    const centreA = { latitude: -33.9173, longitude: 151.0355 };
    const centreB = { latitude: -33.9209, longitude: 150.9236 };
    const minutes = estimatedTravelMinutes(centreA, centreB);
    // ~9.5km * 1.4 / 30 * 60 ≈ 26.6 minutes
    expect(minutes).toBeGreaterThan(15);
    expect(minutes).toBeLessThan(40);
  });

  it("estimatedTravelMinutes returns 15 when coordinates missing", () => {
    const centreA = { latitude: null, longitude: null };
    const centreB = { latitude: -33.9209, longitude: 150.9236 };
    expect(estimatedTravelMinutes(centreA, centreB)).toBe(15);
  });

  it("estimatedTravelMinutes enforces 5 min minimum", () => {
    // Very close centres
    const centreA = { latitude: -33.9173, longitude: 151.0355 };
    const centreB = { latitude: -33.9174, longitude: 151.0356 };
    expect(estimatedTravelMinutes(centreA, centreB)).toBe(5);
  });

  it("hasAdequateTravelBuffer returns false when gap < travel time", () => {
    const centreA = { latitude: -33.9173, longitude: 151.0355 };
    const centreB = { latitude: -33.9209, longitude: 150.9236 };
    // Session 1 ends at 9:45, session 2 starts at 10:00 (15 min gap)
    expect(hasAdequateTravelBuffer(585, 600, centreA, centreB)).toBe(false);
  });

  it("hasAdequateTravelBuffer returns true when gap is adequate", () => {
    const centreA = { latitude: -33.9173, longitude: 151.0355 };
    const centreB = { latitude: -33.9209, longitude: 150.9236 };
    // Session 1 ends at 9:00, session 2 starts at 10:00 (60 min gap)
    expect(hasAdequateTravelBuffer(540, 600, centreA, centreB)).toBe(true);
  });

  it("timeToMinutes converts correctly", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("13:30")).toBe(810);
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("sessionEndMinutes calculates correctly", () => {
    expect(sessionEndMinutes("09:00", 45)).toBe(585);
    expect(sessionEndMinutes("14:00", 60)).toBe(900);
  });
});

// ============================================================
// Eligibility filtering
// ============================================================

describe("getEligibleCoaches", () => {
  it("coach with matching availability slot passes", () => {
    const coach = makeCoach();
    const session = makeSession();
    const centre = makeCentre();
    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", centre]]),
    });

    const eligible = getEligibleCoaches(session, [coach], context);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe("coach-1");
  });

  it("coach without availability for session day fails", () => {
    const coach = makeCoach({
      availability_slots: [
        {
          day_of_week: 2, // Tuesday only
          start_time: "07:00",
          end_time: "17:00",
          location_preferences: [],
        },
      ],
    });
    const session = makeSession(); // Monday
    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
    });

    const eligible = getEligibleCoaches(session, [coach], context);
    expect(eligible).toHaveLength(0);
  });

  it("coach with overlapping session fails", () => {
    const coach = makeCoach();
    const session = makeSession({ id: "session-2", time: "09:15" });
    const existingSession = makeSession({ id: "session-1", time: "09:00" });

    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
      currentAssignments: new Map([["coach-1", [existingSession]]]),
    });

    const eligible = getEligibleCoaches(session, [coach], context);
    expect(eligible).toHaveLength(0);
  });

  it("coach with inadequate travel buffer fails", () => {
    const coach = makeCoach();
    const centreA = makeCentre({ id: "centre-1", latitude: -33.9173, longitude: 151.0355 });
    const centreB = makeCentre({ id: "centre-2", latitude: -33.9209, longitude: 150.9236 });

    // Session at centre-2, existing at centre-1 ending just 15min before
    const existingSession = makeSession({
      id: "session-existing",
      centre_id: "centre-1",
      time: "08:30",
      duration_minutes: 45,
    }); // ends at 9:15

    const session = makeSession({
      id: "session-2",
      centre_id: "centre-2",
      time: "09:30", // only 15 min after existing ends
    });

    const context = makeContext({
      coaches: [coach],
      centres: new Map([
        ["centre-1", centreA],
        ["centre-2", centreB],
      ]),
      currentAssignments: new Map([["coach-1", [existingSession]]]),
    });

    const eligible = getEligibleCoaches(session, [coach], context);
    expect(eligible).toHaveLength(0);
  });

  it("coach at same centre passes even with tight schedule", () => {
    const coach = makeCoach();
    const centre = makeCentre();

    // Both sessions at same centre, 15 min gap
    const existingSession = makeSession({
      id: "session-existing",
      time: "08:00",
      duration_minutes: 45,
    }); // ends at 8:45

    const session = makeSession({
      id: "session-2",
      time: "09:00", // 15 min gap, same centre — no travel needed
    });

    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", centre]]),
      currentAssignments: new Map([["coach-1", [existingSession]]]),
    });

    const eligible = getEligibleCoaches(session, [coach], context);
    expect(eligible).toHaveLength(1);
  });
});

// ============================================================
// Scoring
// ============================================================

describe("scoreCoachForSession", () => {
  it("familiarity: +3 for recent history at centre", () => {
    const coach = makeCoach();
    const session = makeSession();
    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
      history: [{ coach_id: "coach-1", centre_id: "centre-1", session_count: 4 }],
    });

    const { score, reasoning } = scoreCoachForSession(coach, session, context);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(reasoning.some((r) => r.includes("Regular coach"))).toBe(true);
  });

  it("utilisation: +2 when below average hours", () => {
    const coach1 = makeCoach({ id: "coach-1" });
    const coach2 = makeCoach({ id: "coach-2" });

    // Coach2 has sessions, coach1 has none → coach1 below average
    const existingSessions = [
      makeSession({ id: "s1", time: "08:00" }),
      makeSession({ id: "s2", time: "10:00" }),
      makeSession({ id: "s3", time: "12:00" }),
    ];

    const context = makeContext({
      coaches: [coach1, coach2],
      centres: new Map([["centre-1", makeCentre()]]),
      currentAssignments: new Map([["coach-2", existingSessions]]),
    });

    const { score, reasoning } = scoreCoachForSession(coach1, makeSession(), context);
    expect(reasoning.some((r) => r.includes("Below average"))).toBe(true);
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it("scheduling preference: +5 preferred", () => {
    const coach = makeCoach();
    const session = makeSession();
    const preferences: SchedulingPreferenceInput[] = [
      { coach_id: "coach-1", centre_id: "centre-1", preference_type: "preferred" },
    ];

    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
      preferences,
    });

    const { score, reasoning } = scoreCoachForSession(coach, session, context);
    expect(reasoning.some((r) => r.includes("Preferred"))).toBe(true);
    // Score should include +5 from preference + potentially +2 from utilisation
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("scheduling preference: -10 avoid", () => {
    const coach = makeCoach();
    const session = makeSession();
    const preferences: SchedulingPreferenceInput[] = [
      { coach_id: "coach-1", centre_id: "centre-1", preference_type: "avoid" },
    ];

    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
      preferences,
    });

    const { score, reasoning } = scoreCoachForSession(coach, session, context);
    expect(reasoning.some((r) => r.includes("avoid"))).toBe(true);
    expect(score).toBeLessThanOrEqual(-8); // -10 + potential +2 from utilisation
  });

  it("compliance: -3 for expired mandatory docs", () => {
    const coach = makeCoach({
      compliance_docs: [
        { doc_type: "wwcc", status: "expired", expiry_date: "2025-01-01" },
      ],
    });
    const session = makeSession();
    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", makeCentre()]]),
    });

    const { score, reasoning } = scoreCoachForSession(coach, session, context);
    expect(reasoning.some((r) => r.includes("compliance"))).toBe(true);
    // -3 compliance + potential +2 utilisation = -1
    expect(score).toBeLessThanOrEqual(0);
  });

  it("location preference: +1 when centre address matches", () => {
    const coach = makeCoach({
      availability_slots: [
        {
          day_of_week: 1,
          start_time: "07:00",
          end_time: "17:00",
          location_preferences: ["bankstown"],
        },
      ],
    });
    const session = makeSession();
    const centre = makeCentre({ address: "123 Test St, Bankstown NSW" });
    const context = makeContext({
      coaches: [coach],
      centres: new Map([["centre-1", centre]]),
    });

    const { reasoning } = scoreCoachForSession(coach, session, context);
    expect(reasoning.some((r) => r.includes("preferred location"))).toBe(true);
  });
});

// ============================================================
// Assignment algorithm
// ============================================================

describe("generateRoster", () => {
  it("assigns highest-scored coach", () => {
    const coach1 = makeCoach({ id: "coach-1", name: "Coach A" });
    const coach2 = makeCoach({ id: "coach-2", name: "Coach B" });
    const session = makeSession();
    const centre = makeCentre();

    const input = makeInput({
      sessions: [session],
      coaches: [coach1, coach2],
      centres: new Map([["centre-1", centre]]),
      // coach1 has familiarity → higher score
      history: [{ coach_id: "coach-1", centre_id: "centre-1", session_count: 3 }],
    });

    const results = generateRoster(input);
    expect(results).toHaveLength(1);
    expect(results[0].assignedCoachId).toBe("coach-1");
  });

  it("handles unassignable sessions with null and reason", () => {
    const session = makeSession();
    // No coaches available
    const input = makeInput({
      sessions: [session],
      coaches: [],
      centres: new Map([["centre-1", makeCentre()]]),
    });

    const results = generateRoster(input);
    expect(results).toHaveLength(1);
    expect(results[0].assignedCoachId).toBeNull();
    expect(results[0].confidence).toBe("red");
    expect(results[0].reasoning[0]).toContain("No coaches available");
  });

  it("backtracking: tries second choice when first blocks a harder session", () => {
    // Coach A available Mon 7-17, Coach B available Mon 9-12
    const coachA = makeCoach({
      id: "coach-a",
      name: "Coach A",
      availability_slots: [
        { day_of_week: 1, start_time: "07:00", end_time: "17:00", location_preferences: [] },
      ],
    });
    const coachB = makeCoach({
      id: "coach-b",
      name: "Coach B",
      availability_slots: [
        { day_of_week: 1, start_time: "09:00", end_time: "12:00", location_preferences: [] },
      ],
    });

    // Session 1 at 10:00 — both eligible
    // Session 2 at 10:00 — only Coach B if different centre, or overlap
    // Better test: Session 1 at 10:00, Session 2 at 10:00 same time
    // Coach A eligible for both, Coach B eligible for both
    // If we assign Coach A to session 1, Coach B must get session 2
    const session1 = makeSession({
      id: "s1",
      time: "10:00",
      centre_id: "centre-1",
    });
    const session2 = makeSession({
      id: "s2",
      time: "10:00",
      centre_id: "centre-1",
    });

    const centre = makeCentre();
    const input = makeInput({
      sessions: [session1, session2],
      coaches: [coachA, coachB],
      centres: new Map([["centre-1", centre]]),
    });

    const results = generateRoster(input);
    const assigned = results.filter((r) => r.assignedCoachId !== null);
    expect(assigned).toHaveLength(2);

    // Both sessions should be assigned to different coaches
    const coaches = assigned.map((r) => r.assignedCoachId);
    expect(new Set(coaches).size).toBe(2);
  });

  it("confidence: green when score >= 5 and 3+ eligible", () => {
    const coaches = Array.from({ length: 3 }, (_, i) =>
      makeCoach({ id: `coach-${i}`, name: `Coach ${i}` })
    );
    const session = makeSession();
    const centre = makeCentre();

    const input = makeInput({
      sessions: [session],
      coaches,
      centres: new Map([["centre-1", centre]]),
      // Give first coach a preferred preference → +5
      preferences: [
        { coach_id: "coach-0", centre_id: "centre-1", preference_type: "preferred" as const },
      ],
    });

    const results = generateRoster(input);
    expect(results[0].confidence).toBe("green");
  });

  it("confidence: amber when score >= 0 or 1-2 eligible", () => {
    // Single eligible coach, no preference bonuses
    const coach = makeCoach();
    const session = makeSession();
    const centre = makeCentre();

    const input = makeInput({
      sessions: [session],
      coaches: [coach],
      centres: new Map([["centre-1", centre]]),
    });

    const results = generateRoster(input);
    expect(results[0].confidence).toBe("amber");
  });

  it("confidence: red when no coaches assigned", () => {
    const session = makeSession();
    const input = makeInput({
      sessions: [session],
      coaches: [],
      centres: new Map([["centre-1", makeCentre()]]),
    });

    const results = generateRoster(input);
    expect(results[0].confidence).toBe("red");
  });
});

// ============================================================
// Performance
// ============================================================

describe("Performance", () => {
  it("50 sessions x 15 coaches completes in under 2 seconds", () => {
    const coaches = Array.from({ length: 15 }, (_, i) =>
      makeCoach({
        id: `coach-${i}`,
        name: `Coach ${i}`,
        availability_slots: [
          { day_of_week: 1, start_time: "07:00", end_time: "17:00", location_preferences: [] },
          { day_of_week: 2, start_time: "07:00", end_time: "17:00", location_preferences: [] },
          { day_of_week: 3, start_time: "07:00", end_time: "17:00", location_preferences: [] },
          { day_of_week: 4, start_time: "07:00", end_time: "17:00", location_preferences: [] },
          { day_of_week: 5, start_time: "07:00", end_time: "17:00", location_preferences: [] },
        ],
      })
    );

    // 10 sessions per day, Mon-Fri = 50 sessions
    const sessions: SchedulingSession[] = [];
    const days = ["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20"];
    const times = ["08:00", "08:45", "09:30", "10:15", "11:00", "11:45", "12:30", "13:15", "14:00", "14:45"];

    for (const day of days) {
      for (let t = 0; t < times.length; t++) {
        sessions.push(
          makeSession({
            id: `session-${day}-${t}`,
            date: day,
            time: times[t],
            centre_id: `centre-${t % 3}`,
          })
        );
      }
    }

    const centres = new Map<string, SchedulingCentre>();
    for (let i = 0; i < 3; i++) {
      centres.set(`centre-${i}`, makeCentre({
        id: `centre-${i}`,
        name: `Centre ${i}`,
        latitude: -33.9 + i * 0.01,
        longitude: 151.0 + i * 0.01,
      }));
    }

    const input = makeInput({ sessions, coaches, centres });

    const start = performance.now();
    const results = generateRoster(input);
    const duration = performance.now() - start;

    expect(results).toHaveLength(50);
    expect(duration).toBeLessThan(2000);
  });
});
