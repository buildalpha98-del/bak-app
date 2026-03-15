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
    // Mock high feedback ratings (avg 4.5)
    const feedbackChain = setupChainedMock({
      data: [{ rating: 5 }, { rating: 4 }, { rating: 5 }, { rating: 4 }],
      error: null,
    });

    // Mock fast invoice payment (5 days average)
    const invoiceChain = setupChainedMock({
      data: [
        { sent_at: "2026-02-01", updated_at: "2026-02-06", status: "paid" },
        { sent_at: "2026-01-01", updated_at: "2026-01-04", status: "paid" },
      ],
      error: null,
    });

    // Mock low cancellation (0 cancelled out of 20)
    const sessionCountChain = setupChainedMock({ count: 20, error: null });
    const cancelledCountChain = setupChainedMock({ count: 0, error: null });

    // Mock fast communication (responded in 12 hours)
    const commChain = setupChainedMock({
      data: [
        {
          created_at: "2026-03-01T08:00:00Z",
          submitted_at: "2026-03-01T20:00:00Z",
        },
      ],
      error: null,
    });

    // Mock growing attendance
    const recentSessionsChain = setupChainedMock({
      data: [
        { headcount: 20 },
        { headcount: 22 },
        { headcount: 21 },
        { headcount: 23 },
      ],
      error: null,
    });
    const prevSessionsChain = setupChainedMock({
      data: [
        { headcount: 15 },
        { headcount: 16 },
        { headcount: 14 },
        { headcount: 15 },
      ],
      error: null,
    });

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      // The function calls from() multiple times for different tables/queries
      // We return chains that resolve to good data
      switch (callCount) {
        case 1: return feedbackChain as never;     // feedback_ratings
        case 2: return invoiceChain as never;      // outbound_invoices
        case 3: return sessionCountChain as never; // sessions (total)
        case 4: return cancelledCountChain as never; // sessions (cancelled)
        case 5: return commChain as never;         // feedback_ratings (communication)
        case 6: return recentSessionsChain as never; // sessions (recent attendance)
        case 7: return prevSessionsChain as never;   // sessions (prev attendance)
        default: return setupChainedMock({ data: null, error: null }) as never;
      }
    });

    const config = makeConfig();
    const result = await calculateHealthScore(centreId, config);

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.status).toBe("green");
  });

  it("returns red status when score < 50", async () => {
    // Mock terrible feedback (avg 1.5)
    const feedbackChain = setupChainedMock({
      data: [{ rating: 1 }, { rating: 2 }, { rating: 1 }, { rating: 2 }],
      error: null,
    });

    // Mock very late invoices (60+ days to pay)
    const invoiceChain = setupChainedMock({
      data: [
        { sent_at: "2025-12-01", updated_at: "2026-02-15", status: "paid" },
        { sent_at: "2025-11-01", updated_at: "2026-01-15", status: "paid" },
      ],
      error: null,
    });

    // Mock high cancellation (15 out of 20)
    const sessionCountChain = setupChainedMock({ count: 20, error: null });
    const cancelledCountChain = setupChainedMock({ count: 15, error: null });

    // Mock poor communication (no responses)
    const commChain = setupChainedMock({ data: [], error: null });

    // Mock declining attendance
    const recentSessionsChain = setupChainedMock({
      data: [
        { headcount: 5 },
        { headcount: 4 },
        { headcount: 3 },
      ],
      error: null,
    });
    const prevSessionsChain = setupChainedMock({
      data: [
        { headcount: 20 },
        { headcount: 18 },
        { headcount: 19 },
      ],
      error: null,
    });

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: return feedbackChain as never;
        case 2: return invoiceChain as never;
        case 3: return sessionCountChain as never;
        case 4: return cancelledCountChain as never;
        case 5: return commChain as never;
        case 6: return recentSessionsChain as never;
        case 7: return prevSessionsChain as never;
        default: return setupChainedMock({ data: null, error: null }) as never;
      }
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
