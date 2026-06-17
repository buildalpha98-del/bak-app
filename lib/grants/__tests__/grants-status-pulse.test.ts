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

import { getGrantsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Four queries against `grant_applications`:
//   1. .eq("status","planning")                  HEAD     — awaiting
//   2. .eq("status","funded").gte().lte()        SELECT   — expiring rows
//   3. .eq("status","planning").lt("created_at") HEAD     — stale
//   4. .eq("status","approved").gte("approved_date") HEAD — approved this week
// ============================================================

interface PulseFixture {
  awaiting?: number;
  expiringRows?: Array<{
    amount_approved: number | null;
    amount_used: number | null;
  }>;
  stuck?: number;
  approvedThisWeek?: number;
}

function installFixture(opts: PulseFixture = {}) {
  let call = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "grant_applications") {
      throw new Error(`unexpected table ${table}`);
    }
    call += 1;
    // Call 1: planning head count — .eq("status", "planning")
    if (call === 1) {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              count: opts.awaiting ?? 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    // Call 2: expiring select — .eq().gte().lte()
    if (call === 2) {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  data: opts.expiringRows ?? [],
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    // Call 3: stale head count — .eq().lt("created_at")
    if (call === 3) {
      return {
        select: () => ({
          eq: () => ({
            lt: () =>
              Promise.resolve({
                count: opts.stuck ?? 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    // Call 4: approved this week — .eq().gte("approved_date")
    return {
      select: () => ({
        eq: () => ({
          gte: () =>
            Promise.resolve({
              count: opts.approvedThisWeek ?? 0,
              data: null,
              error: null,
            }),
        }),
      }),
    };
  });
}

describe("getGrantsStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture();
    const pulse = await getGrantsStatusPulse();
    expect(pulse).toEqual({
      awaitingSubmissionCount: 0,
      expiringSoonCount: 0,
      stuckInPlanningCount: 0,
      approvedThisWeekCount: 0,
    });
  });

  it("passes awaiting + stuck + approved-this-week head counts through", async () => {
    installFixture({ awaiting: 4, stuck: 2, approvedThisWeek: 1 });
    const pulse = await getGrantsStatusPulse();
    expect(pulse.awaitingSubmissionCount).toBe(4);
    expect(pulse.stuckInPlanningCount).toBe(2);
    expect(pulse.approvedThisWeekCount).toBe(1);
  });

  it("scopes expiring to rows with remaining balance > 0", async () => {
    installFixture({
      expiringRows: [
        { amount_approved: 1000, amount_used: 500 }, // 500 remaining — count
        { amount_approved: 1000, amount_used: 1000 }, // 0 remaining — skip
        { amount_approved: 2000, amount_used: 1500 }, // 500 remaining — count
      ],
    });
    const pulse = await getGrantsStatusPulse();
    expect(pulse.expiringSoonCount).toBe(2);
  });

  it("treats null amount_approved/used as zero (cautious cast)", async () => {
    installFixture({
      expiringRows: [{ amount_approved: null, amount_used: null }],
    });
    const pulse = await getGrantsStatusPulse();
    expect(pulse.expiringSoonCount).toBe(0);
  });

  it("swallows thrown errors and returns zeros (hard fail safety net)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getGrantsStatusPulse();
    expect(pulse).toEqual({
      awaitingSubmissionCount: 0,
      expiringSoonCount: 0,
      stuckInPlanningCount: 0,
      approvedThisWeekCount: 0,
    });
  });
});
