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

import { getMarketingStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// The action fans out per table:
//   1. approved_testimonials.select("feedback_rating_id") → pre-fetch
//      ids to exclude from the pending count
//   2. feedback_ratings head count (filtered + .not("id","in",...))
//   3. approved_testimonials head count where status='approved' and
//      approved_at >= Monday
//   4. public_stats_cache.select("calculated_at").order().limit().maybeSingle()
//   5. leads head count where source='web' AND created_at >= 7d-ago
// ============================================================

interface PulseFixture {
  approvedFeedbackIds?: string[];
  pendingCount?: number;
  approvedThisWeekCount?: number;
  cacheCalculatedAt?: string | null;
  webEnquiriesCount?: number;
}

function installFixture(opts: PulseFixture) {
  const approvedFeedbackIds = opts.approvedFeedbackIds ?? [];
  const pendingCount = opts.pendingCount ?? 0;
  const approvedThisWeekCount = opts.approvedThisWeekCount ?? 0;
  const cacheCalculatedAt = opts.cacheCalculatedAt;
  const webEnquiriesCount = opts.webEnquiriesCount ?? 0;

  let testimonialsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "approved_testimonials") {
      testimonialsCall += 1;
      if (testimonialsCall === 1) {
        // Pre-fetch: select("feedback_rating_id")
        return {
          select: () =>
            Promise.resolve({
              data: approvedFeedbackIds.map((id) => ({
                feedback_rating_id: id,
              })),
              error: null,
            }),
        };
      }
      // Head count: select(id, count, head).eq("status","approved").gte("approved_at",monday)
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? approvedThisWeekCount : 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "feedback_ratings") {
      // Head count chain: .gte().not().not() optionally .not(id, in, ids)
      const headPromise = Promise.resolve({
        count: pendingCount,
        data: null,
        error: null,
      });
      type Chain = Promise<unknown> & {
        gte: () => Chain;
        not: () => Chain;
      };
      function makeChain(): Chain {
        const p = Promise.resolve({
          count: pendingCount,
          data: null,
          error: null,
        }) as Chain;
        // Use Object.defineProperty to attach chainable methods
        // without breaking the await behaviour.
        p.gte = makeChain;
        p.not = makeChain;
        return p;
      }
      return {
        select: () => makeChain(),
      };
    }
    if (table === "public_stats_cache") {
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    cacheCalculatedAt === undefined
                      ? null
                      : { calculated_at: cacheCalculatedAt },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "leads") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? webEnquiriesCount : 0,
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

describe("getMarketingStatusPulse", () => {
  it("returns clean zeros on a fresh org (no cache row)", async () => {
    installFixture({ cacheCalculatedAt: undefined });
    const pulse = await getMarketingStatusPulse();
    expect(pulse).toEqual({
      pendingTestimonialsCount: 0,
      approvedThisWeekCount: 0,
      // No cache row at all → stale = 1.
      staleCacheCount: 1,
      webEnquiriesCount: 0,
    });
  });

  it("passes the pending count through", async () => {
    installFixture({ pendingCount: 5, cacheCalculatedAt: null });
    const pulse = await getMarketingStatusPulse();
    expect(pulse.pendingTestimonialsCount).toBe(5);
  });

  it("passes the approved-this-week count through", async () => {
    installFixture({
      approvedThisWeekCount: 3,
      cacheCalculatedAt: new Date().toISOString(),
    });
    const pulse = await getMarketingStatusPulse();
    expect(pulse.approvedThisWeekCount).toBe(3);
  });

  it("flags stale cache when > 24h old", async () => {
    const twoDaysAgo = new Date(
      Date.now() - 48 * 60 * 60 * 1000
    ).toISOString();
    installFixture({ cacheCalculatedAt: twoDaysAgo });
    const pulse = await getMarketingStatusPulse();
    expect(pulse.staleCacheCount).toBe(1);
  });

  it("treats recent cache (< 24h) as fresh", async () => {
    const oneHourAgo = new Date(
      Date.now() - 1 * 60 * 60 * 1000
    ).toISOString();
    installFixture({ cacheCalculatedAt: oneHourAgo });
    const pulse = await getMarketingStatusPulse();
    expect(pulse.staleCacheCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getMarketingStatusPulse();
    expect(pulse).toEqual({
      pendingTestimonialsCount: 0,
      approvedThisWeekCount: 0,
      staleCacheCount: 0,
      webEnquiriesCount: 0,
    });
  });
});
