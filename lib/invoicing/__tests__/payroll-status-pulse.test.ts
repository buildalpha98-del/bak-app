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

import { getPayrollStatusPulse } from "../payroll-status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Four head-count queries against `payment_batches`:
//   1. status='calculating'
//   2. status='calculated'
//   3. status='approved'
//   4. status='paid' AND paid_at >= 14 days ago
// ============================================================

interface PulseFixture {
  calculating?: number;
  calculated?: number;
  approved?: number;
  paidRecently?: number;
}

function installFixture(opts: PulseFixture = {}) {
  let call = 0;
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "payment_batches") {
      throw new Error(`unexpected table ${table}`);
    }
    call += 1;
    if (call === 4) {
      // .eq("status", "paid").gte("paid_at", ...)
      return {
        select: () => ({
          eq: () => ({
            gte: () =>
              Promise.resolve({
                count: opts.paidRecently ?? 0,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    const counts = [opts.calculating ?? 0, opts.calculated ?? 0, opts.approved ?? 0];
    return {
      select: () => ({
        eq: () =>
          Promise.resolve({
            count: counts[call - 1],
            data: null,
            error: null,
          }),
      }),
    };
  });
}

describe("getPayrollStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture();
    const pulse = await getPayrollStatusPulse();
    expect(pulse).toEqual({
      awaitingCalculationCount: 0,
      awaitingApprovalCount: 0,
      approvedUnpaidCount: 0,
      paidThisFortnightCount: 0,
    });
  });

  it("passes per-status head-counts through", async () => {
    installFixture({
      calculating: 1,
      calculated: 2,
      approved: 1,
      paidRecently: 3,
    });
    const pulse = await getPayrollStatusPulse();
    expect(pulse).toEqual({
      awaitingCalculationCount: 1,
      awaitingApprovalCount: 2,
      approvedUnpaidCount: 1,
      paidThisFortnightCount: 3,
    });
  });

  it("treats null counts as zero", async () => {
    supabaseMock.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: null, data: null, error: null }),
        }),
      }),
    }));
    // First three resolve via just .eq, fourth via .eq().gte().
    // For uniform null we wire both shapes:
    let n = 0;
    supabaseMock.from.mockImplementation(() => {
      n += 1;
      if (n === 4) {
        return {
          select: () => ({
            eq: () => ({
              gte: () =>
                Promise.resolve({ count: null, data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ count: null, data: null, error: null }),
        }),
      };
    });
    const pulse = await getPayrollStatusPulse();
    expect(pulse).toEqual({
      awaitingCalculationCount: 0,
      awaitingApprovalCount: 0,
      approvedUnpaidCount: 0,
      paidThisFortnightCount: 0,
    });
  });

  it("swallows thrown errors and returns zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getPayrollStatusPulse();
    expect(pulse).toEqual({
      awaitingCalculationCount: 0,
      awaitingApprovalCount: 0,
      approvedUnpaidCount: 0,
      paidThisFortnightCount: 0,
    });
  });
});
