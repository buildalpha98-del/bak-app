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

import { getInvoicingStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// The action fans out four head-count queries in parallel:
//   1. outbound_invoices — status='sent', due_date < today      (overdue)
//   2. outbound_invoices — status='sent'                        (awaiting)
//   3. coach_invoices    — status='flagged'                     (flagged)
//   4. outbound_invoices — sent_at >= Monday                    (this week)
// Each leaf is a head call → returns { count, data: null, error: null }.
// ============================================================

interface PulseFixture {
  overdue?: number;
  awaiting?: number;
  flagged?: number;
  sentThisWeek?: number;
}

function installFixture(opts: PulseFixture = {}) {
  let outboundCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "outbound_invoices") {
      outboundCall += 1;
      // Call 1: overdue — .eq("status", "sent").lt("due_date", today)
      if (outboundCall === 1) {
        return {
          select: () => ({
            eq: () => ({
              lt: () =>
                Promise.resolve({
                  count: opts.overdue ?? 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      // Call 2: awaiting — .eq("status", "sent")
      if (outboundCall === 2) {
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
      // Call 3: sent this week — .gte("sent_at", monday)
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              count: opts.sentThisWeek ?? 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "coach_invoices") {
      // Flagged — .eq("status", "flagged")
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              count: opts.flagged ?? 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getInvoicingStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture();
    const pulse = await getInvoicingStatusPulse();
    expect(pulse).toEqual({
      overdueInvoicesCount: 0,
      awaitingPaymentCount: 0,
      flaggedInvoicesCount: 0,
      sentThisWeekCount: 0,
    });
  });

  it("passes overdue head-count through", async () => {
    installFixture({ overdue: 3 });
    const pulse = await getInvoicingStatusPulse();
    expect(pulse.overdueInvoicesCount).toBe(3);
  });

  it("scopes awaiting payment to sent-status only", async () => {
    installFixture({ awaiting: 12 });
    const pulse = await getInvoicingStatusPulse();
    expect(pulse.awaitingPaymentCount).toBe(12);
  });

  it("counts flagged coach invoices independently of outbound counts", async () => {
    installFixture({ flagged: 2, awaiting: 5 });
    const pulse = await getInvoicingStatusPulse();
    expect(pulse.flaggedInvoicesCount).toBe(2);
    expect(pulse.awaitingPaymentCount).toBe(5);
  });

  it("swallows thrown errors and returns all zeros (hard fail safety net)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getInvoicingStatusPulse();
    expect(pulse).toEqual({
      overdueInvoicesCount: 0,
      awaitingPaymentCount: 0,
      flaggedInvoicesCount: 0,
      sentThisWeekCount: 0,
    });
  });
});
