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

import { getClientPortalPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getClientPortalPulse fans out across:
//
//   1. terms.select().eq("status","active").single()       → activeTerm
//   2. centre_reports.head.eq(centre).eq(status,sent).gte(sent_at,termStart)  → reportsThisTerm
//   3. centre_reports.head.eq(centre).eq(status,sent).gte(sent_at,monday)     → reportsNewThisWeek
//   4. outbound_invoices.head.eq(centre).eq(status,overdue)                   → invoicesOverdue
//   5. outbound_invoices.head.eq(centre).in(status,[sent,partially_paid])     → invoicesUnpaid
//   6. outbound_invoices.head.eq(centre).eq(status,paid).gte(payment_date,…)  → invoicesPaidThisMonth
//   7. feedback_ratings.head.eq(centre).gte(submitted_at,…)                   → feedbackSubmitted
//   8. sessions.head.eq(centre).eq(status,completed).gte(date,…)              → completedRecent
//   9. documents.head.eq(visibility,all).in(category,…).gte(created_at,…)     → resourcesNew
//  10. documents.head.eq(visibility,all).eq(category,policy)                  → resourcesPolicies
//  11. centre_messages.head.eq(centre).eq(sender_type,staff).is(read_at,null) → messagesUnread
//
// Each chain shape is unique enough that we can route by call-count
// per-table.
// ============================================================

interface PortalFixture {
  reportsThisTerm?: number;
  reportsNewThisWeek?: number;
  invoicesOverdue?: number;
  invoicesUnpaid?: number;
  invoicesPaidThisMonth?: number;
  feedbackSubmitted?: number;
  completedRecent?: number;
  resourcesNew?: number;
  resourcesPolicies?: number;
  messagesUnread?: number;
}

function installFixture(opts: PortalFixture = {}) {
  let reportsCall = 0;
  let invoicesCall = 0;
  let documentsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "terms") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "term-1", start_date: "2026-01-01", end_date: "2026-12-31" },
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "centre_reports") {
      reportsCall += 1;
      const idx = reportsCall;
      const count = idx === 1 ? opts.reportsThisTerm ?? 0 : opts.reportsNewThisWeek ?? 0;
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({ count, data: null, error: null }),
            }),
          }),
        }),
      };
    }

    if (table === "outbound_invoices") {
      invoicesCall += 1;
      const idx = invoicesCall;
      if (idx === 1) {
        // .eq(centre).eq(status,overdue)
        return {
          select: () => ({
            eq: () => ({
              eq: () =>
                Promise.resolve({
                  count: opts.invoicesOverdue ?? 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (idx === 2) {
        // .eq(centre).in(status,[sent,partially_paid])
        return {
          select: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  count: opts.invoicesUnpaid ?? 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      // idx === 3 — .eq(centre).eq(status,paid).gte(payment_date,…)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
                  count: opts.invoicesPaidThisMonth ?? 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }

    if (table === "feedback_ratings") {
      return {
        select: () => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts.feedbackSubmitted ?? 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "sessions") {
      // .eq(centre).eq(status,completed).gte(date,…)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({
                  count: opts.completedRecent ?? 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }

    if (table === "documents") {
      documentsCall += 1;
      const idx = documentsCall;
      if (idx === 1) {
        // .eq(visibility,all).in(category,[…]).gte(created_at,…)
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                gte: () =>
                  Promise.resolve({
                    count: opts.resourcesNew ?? 0,
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      // idx === 2 — .eq(visibility,all).eq(category,policy)
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                count: opts.resourcesPolicies ?? 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "centre_messages") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () =>
                Promise.resolve({
                  count: opts.messagesUnread ?? 0,
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

describe("getClientPortalPulse", () => {
  it("returns calm zeros when nothing is on", async () => {
    installFixture({});
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse).toEqual({
      reportsThisTermCount: 0,
      reportsNewThisWeekCount: 0,
      invoicesOverdueCount: 0,
      invoicesUnpaidCount: 0,
      invoicesPaidThisMonthCount: 0,
      feedbackSubmittedThisTermCount: 0,
      feedbackPendingCount: 0,
      resourcesNewThisMonthCount: 0,
      resourcesPoliciesCount: 0,
      messagesUnreadCount: 0,
    });
  });

  it("passes invoices-overdue through", async () => {
    installFixture({ invoicesOverdue: 2 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.invoicesOverdueCount).toBe(2);
  });

  it("passes invoices-paid-this-month through", async () => {
    installFixture({ invoicesPaidThisMonth: 4 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.invoicesPaidThisMonthCount).toBe(4);
  });

  it("passes reports-new-this-week through", async () => {
    installFixture({ reportsNewThisWeek: 1, reportsThisTerm: 3 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.reportsNewThisWeekCount).toBe(1);
    expect(pulse.reportsThisTermCount).toBe(3);
  });

  it("computes pending feedback as completedRecent minus submitted", async () => {
    installFixture({ completedRecent: 10, feedbackSubmitted: 4 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.feedbackSubmittedThisTermCount).toBe(4);
    expect(pulse.feedbackPendingCount).toBe(6);
  });

  it("clamps pending feedback at zero when older sessions are also rated", async () => {
    installFixture({ completedRecent: 2, feedbackSubmitted: 5 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.feedbackPendingCount).toBe(0);
  });

  it("passes resources counts through", async () => {
    installFixture({ resourcesNew: 3, resourcesPolicies: 8 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.resourcesNewThisMonthCount).toBe(3);
    expect(pulse.resourcesPoliciesCount).toBe(8);
  });

  it("passes unread messages through", async () => {
    installFixture({ messagesUnread: 5 });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse.messagesUnreadCount).toBe(5);
  });

  it("swallows thrown errors and returns calm zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getClientPortalPulse("centre-1");
    expect(pulse).toEqual({
      reportsThisTermCount: 0,
      reportsNewThisWeekCount: 0,
      invoicesOverdueCount: 0,
      invoicesUnpaidCount: 0,
      invoicesPaidThisMonthCount: 0,
      feedbackSubmittedThisTermCount: 0,
      feedbackPendingCount: 0,
      resourcesNewThisMonthCount: 0,
      resourcesPoliciesCount: 0,
      messagesUnreadCount: 0,
    });
  });
});
