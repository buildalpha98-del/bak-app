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

import { getAnalyticsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Two queries against `revenue_forecasts`:
//   1. latest forecast_date     .order().limit(1).maybeSingle()
//   2. monthly rows for that date
// ============================================================

interface PulseFixture {
  latestDate?: string | null;
  monthly?: Array<{
    period_start: string;
    total_projected_revenue: number;
    committed_revenue: number;
    projected_profit: number;
  }>;
}

function installFixture(opts: PulseFixture = {}) {
  let revenueForecastsCall = 0;
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "revenue_forecasts") {
      throw new Error(`unexpected table ${table}`);
    }
    revenueForecastsCall += 1;
    if (revenueForecastsCall === 1) {
      // latest forecast_date
      return {
        select: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data:
                    opts.latestDate !== undefined
                      ? opts.latestDate === null
                        ? null
                        : { forecast_date: opts.latestDate }
                      : null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    // monthly forecasts query — .eq().eq().order()
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () =>
              Promise.resolve({ data: opts.monthly ?? [], error: null }),
          }),
        }),
      }),
    };
  });
}

describe("getAnalyticsStatusPulse", () => {
  it("returns clean zeros when no forecasts exist (shape check)", async () => {
    installFixture({ latestDate: null });
    const pulse = await getAnalyticsStatusPulse();
    expect(pulse).toEqual({
      forecastStaleDays: 0,
      forecastIsStale: false,
      overperformingMonthsCount: 0,
      negativeMarginMonthsCount: 0,
      monthsAheadGenerated: 0,
    });
  });

  it("flags a >=7-day-old forecast as stale", async () => {
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    installFixture({ latestDate: eightDaysAgo.toISOString() });
    const pulse = await getAnalyticsStatusPulse();
    expect(pulse.forecastIsStale).toBe(true);
    expect(pulse.forecastStaleDays).toBeGreaterThanOrEqual(7);
  });

  it("does NOT flag a fresh (1-day-old) forecast as stale", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    installFixture({ latestDate: yesterday.toISOString() });
    const pulse = await getAnalyticsStatusPulse();
    expect(pulse.forecastIsStale).toBe(false);
  });

  it("counts negative-margin months and overperforming months", async () => {
    installFixture({
      latestDate: new Date().toISOString(),
      monthly: [
        // Loss month
        {
          period_start: "2026-06-01",
          total_projected_revenue: 10000,
          committed_revenue: 5000,
          projected_profit: -2000,
        },
        // Overperforming: committed > 1.1 × total
        {
          period_start: "2026-07-01",
          total_projected_revenue: 1000,
          committed_revenue: 2000,
          projected_profit: 500,
        },
        // Normal
        {
          period_start: "2026-08-01",
          total_projected_revenue: 5000,
          committed_revenue: 3000,
          projected_profit: 1000,
        },
      ],
    });
    const pulse = await getAnalyticsStatusPulse();
    expect(pulse.negativeMarginMonthsCount).toBe(1);
    expect(pulse.overperformingMonthsCount).toBe(1);
    expect(pulse.monthsAheadGenerated).toBe(3);
  });

  it("swallows thrown errors and returns zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getAnalyticsStatusPulse();
    expect(pulse).toEqual({
      forecastStaleDays: 0,
      forecastIsStale: false,
      overperformingMonthsCount: 0,
      negativeMarginMonthsCount: 0,
      monthsAheadGenerated: 0,
    });
  });
});
