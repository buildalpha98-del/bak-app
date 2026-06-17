import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, fetchMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/notifications/send", () => ({
  triggerNotificationForOps: vi.fn(),
}));
// markInvoicePaid eventually calls fetch and storage helpers — but we don't
// reach those in these tests because we choose statuses that short-circuit
// the path (or stub the markInvoicePaid result via the from() chain).
global.fetch = fetchMock as unknown as typeof fetch;

import {
  bulkMarkInvoicesPaid,
  exportInvoicesCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  invoices?: Map<
    string,
    {
      id: string;
      status: string;
      invoice_number?: string;
      coach_id?: string;
      total_amount?: number;
      gst_amount?: number;
      line_items_json?: Array<{
        session_id: string;
        amount: number;
        date: string;
        centre_name: string;
        sport: string;
        duration_minutes: number;
        rate: number;
        rate_unit: string;
      }>;
      period_start?: string;
      period_end?: string;
      created_at?: string;
      sent_at?: string | null;
    }
  >;
  coachProfile?: { name: string; email: string };
}

function mockCtx(opts: MockCtxOpts) {
  const invoices = opts.invoices ?? new Map();
  const coachProfile = opts.coachProfile ?? { name: "Coach", email: "c@example.com" };

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { role: opts.role }, error: null }),
          }),
          in: () =>
            Promise.resolve({
              data: [coachProfile],
              error: null,
            }),
        }),
      };
    }
    if (table === "coach_invoices") {
      return {
        select: (cols?: string) => {
          // .in("id", ids) used by exportInvoicesCsv
          if (cols && cols.includes("profiles!coach_invoices_coach_id_fkey")) {
            return {
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: ids
                    .filter((id) => invoices.has(id))
                    .map((id) => ({
                      ...invoices.get(id),
                      profiles: { name: "Coach", email: "c@example.com" },
                    })),
                  error: null,
                }),
            };
          }
          // .eq("id", id).single() used by markInvoicePaid
          return {
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: invoices.size > 0 ? invoices.values().next().value : null,
                  error: null,
                }),
            }),
          };
        },
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("bulkMarkInvoicesPaid", () => {
  it("rejects empty selection up front without auth", async () => {
    const result = await bulkMarkInvoicesPaid([]);
    expect(result).toEqual({
      paid: 0,
      errors: [],
      error: "No invoices selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers (admin-only — coach blocked)", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkMarkInvoicesPaid(["i1"]);
    expect(result.paid).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("rejects ops callers (admin-only)", async () => {
    mockCtx({ role: "ops" });
    const result = await bulkMarkInvoicesPaid(["i1"]);
    expect(result.paid).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });
});

describe("exportInvoicesCsv", () => {
  it("rejects empty selection up front", async () => {
    const result = await exportInvoicesCsv([]);
    expect(result).toEqual({ csv: null, error: "No invoices selected." });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await exportInvoicesCsv(["i1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("returns CSV header + one row per invoice", async () => {
    const invoices = new Map([
      [
        "i1",
        {
          id: "i1",
          status: "sent",
          invoice_number: "BAK-COACH-202606-01",
          coach_id: "u1",
          total_amount: 250,
          gst_amount: 25,
          period_start: "2026-06-01",
          period_end: "2026-06-14",
          sent_at: "2026-06-15T10:00:00Z",
          created_at: "2026-06-15T09:00:00Z",
          line_items_json: [
            {
              session_id: "s1",
              amount: 250,
              date: "2026-06-10",
              centre_name: "Centre A",
              sport: "Soccer",
              duration_minutes: 60,
              rate: 50,
              rate_unit: "per_hour",
            },
          ],
        },
      ],
    ]);
    mockCtx({ role: "admin", invoices });
    const result = await exportInvoicesCsv(["i1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    const lines = (result.csv ?? "").split("\n");
    expect(lines[0]).toContain("Invoice #");
    expect(lines[0]).toContain("Period Start");
    expect(lines[1]).toContain("BAK-COACH-202606-01");
    expect(lines[1]).toContain("250.00");
  });
});
