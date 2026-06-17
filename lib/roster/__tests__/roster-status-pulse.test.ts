import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted shared mocks — vi.mock factories are top-of-file hoisted so
// any state they capture has to live in vi.hoisted to be initialised
// in time. Pattern mirrors lib/centres/__tests__/centres-status-pulse.test.ts.
const { supabaseMock, financialMock, costProjectionMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  financialMock: vi.fn(),
  costProjectionMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/auth/financial-access", () => ({
  getFinancialAccess: financialMock,
}));
vi.mock("@/lib/roster/cost-actions", () => ({
  getWeekCostProjection: costProjectionMock,
}));

import { getRosterStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface MockOpts {
  draftsCount: number;
  unassignedCount: number;
  nonCancelledCount: number;
  /** When true, getFinancialAccess returns true. */
  hasFinancial?: boolean;
  /** When provided, getWeekCostProjection returns this totalCost. */
  projectedWage?: number | null;
}

/**
 * The action issues three separate head:true count queries against
 * `sessions`, plus a getFinancialAccess() call and (when financial is
 * true) a getWeekCostProjection() call. The mock returns the right
 * count for each call based on the chained filter shape.
 *
 * We tell the calls apart by tracking the chain — `eq("status","draft")`
 * for drafts, `.is("coach_id", null)` for unassigned, and the
 * `nonCancelled` count for the bare `.neq("status","cancelled")` path
 * with no .is() before it.
 */
function mockQueries(opts: MockOpts) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "sessions") throw new Error(`unexpected table ${table}`);
    // We return a builder that records what was called and resolves
    // to the right count when the chain ends.
    const state: {
      isCalled: boolean;
      eqStatus: string | null;
    } = { isCalled: false, eqStatus: null };

    const terminal = () => {
      if (state.eqStatus === "draft") {
        return Promise.resolve({
          data: null,
          count: opts.draftsCount,
          error: null,
        });
      }
      if (state.isCalled) {
        // .is("coach_id", null) → unassigned count
        return Promise.resolve({
          data: null,
          count: opts.unassignedCount,
          error: null,
        });
      }
      return Promise.resolve({
        data: null,
        count: opts.nonCancelledCount,
        error: null,
      });
    };

    const builder = {
      select: () => builder,
      gte: () => builder,
      lte: () => builder,
      eq: (col: string, val: string) => {
        if (col === "status") {
          state.eqStatus = val;
          // The drafts chain ENDS with .eq("status", "draft") — there's
          // no .neq() to terminate. Resolve here so `await` returns the
          // drafts count instead of the builder object.
          return terminal();
        }
        return builder;
      },
      neq: () => terminal(),
      is: () => {
        state.isCalled = true;
        return builder;
      },
    };
    return builder;
  });
}

describe("getRosterStatusPulse", () => {
  it("returns the expected shape with mocked Supabase", async () => {
    mockQueries({
      draftsCount: 3,
      unassignedCount: 2,
      nonCancelledCount: 10,
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    expect(pulse).toEqual({
      draftsCount: 3,
      unassignedCount: 2,
      // (10 − 2) / 10 = 0.8 → 80%
      coveragePercent: 80,
      projectedWage: null,
    });
  });

  it("rounds coverage to a whole percent", async () => {
    mockQueries({
      draftsCount: 0,
      unassignedCount: 1,
      nonCancelledCount: 3,
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    // (3 − 1) / 3 = 0.6666… → 67
    expect(pulse.coveragePercent).toBe(67);
  });

  it("reports 100% coverage when the week has no non-cancelled sessions", async () => {
    mockQueries({
      draftsCount: 0,
      unassignedCount: 0,
      nonCancelledCount: 0,
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    // A calm board is covered, not broken — guards against NaN.
    expect(pulse.coveragePercent).toBe(100);
  });

  it("returns null projectedWage when getFinancialAccess is false", async () => {
    mockQueries({
      draftsCount: 0,
      unassignedCount: 0,
      nonCancelledCount: 5,
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    expect(pulse.projectedWage).toBeNull();
    // And critically, we shouldn't have asked for the projection at all.
    expect(costProjectionMock).not.toHaveBeenCalled();
  });

  it("returns the projection total when getFinancialAccess is true", async () => {
    mockQueries({
      draftsCount: 1,
      unassignedCount: 0,
      nonCancelledCount: 4,
    });
    financialMock.mockResolvedValue(true);
    costProjectionMock.mockResolvedValue({
      data: { totalCost: 1234, totalHours: 12, pricedSessions: 4, unpricedSessions: 0, unassignedSessions: 0, byCoach: [] },
      error: null,
    });

    const pulse = await getRosterStatusPulse("2026-06-08");
    expect(pulse.projectedWage).toBe(1234);
    // 5-day projection — matches the Mon–Fri pulse scope.
    expect(costProjectionMock).toHaveBeenCalledWith("2026-06-08", 5);
  });

  it("derives drafts and unassigned counts independently", async () => {
    // High drafts, zero unassigned — the chip should reflect both.
    mockQueries({
      draftsCount: 7,
      unassignedCount: 0,
      nonCancelledCount: 7,
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    expect(pulse.draftsCount).toBe(7);
    expect(pulse.unassignedCount).toBe(0);
    expect(pulse.coveragePercent).toBe(100);
  });

  it("returns safe zeros on a thrown error rather than crashing the page", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    financialMock.mockResolvedValue(false);

    const pulse = await getRosterStatusPulse("2026-06-08");
    expect(pulse).toEqual({
      draftsCount: 0,
      unassignedCount: 0,
      coveragePercent: 100,
      projectedWage: null,
    });
  });
});
