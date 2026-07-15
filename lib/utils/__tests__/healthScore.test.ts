import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// Health Score tests
// ============================================================
// The calculateHealthScore function is async and depends on Supabase.
// We test the exported pure helpers (determineStatus, scaleScore) indirectly
// through the main function by controlling mock responses.

// Import the mocked admin client from setup
import { adminClient } from "@/tests/setup";
import { calculateHealthScore } from "../healthScore";
import type { HealthScoreConfig } from "@/lib/types/database";

// ============================================================
// Helper: build a config array
// ============================================================

function makeConfig(overrides: Partial<Record<string, Partial<HealthScoreConfig>>> = {}): HealthScoreConfig[] {
  const defaults: Record<string, HealthScoreConfig> = {
    feedback_ratings: {
      id: "1",
      signal_name: "feedback_ratings",
      weight: 30,
      green_threshold: 75,
      amber_threshold: 50,
      description: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
    invoice_payment: {
      id: "2",
      signal_name: "invoice_payment",
      weight: 25,
      green_threshold: 75,
      amber_threshold: 50,
      description: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
    cancellation_rate: {
      id: "3",
      signal_name: "cancellation_rate",
      weight: 20,
      green_threshold: 75,
      amber_threshold: 50,
      description: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
    communication: {
      id: "4",
      signal_name: "communication",
      weight: 15,
      green_threshold: 75,
      amber_threshold: 50,
      description: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
    attendance_trends: {
      id: "5",
      signal_name: "attendance_trends",
      weight: 10,
      green_threshold: 75,
      amber_threshold: 50,
      description: null,
      updated_by: null,
      updated_at: new Date().toISOString(),
    },
  };

  // Apply overrides
  for (const [key, val] of Object.entries(overrides)) {
    if (defaults[key]) {
      defaults[key] = { ...defaults[key], ...val };
    }
  }

  return Object.values(defaults);
}

// ============================================================
// Mock chain setup
// ============================================================

function setupChainedMock(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "eq", "neq", "gt", "gte", "lt", "lte",
    "not", "order", "limit", "single", "is", "filter",
    "range", "head",
  ];
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(returnValue));
  return chain;
}

// ============================================================
// Input-routed mock — resolves by table + recorded filters
// ============================================================
//
// calculateHealthScore runs its five signal calcs in Promise.all, so
// from() call ORDER interleaves and is not a stable routing key (the
// old order-based switch fed headcount rows into the cancellation
// maths and the score came out NaN). These chains record what was
// asked (select arg, count option, eq filters, lt presence) and pick
// the payload at await-time — immune to reordering.

type MockPayload = {
  data?: unknown;
  count?: number | null;
  error: null;
};

interface RecordedQuery {
  selectArg: string;
  countExact: boolean;
  eqs: Record<string, unknown>;
  hasLt: boolean;
}

function routedChain(resolve: (q: RecordedQuery) => MockPayload) {
  const q: RecordedQuery = {
    selectArg: "",
    countExact: false,
    eqs: {},
    hasLt: false,
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["neq", "gt", "gte", "lte", "not", "order", "limit", "single", "is", "filter", "range", "head"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.select = vi.fn((arg?: string, opts?: { count?: string }) => {
    q.selectArg = arg ?? "";
    q.countExact = opts?.count === "exact";
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    q.eqs[col] = val;
    return chain;
  });
  chain.lt = vi.fn(() => {
    q.hasLt = true;
    return chain;
  });
  chain.then = vi.fn((res: (v: unknown) => void) => res(resolve(q)));
  return chain;
}

function routeHealthQueries(payloads: {
  ratings: MockPayload;
  invoices: MockPayload;
  totalCount: MockPayload;
  cancelledCount: MockPayload;
  communication: MockPayload;
  recentSessions: MockPayload;
  prevSessions: MockPayload;
}) {
  adminClient.from.mockImplementation(((table: string) => {
    if (table === "feedback_ratings") {
      return routedChain((q) =>
        q.selectArg.includes("submitted_at")
          ? payloads.communication
          : payloads.ratings
      ) as never;
    }
    if (table === "outbound_invoices") {
      return routedChain(() => payloads.invoices) as never;
    }
    if (table === "sessions") {
      return routedChain((q) => {
        if (q.countExact) {
          return q.eqs.status === "cancelled"
            ? payloads.cancelledCount
            : payloads.totalCount;
        }
        // Attendance: the previous-period query is the one with .lt(date)
        return q.hasLt ? payloads.prevSessions : payloads.recentSessions;
      }) as never;
    }
    return setupChainedMock({ data: null, error: null }) as never;
  }) as never);
}

describe("calculateHealthScore", () => {
  const centreId = "centre-test-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns neutral score (70) when no data exists for any signal", async () => {
    // All queries return empty/null data
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    expect(result.score).toBe(70);
    expect(result.status).toBe("amber");
    expect(result.breakdown).toHaveLength(5);
  });

  it("returns green status when score >= 75", async () => {
    routeHealthQueries({
      // High feedback (avg 4.5)
      ratings: {
        data: [{ rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 4 }],
        error: null,
      },
      // Fast invoice payment (3-5 days)
      invoices: {
        data: [
          { sent_at: "2026-02-01", updated_at: "2026-02-06", status: "paid" },
          { sent_at: "2026-01-01", updated_at: "2026-01-04", status: "paid" },
        ],
        error: null,
      },
      // Low cancellation (0 of 20)
      totalCount: { count: 20, error: null },
      cancelledCount: { count: 0, error: null },
      // Fast communication (12 hours)
      communication: {
        data: [
          {
            created_at: "2026-03-01T08:00:00Z",
            submitted_at: "2026-03-01T20:00:00Z",
          },
        ],
        error: null,
      },
      // Growing attendance
      recentSessions: {
        data: [
          { headcount: 20 },
          { headcount: 22 },
          { headcount: 21 },
          { headcount: 23 },
        ],
        error: null,
      },
      prevSessions: {
        data: [
          { headcount: 15 },
          { headcount: 16 },
          { headcount: 14 },
          { headcount: 15 },
        ],
        error: null,
      },
    });

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.status).toBe("green");
  });

  it("returns red status when score < 50", async () => {
    routeHealthQueries({
      // Terrible feedback (avg 1.5)
      ratings: {
        data: [{ rating: 1 }, { rating: 2 }, { rating: 1 }, { rating: 2 }],
        error: null,
      },
      // Very late invoices (60+ days to pay)
      invoices: {
        data: [
          { sent_at: "2025-12-01", updated_at: "2026-02-15", status: "paid" },
          { sent_at: "2025-11-01", updated_at: "2026-01-15", status: "paid" },
        ],
        error: null,
      },
      // High cancellation (15 of 20)
      totalCount: { count: 20, error: null },
      cancelledCount: { count: 15, error: null },
      // Poor communication (no responses → neutral 70)
      communication: { data: [], error: null },
      // Collapsing attendance
      recentSessions: {
        data: [{ headcount: 5 }, { headcount: 4 }, { headcount: 3 }],
        error: null,
      },
      prevSessions: {
        data: [{ headcount: 20 }, { headcount: 18 }, { headcount: 19 }],
        error: null,
      },
    });

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    expect(result.score).toBeLessThan(50);
    expect(result.status).toBe("red");
  });

  it("breakdown contains all 5 signals", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    const signalNames = result.breakdown.map((b) => b.signal_name);
    expect(signalNames).toContain("feedback_ratings");
    expect(signalNames).toContain("invoice_payment");
    expect(signalNames).toContain("cancellation_rate");
    expect(signalNames).toContain("communication");
    expect(signalNames).toContain("attendance_trends");
  });

  it("each breakdown entry has required fields", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    for (const entry of result.breakdown) {
      expect(entry).toHaveProperty("signal_name");
      expect(entry).toHaveProperty("weight");
      expect(entry).toHaveProperty("raw_value");
      expect(entry).toHaveProperty("signal_score");
      expect(entry).toHaveProperty("status");
      expect(["green", "amber", "red"]).toContain(entry.status);
    }
  });

  it("respects custom weight configuration", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    // All weight on feedback, zero on everything else
    const config = makeConfig({
      feedback_ratings: { weight: 100 },
      invoice_payment: { weight: 0 },
      cancellation_rate: { weight: 0 },
      communication: { weight: 0 },
      attendance_trends: { weight: 0 },
    });

    const result = await calculateHealthScore(centreId, config);

    // Feedback with no data defaults to 70
    expect(result.score).toBe(70);
  });

  it("score is always between 0 and 100", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
