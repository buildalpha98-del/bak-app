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

import {
  getCoachFormsPulse,
  getCoachTrainingPulse,
  getCoachMessagesPulse,
  getCoachAnnouncementsPulse,
  getCoachNotificationsPulse,
} from "../page-pulses";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getCoachFormsPulse exercises three families:
//   1. sessions (past completed)   .eq.eq.lt.order.limit
//   2. sessions (today)            .eq.eq
//   3. form_submissions head       .eq.gte
//   then form_submissions .in.eq to subtract submitted ids
// ============================================================

describe("getCoachFormsPulse", () => {
  it("returns clean zeros on a quiet day", async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "sessions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                lt: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "form_submissions") {
        return {
          select: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
                  count: 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const pulse = await getCoachFormsPulse("coach-1");
    expect(pulse).toEqual({
      overdueCount: 0,
      dueTodayCount: 0,
      completedThisWeekCount: 0,
    });
  });

  it("counts past completed sessions without submissions as overdue", async () => {
    let sessionsCallIdx = 0;

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "sessions") {
        sessionsCallIdx += 1;
        if (sessionsCallIdx === 1) {
          // past completed sessions
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  lt: () => ({
                    order: () => ({
                      limit: () =>
                        Promise.resolve({
                          data: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        // today sessions
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  data: [{ id: "t1", status: "confirmed" }],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "form_submissions") {
        // weekly head count followed by .in lookup
        return {
          select: (
            _cols: string,
            opts?: { count?: string; head?: boolean },
          ) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  gte: () =>
                    Promise.resolve({
                      count: 5,
                      data: null,
                      error: null,
                    }),
                }),
              };
            }
            return {
              in: () => ({
                eq: () =>
                  Promise.resolve({
                    data: [{ session_id: "s2" }],
                    error: null,
                  }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const pulse = await getCoachFormsPulse("coach-1");
    // s1, s3 are overdue (s2 is submitted). t1 is due-today (no submission).
    expect(pulse.overdueCount).toBe(2);
    expect(pulse.dueTodayCount).toBe(1);
    expect(pulse.completedThisWeekCount).toBe(5);
  });

  it("swallows errors to zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCoachFormsPulse("coach-1");
    expect(pulse).toEqual({
      overdueCount: 0,
      dueTodayCount: 0,
      completedThisWeekCount: 0,
    });
  });
});

// ============================================================
// getCoachTrainingPulse — four head counts on training_assignments
// (overdue / due-soon / new) + training_completions head.
// ============================================================

describe("getCoachTrainingPulse", () => {
  it("propagates the four head counts independently", async () => {
    let assignmentsCallIdx = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "training_assignments") {
        assignmentsCallIdx += 1;
        const idx = assignmentsCallIdx;
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                lt: () =>
                  Promise.resolve({
                    count: idx === 1 ? 3 : 0,
                    data: null,
                    error: null,
                  }),
                gte: () => ({
                  lte: () =>
                    Promise.resolve({
                      count: idx === 2 ? 2 : 0,
                      data: null,
                      error: null,
                    }),
                }),
              }),
              eq: () => ({
                gte: () =>
                  Promise.resolve({
                    count: idx === 3 ? 1 : 0,
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "training_completions") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ count: 9, data: null, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const pulse = await getCoachTrainingPulse("coach-1");
    expect(pulse).toEqual({
      overdueCount: 3,
      dueSoonCount: 2,
      newCount: 1,
      completedCount: 9,
    });
  });

  it("swallows errors to zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCoachTrainingPulse("coach-1");
    expect(pulse).toEqual({
      overdueCount: 0,
      dueSoonCount: 0,
      newCount: 0,
      completedCount: 0,
    });
  });
});

// ============================================================
// getCoachMessagesPulse + getCoachNotificationsPulse — simple
// head counts; one fixture covers both shapes.
// ============================================================

describe("getCoachMessagesPulse + getCoachNotificationsPulse", () => {
  it("passes unread and today-window counts through (messages)", async () => {
    let directMessagesCallIdx = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== "direct_messages") {
        throw new Error(`unexpected table ${table}`);
      }
      directMessagesCallIdx += 1;
      const idx = directMessagesCallIdx;
      return {
        select: () => ({
          eq: () => ({
            is: () =>
              Promise.resolve({
                count: idx === 1 ? 4 : 0,
                data: null,
                error: null,
              }),
            gte: () =>
              Promise.resolve({
                count: idx === 2 ? 2 : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    });

    const pulse = await getCoachMessagesPulse("coach-1");
    expect(pulse).toEqual({ unreadCount: 4, todayCount: 2 });
  });

  it("passes urgent and important counts through (notifications)", async () => {
    let notificationsCallIdx = 0;
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== "notifications") {
        throw new Error(`unexpected table ${table}`);
      }
      notificationsCallIdx += 1;
      const idx = notificationsCallIdx;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () =>
                Promise.resolve({
                  count: idx === 1 ? 1 : 3,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    });

    const pulse = await getCoachNotificationsPulse("coach-1");
    expect(pulse).toEqual({ urgentCount: 1, importantCount: 3 });
  });
});

// ============================================================
// getCoachAnnouncementsPulse — unread/this-week derived from a
// single fetch with announcement_reads left-join.
// ============================================================

describe("getCoachAnnouncementsPulse", () => {
  it("counts unread (no read marker for me) and this-week buckets", async () => {
    const farPast = "2020-01-01T00:00:00Z";
    const futureish = new Date(
      Date.now() + 86_400 * 1000,
    ).toISOString();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== "announcements") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "a1",
                      created_at: futureish,
                      announcement_reads: [],
                    },
                    {
                      id: "a2",
                      created_at: futureish,
                      announcement_reads: [{ user_id: "coach-1" }],
                    },
                    {
                      id: "a3",
                      created_at: farPast,
                      announcement_reads: [],
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      };
    });

    const pulse = await getCoachAnnouncementsPulse("coach-1");
    // a1 + a3 are unread; a1 + a2 are this-week (futureish > weekStart),
    // a3 is in the far past so not this-week.
    expect(pulse.unreadCount).toBe(2);
    expect(pulse.thisWeekCount).toBe(2);
  });

  it("swallows errors to zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCoachAnnouncementsPulse("coach-1");
    expect(pulse).toEqual({ unreadCount: 0, thisWeekCount: 0 });
  });
});
