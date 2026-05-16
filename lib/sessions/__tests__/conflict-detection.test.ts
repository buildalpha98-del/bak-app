import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { detectCoachClashes } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockSessionCoaches(
  rows: Array<{
    user_id: string;
    sessions: {
      id: string;
      date: string;
      time: string;
      duration_minutes: number;
      status: string;
    } | null;
  }>,
) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "session_coaches") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select: () => ({
        in: () => Promise.resolve({ data: rows, error: null }),
      }),
    };
  });
}

describe("detectCoachClashes", () => {
  it("returns an empty set when coachIds is empty (short-circuits the DB call)", async () => {
    const result = await detectCoachClashes({
      coachIds: [],
      date: "2026-06-01",
      time: "09:00:00",
      durationMinutes: 60,
    });
    expect(result.clashCoaches.size).toBe(0);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it("detects overlap when a coach is primary on one shift and secondary on another", async () => {
    // P5: a coach can be primary on shift A and secondary on shift B.
    // The session_coaches read picks up both rows for that coach.
    mockSessionCoaches([
      {
        user_id: "u1",
        sessions: {
          id: "A",
          date: "2026-06-01",
          time: "09:00:00",
          duration_minutes: 60,
          status: "published",
        },
      },
      {
        user_id: "u1",
        sessions: {
          id: "B",
          date: "2026-06-01",
          time: "09:30:00",
          duration_minutes: 60,
          status: "published",
        },
      },
    ]);

    // Candidate window (09:15–10:15) overlaps both existing shifts.
    const result = await detectCoachClashes({
      coachIds: ["u1"],
      date: "2026-06-01",
      time: "09:15:00",
      durationMinutes: 60,
    });
    expect(Array.from(result.clashCoaches)).toContain("u1");
  });

  it("ignores cancelled overlapping rows", async () => {
    mockSessionCoaches([
      {
        user_id: "u1",
        sessions: {
          id: "A",
          date: "2026-06-01",
          time: "09:00:00",
          duration_minutes: 60,
          status: "cancelled",
        },
      },
    ]);

    const result = await detectCoachClashes({
      coachIds: ["u1"],
      date: "2026-06-01",
      time: "09:30:00",
      durationMinutes: 60,
    });
    expect(Array.from(result.clashCoaches)).not.toContain("u1");
  });

  it("ignores rows on a different date", async () => {
    mockSessionCoaches([
      {
        user_id: "u1",
        sessions: {
          id: "A",
          date: "2026-06-02",
          time: "09:00:00",
          duration_minutes: 60,
          status: "published",
        },
      },
    ]);

    const result = await detectCoachClashes({
      coachIds: ["u1"],
      date: "2026-06-01",
      time: "09:00:00",
      durationMinutes: 60,
    });
    expect(result.clashCoaches.size).toBe(0);
  });

  it("ignores the candidate's own session id when excludeSessionId is passed", async () => {
    // Same coach, same shift — must not self-clash when re-assigning.
    mockSessionCoaches([
      {
        user_id: "u1",
        sessions: {
          id: "candidate",
          date: "2026-06-01",
          time: "09:00:00",
          duration_minutes: 60,
          status: "published",
        },
      },
    ]);

    const result = await detectCoachClashes({
      coachIds: ["u1"],
      date: "2026-06-01",
      time: "09:00:00",
      durationMinutes: 60,
      excludeSessionId: "candidate",
    });
    expect(result.clashCoaches.size).toBe(0);
  });

  it("does not flag back-to-back shifts (end == start)", async () => {
    mockSessionCoaches([
      {
        user_id: "u1",
        sessions: {
          id: "A",
          date: "2026-06-01",
          time: "09:00:00",
          duration_minutes: 60,
          status: "published",
        },
      },
    ]);

    // Candidate starts exactly when the existing shift ends → no overlap.
    const result = await detectCoachClashes({
      coachIds: ["u1"],
      date: "2026-06-01",
      time: "10:00:00",
      durationMinutes: 60,
    });
    expect(result.clashCoaches.size).toBe(0);
  });
});
