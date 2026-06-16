import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { adminMock } = vi.hoisted(() => ({
  adminMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
// y1-targets-actions is pulled in transitively via dashboard-actions;
// stub the supabase admin it shares so getY1Targets doesn't error out
// (we don't exercise it here).

import { getAdminStatusPulse } from "../dashboard-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface PulseMockOptions {
  needsReplacementCount: number;
  overdueInvoiceCount: number;
  leadActivities: Array<{ lead_id: string }>;
}

function mockPulseQueries(opts: PulseMockOptions) {
  adminMock.from.mockImplementation((table: string) => {
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              count: opts.needsReplacementCount,
              error: null,
            }),
        }),
      };
    }
    if (table === "outbound_invoices") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: null,
              count: opts.overdueInvoiceCount,
              error: null,
            }),
        }),
      };
    }
    if (table === "lead_activities") {
      return {
        select: () => ({
          in: () => ({
            gte: () =>
              Promise.resolve({
                data: opts.leadActivities,
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getAdminStatusPulse", () => {
  it("returns the three counts derived from the mocked Supabase calls", async () => {
    mockPulseQueries({
      needsReplacementCount: 3,
      overdueInvoiceCount: 7,
      leadActivities: [
        { lead_id: "lead-a" },
        { lead_id: "lead-a" },
        { lead_id: "lead-b" },
        { lead_id: "lead-c" },
      ],
    });

    const pulse = await getAdminStatusPulse();
    expect(pulse).toEqual({
      needsReplacementCount: 3,
      overdueInvoiceCount: 7,
      leadsRepliedTodayCount: 3, // de-duped on lead_id
    });
  });

  it("handles the all-zero state cleanly", async () => {
    mockPulseQueries({
      needsReplacementCount: 0,
      overdueInvoiceCount: 0,
      leadActivities: [],
    });

    const pulse = await getAdminStatusPulse();
    expect(pulse).toEqual({
      needsReplacementCount: 0,
      overdueInvoiceCount: 0,
      leadsRepliedTodayCount: 0,
    });
  });

  it("falls back to 0 when Supabase returns nullish counts", async () => {
    adminMock.from.mockImplementation((table: string) => {
      if (table === "sessions" || table === "outbound_invoices") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: null, count: null, error: null }),
          }),
        };
      }
      if (table === "lead_activities") {
        return {
          select: () => ({
            in: () => ({
              gte: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const pulse = await getAdminStatusPulse();
    expect(pulse).toEqual({
      needsReplacementCount: 0,
      overdueInvoiceCount: 0,
      leadsRepliedTodayCount: 0,
    });
  });
});
