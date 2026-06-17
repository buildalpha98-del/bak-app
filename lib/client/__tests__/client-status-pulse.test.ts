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

import { getClientStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getClientStatusPulse(centreId) fans out 4 queries:
//   1. sessions.select(date).eq(centre).gte(date,today).in(status,…)
//      .order().order().limit(1).maybeSingle()                 → nextSession
//   2. centre_reports.head.eq(centre).eq(status,sent).gte(sent_at,-14d) → reports
//   3. outbound_invoices.head.eq(centre).in(status,[…])                 → invoices
//   4. feedback_ratings.head.eq(centre).gte(submitted_at,-90d)          → feedback
// ============================================================

interface PulseFixture {
  nextSessionDate?: string | null;
  unreadReports?: number;
  unpaidInvoices?: number;
  newFeedback?: number;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function installFixture(opts: PulseFixture) {
  const sessionDate = opts.nextSessionDate ?? null;
  const reports = opts.unreadReports ?? 0;
  const invoices = opts.unpaidInvoices ?? 0;
  const feedback = opts.newFeedback ?? 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              in: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: () =>
                        Promise.resolve({
                          data: sessionDate ? { date: sessionDate } : null,
                          error: null,
                        }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "centre_reports") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({ count: reports, data: null, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "outbound_invoices") {
      return {
        select: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({ count: invoices, data: null, error: null }),
          }),
        }),
      };
    }
    if (table === "feedback_ratings") {
      return {
        select: () => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({ count: feedback, data: null, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getClientStatusPulse", () => {
  it("returns calm zeros when nothing is on", async () => {
    installFixture({});
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse).toEqual({
      nextSessionDays: null,
      unreadReportsCount: 0,
      unpaidInvoicesCount: 0,
      newFeedbackThisTermCount: 0,
    });
  });

  it("computes days-until-next-session for a future date", async () => {
    installFixture({ nextSessionDate: todayPlus(3) });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse.nextSessionDays).toBe(3);
  });

  it("reports same-day session as 0 days", async () => {
    installFixture({ nextSessionDate: todayPlus(0) });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse.nextSessionDays).toBe(0);
  });

  it("passes unread reports count through", async () => {
    installFixture({ unreadReports: 2 });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse.unreadReportsCount).toBe(2);
  });

  it("passes unpaid invoice count through", async () => {
    installFixture({ unpaidInvoices: 5 });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse.unpaidInvoicesCount).toBe(5);
  });

  it("passes new feedback count through", async () => {
    installFixture({ newFeedback: 7 });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse.newFeedbackThisTermCount).toBe(7);
  });

  it("swallows thrown errors and returns calm zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getClientStatusPulse("centre-1");
    expect(pulse).toEqual({
      nextSessionDays: null,
      unreadReportsCount: 0,
      unpaidInvoicesCount: 0,
      newFeedbackThisTermCount: 0,
    });
  });
});
