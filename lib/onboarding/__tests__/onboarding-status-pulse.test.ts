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

import { getOnboardingStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getOnboardingStatusPulse fans out across:
//   1. checklists.head.eq(status,"in_progress")                        → inProgressCount
//   2. checklists.head.eq(status,"in_progress").lt(started_at, -14d)    → behindScheduleCount
//   3. checklists.head.eq(status,"completed").gte(completed_at, monday) → completedThisWeekCount
//   4. emails.head.is(sent_at, null).is(error_text, null)               → waitingOnEmailCount
//
// Each call uses a different chain shape, so we route by counting
// calls to the same table (checklists is called three times).
// ============================================================

interface PulseFixture {
  inProgress?: number;
  behindSchedule?: number;
  completedThisWeek?: number;
  waitingOnEmail?: number;
}

function installFixture(opts: PulseFixture) {
  const inProgress = opts.inProgress ?? 0;
  const behindSchedule = opts.behindSchedule ?? 0;
  const completedThisWeek = opts.completedThisWeek ?? 0;
  const waitingOnEmail = opts.waitingOnEmail ?? 0;

  let checklistsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centre_onboarding_checklists") {
      checklistsCall += 1;
      const idx = checklistsCall;
      return {
        select: () => {
          if (idx === 1) {
            // .eq("status","in_progress") only
            return {
              eq: () =>
                Promise.resolve({
                  count: inProgress,
                  data: null,
                  error: null,
                }),
            };
          }
          if (idx === 2) {
            // .eq("status","in_progress").lt("started_at", iso)
            return {
              eq: () => ({
                lt: () =>
                  Promise.resolve({
                    count: behindSchedule,
                    data: null,
                    error: null,
                  }),
              }),
            };
          }
          // call 3 — completed this week
          return {
            eq: () => ({
              gte: () =>
                Promise.resolve({
                  count: completedThisWeek,
                  data: null,
                  error: null,
                }),
            }),
          };
        },
      };
    }

    if (table === "centre_onboarding_emails") {
      return {
        select: () => ({
          is: () => ({
            is: () =>
              Promise.resolve({
                count: waitingOnEmail,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe("getOnboardingStatusPulse", () => {
  it("returns clean zeros when nothing is in flight", async () => {
    installFixture({});
    const pulse = await getOnboardingStatusPulse();
    expect(pulse).toEqual({
      inProgressCount: 0,
      behindScheduleCount: 0,
      completedThisWeekCount: 0,
      waitingOnEmailCount: 0,
    });
  });

  it("passes the in-progress count through", async () => {
    installFixture({ inProgress: 5 });
    const pulse = await getOnboardingStatusPulse();
    expect(pulse.inProgressCount).toBe(5);
  });

  it("passes the behind-schedule (>14d) count through", async () => {
    installFixture({ inProgress: 5, behindSchedule: 2 });
    const pulse = await getOnboardingStatusPulse();
    expect(pulse.behindScheduleCount).toBe(2);
  });

  it("passes the completed-this-week count through", async () => {
    installFixture({ completedThisWeek: 3 });
    const pulse = await getOnboardingStatusPulse();
    expect(pulse.completedThisWeekCount).toBe(3);
  });

  it("passes the waiting-on-email count through", async () => {
    installFixture({ waitingOnEmail: 4 });
    const pulse = await getOnboardingStatusPulse();
    expect(pulse.waitingOnEmailCount).toBe(4);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getOnboardingStatusPulse();
    expect(pulse).toEqual({
      inProgressCount: 0,
      behindScheduleCount: 0,
      completedThisWeekCount: 0,
      waitingOnEmailCount: 0,
    });
  });
});
