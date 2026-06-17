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
  getCoachStatusPulse,
  getCoachSchedulePulse,
} from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getCoachStatusPulse exercises four DB families:
//   1. sessions .eq(coach_id, me).eq(date, today).neq(status,'cancelled') head
//   2. sessions .eq(coach_id, me).eq(status,'pending_confirmation') head
//   3. sessions .eq(coach_id, me).eq(status,'completed').lt(date, today)
//        .order .limit  → returns ids → then form_submissions lookup
//   4. announcements .in(audience,…).order().limit() → manual unread filter
// ============================================================

interface PulseFixture {
  shiftsTodayCount?: number;
  shiftsToConfirmCount?: number;
  /** Past completed sessions returned. */
  completedSessions?: string[];
  /** Of those, which already have form_submissions by me. */
  submittedSessions?: string[];
  /** Announcements with the user's read marker present. */
  announcements?: Array<{ id: string; isRead: boolean }>;
  coachId?: string;
}

function installFixture(opts: PulseFixture = {}) {
  const shiftsTodayCount = opts.shiftsTodayCount ?? 0;
  const shiftsToConfirmCount = opts.shiftsToConfirmCount ?? 0;
  const completedSessions = opts.completedSessions ?? [];
  const submittedSessions = new Set(opts.submittedSessions ?? []);
  const announcements = opts.announcements ?? [];
  const coachId = opts.coachId ?? "coach-1";

  let sessionsCallIdx = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "sessions") {
      sessionsCallIdx += 1;
      const idx = sessionsCallIdx;

      return {
        select: () => {
          if (idx === 1) {
            return {
              eq: () => ({
                eq: () => ({
                  neq: () =>
                    Promise.resolve({
                      count: shiftsTodayCount,
                      data: null,
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (idx === 2) {
            return {
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    count: shiftsToConfirmCount,
                    data: null,
                    error: null,
                  }),
              }),
            };
          }
          // call 3 — past completed sessions returning ids
          return {
            eq: () => ({
              eq: () => ({
                lt: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: completedSessions.map((id) => ({ id })),
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        },
      };
    }
    if (table === "announcements") {
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: announcements.map((a) => ({
                    id: a.id,
                    announcement_reads: a.isRead
                      ? [{ user_id: coachId }]
                      : [],
                  })),
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "form_submissions") {
      return {
        select: () => ({
          in: () => ({
            eq: () =>
              Promise.resolve({
                data: [...submittedSessions].map((id) => ({
                  session_id: id,
                })),
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getCoachStatusPulse", () => {
  it("returns clean zeros on a quiet day", async () => {
    installFixture({});
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse).toEqual({
      shiftsTodayCount: 0,
      shiftsToConfirmCount: 0,
      overdueFormsCount: 0,
      unreadAnnouncementsCount: 0,
    });
  });

  it("passes through shifts-today and shifts-to-confirm counts", async () => {
    installFixture({
      shiftsTodayCount: 2,
      shiftsToConfirmCount: 4,
    });
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse.shiftsTodayCount).toBe(2);
    expect(pulse.shiftsToConfirmCount).toBe(4);
  });

  it("counts completed sessions without a form submission as overdue", async () => {
    installFixture({
      completedSessions: ["s1", "s2", "s3"],
      submittedSessions: ["s2"],
    });
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse.overdueFormsCount).toBe(2);
  });

  it("counts zero overdue forms when every completed session has a submission", async () => {
    installFixture({
      completedSessions: ["s1", "s2"],
      submittedSessions: ["s1", "s2"],
    });
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse.overdueFormsCount).toBe(0);
  });

  it("counts announcements without a user read marker as unread", async () => {
    installFixture({
      announcements: [
        { id: "a1", isRead: false },
        { id: "a2", isRead: true },
        { id: "a3", isRead: false },
      ],
    });
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse.unreadAnnouncementsCount).toBe(2);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCoachStatusPulse("coach-1");
    expect(pulse).toEqual({
      shiftsTodayCount: 0,
      shiftsToConfirmCount: 0,
      overdueFormsCount: 0,
      unreadAnnouncementsCount: 0,
    });
  });
});

// ============================================================
// getCoachSchedulePulse: three single-shot sessions head counts.
// ============================================================

interface SchedulePulseFixture {
  todayCount?: number;
  toConfirmCount?: number;
  pastUnconfirmedCount?: number;
}

function installScheduleFixture(opts: SchedulePulseFixture = {}) {
  const todayCount = opts.todayCount ?? 0;
  const toConfirmCount = opts.toConfirmCount ?? 0;
  const pastUnconfirmedCount = opts.pastUnconfirmedCount ?? 0;
  let sessionsCallIdx = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "sessions") {
      throw new Error(`unexpected table ${table}`);
    }
    sessionsCallIdx += 1;
    const idx = sessionsCallIdx;
    return {
      select: () => {
        if (idx === 1) {
          return {
            eq: () => ({
              eq: () => ({
                neq: () =>
                  Promise.resolve({
                    count: todayCount,
                    data: null,
                    error: null,
                  }),
              }),
            }),
          };
        }
        if (idx === 2) {
          return {
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  count: toConfirmCount,
                  data: null,
                  error: null,
                }),
            }),
          };
        }
        // call 3 — past unconfirmed with .lt(date)
        return {
          eq: () => ({
            eq: () => ({
              lt: () =>
                Promise.resolve({
                  count: pastUnconfirmedCount,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      },
    };
  });
}

describe("getCoachSchedulePulse", () => {
  it("returns clean zeros when nothing is happening", async () => {
    installScheduleFixture({});
    const pulse = await getCoachSchedulePulse("coach-1");
    expect(pulse).toEqual({
      todayCount: 0,
      toConfirmCount: 0,
      pastUnconfirmedCount: 0,
    });
  });

  it("propagates each of the three counts independently", async () => {
    installScheduleFixture({
      todayCount: 3,
      toConfirmCount: 1,
      pastUnconfirmedCount: 2,
    });
    const pulse = await getCoachSchedulePulse("coach-1");
    expect(pulse).toEqual({
      todayCount: 3,
      toConfirmCount: 1,
      pastUnconfirmedCount: 2,
    });
  });

  it("swallows errors to zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCoachSchedulePulse("coach-1");
    expect(pulse).toEqual({
      todayCount: 0,
      toConfirmCount: 0,
      pastUnconfirmedCount: 0,
    });
  });
});
