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

import { getFeedbackStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table mock routing
// ============================================================
//
// The action fans out 4 calls all to `feedback_ratings`, distinguished
// only by the chain shape:
//   1. .gte("submitted_at", monday)              — new-this-week
//   2. .eq("rating", 1).not(...).is("ack_at",..) — 1-star unack
//   3. .eq("rating", 5).not(...).is("ack_at",..) — 5-star unack
//   4. .is("submitted_at", null).lt("created_at" — no-response 24h+
//
// We route by call index since they all touch the same table.

interface PulseFixture {
  newThisWeek?: number;
  oneStarUnack?: number;
  fiveStarUnack?: number;
  noResponse?: number;
}

function installFixture(opts: PulseFixture) {
  const newThisWeek = opts.newThisWeek ?? 0;
  const oneStarUnack = opts.oneStarUnack ?? 0;
  const fiveStarUnack = opts.fiveStarUnack ?? 0;
  const noResponse = opts.noResponse ?? 0;

  let call = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "feedback_ratings") {
      throw new Error(`unexpected table ${table}`);
    }
    call += 1;
    // (1) head + .gte("submitted_at", monday)
    if (call === 1) {
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              count: newThisWeek,
              data: null,
              error: null,
            }),
        }),
      };
    }
    // (2) .eq("rating",1).not("submitted_at"...).is("acknowledged_at",null)
    if (call === 2) {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              is: () =>
                Promise.resolve({
                  count: oneStarUnack,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    // (3) same shape as (2) but rating=5
    if (call === 3) {
      return {
        select: () => ({
          eq: () => ({
            not: () => ({
              is: () =>
                Promise.resolve({
                  count: fiveStarUnack,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    // (4) .is("submitted_at",null).lt("created_at",...)
    return {
      select: () => ({
        is: () => ({
          lt: () =>
            Promise.resolve({
              count: noResponse,
              data: null,
              error: null,
            }),
        }),
      }),
    };
  });
}

// ============================================================
// Cases
// ============================================================

describe("getFeedbackStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getFeedbackStatusPulse();
    expect(pulse).toEqual({
      newThisWeekCount: 0,
      oneStarUnackCount: 0,
      fiveStarUnackCount: 0,
      noResponseCount: 0,
    });
  });

  it("passes the new-this-week head count through", async () => {
    installFixture({ newThisWeek: 12 });
    const pulse = await getFeedbackStatusPulse();
    expect(pulse.newThisWeekCount).toBe(12);
  });

  it("passes the 1-star unacknowledged head count through", async () => {
    installFixture({ oneStarUnack: 3 });
    const pulse = await getFeedbackStatusPulse();
    expect(pulse.oneStarUnackCount).toBe(3);
  });

  it("passes the 5-star unacknowledged head count through", async () => {
    installFixture({ fiveStarUnack: 8 });
    const pulse = await getFeedbackStatusPulse();
    expect(pulse.fiveStarUnackCount).toBe(8);
  });

  it("passes the no-response (24h+) head count through", async () => {
    installFixture({ noResponse: 5 });
    const pulse = await getFeedbackStatusPulse();
    expect(pulse.noResponseCount).toBe(5);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getFeedbackStatusPulse();
    expect(pulse).toEqual({
      newThisWeekCount: 0,
      oneStarUnackCount: 0,
      fiveStarUnackCount: 0,
      noResponseCount: 0,
    });
  });
});
