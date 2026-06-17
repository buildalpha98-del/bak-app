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

import { getCampaignsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// Fan-out:
//   1. reengagement_campaigns head count where status='active'
//   2. reengagement_sends head count where triggered_at >= Monday
//   3. reengagement_sends head count where status='pending'
//   4. discount_codes head count where used=false AND expires_at
//      between now and 14d-out

interface PulseFixture {
  activeCampaignsCount?: number;
  sendsThisWeekCount?: number;
  unsentCount?: number;
  expiringDiscountCodesCount?: number;
}

function installFixture(opts: PulseFixture) {
  const activeCampaignsCount = opts.activeCampaignsCount ?? 0;
  const sendsThisWeekCount = opts.sendsThisWeekCount ?? 0;
  const unsentCount = opts.unsentCount ?? 0;
  const expiringDiscountCodesCount = opts.expiringDiscountCodesCount ?? 0;

  let sendsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "reengagement_campaigns") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () =>
            Promise.resolve({
              count: opts2?.head ? activeCampaignsCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "reengagement_sends") {
      sendsCall += 1;
      // Call #1 — sends-this-week uses .gte("triggered_at", monday)
      if (sendsCall === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? sendsThisWeekCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      // Call #2 — unsent uses .eq("status","pending")
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () =>
            Promise.resolve({
              count: opts2?.head ? unsentCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "discount_codes") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          eq: () => ({
            gte: () => ({
              lte: () =>
                Promise.resolve({
                  count: opts2?.head ? expiringDiscountCodesCount : 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getCampaignsStatusPulse", () => {
  it("returns clean zeros on a fresh org", async () => {
    installFixture({});
    const pulse = await getCampaignsStatusPulse();
    expect(pulse).toEqual({
      activeCampaignsCount: 0,
      sendsThisWeekCount: 0,
      unsentCount: 0,
      expiringDiscountCodesCount: 0,
    });
  });

  it("passes active campaigns through", async () => {
    installFixture({ activeCampaignsCount: 3 });
    const pulse = await getCampaignsStatusPulse();
    expect(pulse.activeCampaignsCount).toBe(3);
  });

  it("passes sends-this-week through", async () => {
    installFixture({ sendsThisWeekCount: 42 });
    const pulse = await getCampaignsStatusPulse();
    expect(pulse.sendsThisWeekCount).toBe(42);
  });

  it("passes unsent through", async () => {
    installFixture({ unsentCount: 8 });
    const pulse = await getCampaignsStatusPulse();
    expect(pulse.unsentCount).toBe(8);
  });

  it("passes expiring discount codes through", async () => {
    installFixture({ expiringDiscountCodesCount: 5 });
    const pulse = await getCampaignsStatusPulse();
    expect(pulse.expiringDiscountCodesCount).toBe(5);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getCampaignsStatusPulse();
    expect(pulse).toEqual({
      activeCampaignsCount: 0,
      sendsThisWeekCount: 0,
      unsentCount: 0,
      expiringDiscountCodesCount: 0,
    });
  });
});
