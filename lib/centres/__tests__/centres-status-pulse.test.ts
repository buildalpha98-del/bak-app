import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoist a single supabase mock so every test in this file shares the
// same instance — `vi.mock` factories are hoisted to the top of the
// module by Vitest, so any state they capture has to live in
// vi.hoisted to be initialised in time.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

// getFinancialAccess is pulled in transitively by the actions module
// for the CSV-export action — stub it out so the test file doesn't
// need a full supabase auth shim.
vi.mock("@/lib/auth/financial-access", () => ({
  getFinancialAccess: vi.fn().mockResolvedValue(false),
}));

import { getCentresStatusPulse } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface PulseMockOptions {
  atRiskCount: number;
  overdueInvoiceCount: number;
  /** Checklists older than 14 days that haven't been completed. */
  oldChecklists?: Array<{ id: string; status: string }>;
  /** Per-checklist step rows used to determine "<5 completed". */
  stepsByChecklist?: Record<string, Array<{ status: string }>>;
}

function mockPulseQueries(opts: PulseMockOptions) {
  const oldChecklists = opts.oldChecklists ?? [];
  const stepsByChecklist = opts.stepsByChecklist ?? {};

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centres") {
      return {
        select: () => ({
          eq: () => ({
            neq: () =>
              Promise.resolve({
                data: null,
                count: opts.atRiskCount,
                error: null,
              }),
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
    if (table === "centre_onboarding_checklists") {
      return {
        select: () => ({
          neq: () => ({
            lt: () =>
              Promise.resolve({
                data: oldChecklists,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "centre_onboarding_steps") {
      // Flatten the per-checklist map into the single rows array the
      // production code aggregates over.
      const rows = Object.entries(stepsByChecklist).flatMap(
        ([checklistId, steps]) =>
          steps.map((s) => ({ checklist_id: checklistId, status: s.status }))
      );
      return {
        select: () => ({
          in: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getCentresStatusPulse", () => {
  it("returns counts derived from mocked Supabase calls", async () => {
    mockPulseQueries({
      atRiskCount: 4,
      overdueInvoiceCount: 6,
      oldChecklists: [
        { id: "ck-a", status: "in_progress" }, // 2 done → behind
        { id: "ck-b", status: "in_progress" }, // 5 done → not behind
        { id: "ck-c", status: "in_progress" }, // 0 done → behind
      ],
      stepsByChecklist: {
        "ck-a": [
          { status: "completed" },
          { status: "completed" },
          { status: "pending" },
        ],
        "ck-b": [
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
          { status: "completed" },
        ],
        // ck-c intentionally absent — zero completed.
      },
    });

    const pulse = await getCentresStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 4,
      overdueInvoiceCount: 6,
      behindOnboardingCount: 2,
    });
  });

  it("returns all zeros when nothing matches", async () => {
    mockPulseQueries({
      atRiskCount: 0,
      overdueInvoiceCount: 0,
      oldChecklists: [],
    });

    const pulse = await getCentresStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 0,
      overdueInvoiceCount: 0,
      behindOnboardingCount: 0,
    });
  });

  it("returns zeros on a thrown error rather than crashing the page", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });

    const pulse = await getCentresStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 0,
      overdueInvoiceCount: 0,
      behindOnboardingCount: 0,
    });
  });
});
