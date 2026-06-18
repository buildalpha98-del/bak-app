import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Single hoisted Supabase mock — every `from(table)` dispatches by
// table name so we can verify the compare-half does its own queries
// without disturbing the no-compare half.
const { supabaseMock, lastQueries } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
  lastQueries: {
    // Track the (lte, lt) bounds captured by the compare half so we
    // can assert the comparison window lands on the right dates.
    invoicesCutoffLte: null as string | null,
    invoicesDueLt: null as string | null,
    checklistsStartedBefore: null as string | null,
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

vi.mock("@/lib/auth/financial-access", () => ({
  getFinancialAccess: vi.fn().mockResolvedValue(false),
}));

// Anchor the period resolver to a deterministic Sydney-time clock so
// "last_week" maps to a known 7-day window we can assert against.
vi.mock("@/lib/comparison/period", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/comparison/period")
  >("@/lib/comparison/period");
  return {
    ...actual,
    resolvePeriod: vi.fn(async (key: string) => {
      if (key === "last_week") {
        return {
          key,
          start: "2025-10-06",
          end: "2025-10-12",
          label: "Last week",
        };
      }
      return actual.resolvePeriod(
        key as Parameters<typeof actual.resolvePeriod>[0]
      );
    }),
  };
});

import {
  getCentresStatusPulse,
  getCentresStatusPulseWithCompare,
} from "../actions";

interface MockOpts {
  currentAtRisk: number;
  currentOverdue: number;
  // For the prior window (used by the compare half):
  priorRiskIndicators?: Array<{
    centre_id: string;
    detected_at: string;
    resolved_at: string | null;
  }>;
  priorOverdue?: number;
  priorOldChecklists?: Array<{ id: string; status: string }>;
}

function mockCentresPulseAll(opts: MockOpts) {
  // Reset query tracking between tests.
  lastQueries.invoicesCutoffLte = null;
  lastQueries.invoicesDueLt = null;
  lastQueries.checklistsStartedBefore = null;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centres") {
      // Current-snapshot at-risk count (no-compare half).
      return {
        select: () => ({
          eq: () => ({
            neq: () =>
              Promise.resolve({
                data: null,
                count: opts.currentAtRisk,
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "outbound_invoices") {
      // Two callers: the no-compare half (just eq('status','overdue'))
      // and the compare half (eq+lte+lt). We can disambiguate by
      // which chain the caller terminates with.
      return {
        select: () => ({
          eq: () => {
            // No-compare half: terminates after `eq`.
            const noCompareResult = Promise.resolve({
              data: null,
              count: opts.currentOverdue,
              error: null,
            }) as Promise<{
              data: unknown;
              count: number;
              error: null;
            }> & {
              lte: typeof lte;
            };
            const lte = (_field: string, value: string) => {
              lastQueries.invoicesCutoffLte = value;
              return {
                lt: (_dueField: string, dueValue: string) => {
                  lastQueries.invoicesDueLt = dueValue;
                  return Promise.resolve({
                    data: null,
                    count: opts.priorOverdue ?? 0,
                    error: null,
                  });
                },
              };
            };
            (noCompareResult as unknown as { lte: typeof lte }).lte = lte;
            return noCompareResult;
          },
        }),
      };
    }

    if (table === "churn_risk_indicators") {
      // Compare-half: prior risk indicator rows for the period.
      return {
        select: () => ({
          lte: () => ({
            or: () =>
              Promise.resolve({
                data: opts.priorRiskIndicators ?? [],
                error: null,
              }),
          }),
        }),
      };
    }

    if (table === "centre_onboarding_checklists") {
      // The no-compare half chains neq().lt(); the compare half
      // chains neq().neq().lt() (extra cancelled filter). Both must
      // resolve to a data array of old-checklist rows.
      const oldRows = opts.priorOldChecklists ?? [];
      const terminal = (capturedLtIdx: number) => ({
        lt: (_field: string, value: string) => {
          if (capturedLtIdx === 1) {
            lastQueries.checklistsStartedBefore = value;
          }
          return Promise.resolve({ data: oldRows, error: null });
        },
      });
      return {
        select: () => ({
          neq: () => ({
            // No-compare path: neq → lt
            ...terminal(0),
            // Compare path: neq → neq → lt
            neq: () => terminal(1),
          }),
        }),
      };
    }

    if (table === "centre_onboarding_steps") {
      // No completed steps means every checklist counts as behind.
      return {
        select: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCentresStatusPulseWithCompare", () => {
  it("returns previous counts when compareTo is provided", async () => {
    mockCentresPulseAll({
      currentAtRisk: 3,
      currentOverdue: 5,
      priorRiskIndicators: [
        { centre_id: "c1", detected_at: "2025-10-09", resolved_at: null },
        { centre_id: "c2", detected_at: "2025-10-10", resolved_at: null },
        // duplicate centre — should be deduped
        { centre_id: "c1", detected_at: "2025-10-11", resolved_at: null },
      ],
      priorOverdue: 4,
      priorOldChecklists: [{ id: "ck-a", status: "in_progress" }],
    });

    const result = await getCentresStatusPulseWithCompare({
      compareTo: "last_week",
    });

    // The mock returns the same `priorOldChecklists` rows to both
    // halves of the action — fine for this test, both halves should
    // count the single behind row, but the point of the test is the
    // *previous* counts. Use loose assertions on `current` so we
    // don't couple the test to mock internals.
    expect(result.current.atRiskCount).toBe(3);
    expect(result.current.overdueInvoiceCount).toBe(5);
    expect(result.previous).toBeDefined();
    expect(result.previous?.atRiskCount).toBe(2); // c1, c2 — deduped
    expect(result.previous?.overdueInvoiceCount).toBe(4);
    expect(result.previous?.behindOnboardingCount).toBe(1);
    expect(result.compareLabel).toBe("Last week");
  });

  it("returns no `previous` when compareTo is omitted", async () => {
    mockCentresPulseAll({
      currentAtRisk: 1,
      currentOverdue: 2,
    });

    const result = await getCentresStatusPulseWithCompare();
    expect(result.current).toEqual({
      atRiskCount: 1,
      overdueInvoiceCount: 2,
      behindOnboardingCount: 0,
    });
    expect(result.previous).toBeUndefined();
    expect(result.compareLabel).toBeUndefined();
  });

  it("with compareTo='last_week', windows the SQL filters to the correct dates", async () => {
    mockCentresPulseAll({
      currentAtRisk: 0,
      currentOverdue: 0,
      priorRiskIndicators: [],
      priorOverdue: 0,
      priorOldChecklists: [],
    });

    await getCentresStatusPulseWithCompare({ compareTo: "last_week" });

    // Period mock pins last_week → 2025-10-06 .. 2025-10-12.
    // The compare half bounds invoices to created_at <= period end.
    expect(lastQueries.invoicesCutoffLte).toBe("2025-10-12T23:59:59.999Z");
    // And due_date < period end.
    expect(lastQueries.invoicesDueLt).toBe("2025-10-12");
    // Checklists: started_at < period_end - 14d
    // (2025-10-12T23:59:59.999Z minus 14 days = 2025-09-28T23:59:59.999Z).
    expect(lastQueries.checklistsStartedBefore).toBe(
      "2025-09-28T23:59:59.999Z"
    );
  });

  it("excludes cancelled checklists (status invariant preserved)", async () => {
    mockCentresPulseAll({
      currentAtRisk: 0,
      currentOverdue: 0,
      priorRiskIndicators: [],
      priorOverdue: 0,
      priorOldChecklists: [],
    });

    await getCentresStatusPulseWithCompare({ compareTo: "last_week" });

    // The compare half calls `from('centre_onboarding_checklists')`
    // and chains *two* `neq()` filters (one for completed, one for
    // cancelled). The mock only resolves data when the second neq is
    // walked — confirms the compare query explicitly filters out
    // cancelled rows so they never leak into the prior count.
    const checklistCalls = supabaseMock.from.mock.calls.filter(
      ([t]) => t === "centre_onboarding_checklists"
    );
    expect(checklistCalls.length).toBeGreaterThanOrEqual(2); // no-compare + compare
    // The exact-date assertion above also implicitly confirms we
    // travelled through the cancelled-filter branch of the mock,
    // because that branch is the only one that records the cutoff.
    expect(lastQueries.checklistsStartedBefore).not.toBeNull();
  });
});

// Sanity: the no-compare variant still works untouched. Belt-and-
// braces — the existing centres-status-pulse.test.ts already covers
// this, but we re-mock here and confirm we haven't broken its shape
// with our additions.
describe("getCentresStatusPulse (no-compare variant unaffected)", () => {
  it("still returns a flat shape with no `current` wrapper", async () => {
    mockCentresPulseAll({
      currentAtRisk: 2,
      currentOverdue: 3,
    });
    const pulse = await getCentresStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 2,
      overdueInvoiceCount: 3,
      behindOnboardingCount: 0,
    });
  });
});
