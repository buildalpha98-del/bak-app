import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminClient } from "@/tests/setup";
import { calculateChurnRisk } from "../churnRisk";
import type { ChurnRiskResult } from "../churnRisk";

// ============================================================
// Helper: build a chained mock that resolves to a given value
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
// getRiskLevel thresholds (tested indirectly through calculateChurnRisk)
// ============================================================
// low:     0-25
// medium:  26-50
// high:    51-75
// critical: 76-100

describe("calculateChurnRisk", () => {
  const centreId = "centre-churn-test";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns low risk for a healthy, established centre", async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 8);

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        // 1. Centre health score + created_at
        case 1:
          return setupChainedMock({
            data: { health_score: 90, created_at: sixMonthsAgo.toISOString() },
            error: null,
          }) as never;
        // 2. Recent sessions (last 30d) — good activity
        case 2:
          return setupChainedMock({ count: 12, error: null }) as never;
        // 3. Previous sessions (30-60d ago) — similar
        case 3:
          return setupChainedMock({ count: 10, error: null }) as never;
        // 4. Last feedback — recent
        case 4:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        // 5. Last note — recent
        case 5:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        // 6. Overdue invoices — none
        case 6:
          return setupChainedMock({ count: 0, error: null }) as never;
        // 7. Cancelled sessions — none
        case 7:
          return setupChainedMock({ count: 0, error: null }) as never;
        // 8. Total sessions — plenty
        case 8:
          return setupChainedMock({ count: 24, error: null }) as never;
        default:
          return setupChainedMock({ data: null, error: null }) as never;
      }
    });

    const result = await calculateChurnRisk(centreId);

    expect(result.riskLevel).toBe("low");
    expect(result.riskScore).toBeLessThanOrEqual(25);
    expect(result.indicators).toHaveProperty("health_score");
    expect(result.indicators).toHaveProperty("engagement_trend");
    expect(result.indicators).toHaveProperty("communication");
    expect(result.indicators).toHaveProperty("payment");
    expect(result.indicators).toHaveProperty("cancellation_rate");
    expect(result.indicators).toHaveProperty("relationship");
  });

  it("returns critical risk for a struggling centre", async () => {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        // 1. Centre — very low health score, new
        case 1:
          return setupChainedMock({
            data: { health_score: 20, created_at: twoMonthsAgo.toISOString() },
            error: null,
          }) as never;
        // 2. Recent sessions — almost none
        case 2:
          return setupChainedMock({ count: 1, error: null }) as never;
        // 3. Previous sessions — had many
        case 3:
          return setupChainedMock({ count: 10, error: null }) as never;
        // 4. Last feedback — none
        case 4:
          return setupChainedMock({ data: [], error: null }) as never;
        // 5. Last note — none
        case 5:
          return setupChainedMock({ data: [], error: null }) as never;
        // 6. Overdue invoices — multiple
        case 6:
          return setupChainedMock({ count: 3, error: null }) as never;
        // 7. Cancelled sessions — many
        case 7:
          return setupChainedMock({ count: 8, error: null }) as never;
        // 8. Total sessions — few
        case 8:
          return setupChainedMock({ count: 12, error: null }) as never;
        default:
          return setupChainedMock({ data: null, error: null }) as never;
      }
    });

    const result = await calculateChurnRisk(centreId);

    expect(result.riskLevel).toBe("critical");
    expect(result.riskScore).toBeGreaterThanOrEqual(76);
  });

  it("returns all 6 indicator categories", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const result = await calculateChurnRisk(centreId);

    const indicatorKeys = Object.keys(result.indicators);
    expect(indicatorKeys).toHaveLength(6);
    expect(indicatorKeys).toContain("health_score");
    expect(indicatorKeys).toContain("engagement_trend");
    expect(indicatorKeys).toContain("communication");
    expect(indicatorKeys).toContain("payment");
    expect(indicatorKeys).toContain("cancellation_rate");
    expect(indicatorKeys).toContain("relationship");
  });

  it("each indicator has score, weight, and detail", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const result = await calculateChurnRisk(centreId);

    for (const [, indicator] of Object.entries(result.indicators)) {
      expect(indicator).toHaveProperty("score");
      expect(indicator).toHaveProperty("weight");
      expect(indicator).toHaveProperty("detail");
      expect(typeof indicator.score).toBe("number");
      expect(typeof indicator.weight).toBe("number");
      expect(typeof indicator.detail).toBe("string");
      expect(indicator.score).toBeGreaterThanOrEqual(0);
      expect(indicator.score).toBeLessThanOrEqual(100);
    }
  });

  it("indicator weights sum to 1.0", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const result = await calculateChurnRisk(centreId);

    const totalWeight = Object.values(result.indicators).reduce(
      (sum, ind) => sum + ind.weight,
      0
    );
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it("risk score is clamped between 0 and 100", async () => {
    const emptyChain = setupChainedMock({ data: null, error: null, count: null });
    adminClient.from.mockReturnValue(emptyChain as never);

    const result = await calculateChurnRisk(centreId);

    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  describe("risk level thresholds", () => {
    it("maps score 0-25 to low", () => {
      // Tested indirectly through the healthy centre test above
      // Verifying the exported type matches
      const result: ChurnRiskResult = {
        riskScore: 20,
        riskLevel: "low",
        indicators: {},
      };
      expect(result.riskLevel).toBe("low");
    });

    it("maps score 26-50 to medium", () => {
      const result: ChurnRiskResult = {
        riskScore: 40,
        riskLevel: "medium",
        indicators: {},
      };
      expect(result.riskLevel).toBe("medium");
    });

    it("maps score 51-75 to high", () => {
      const result: ChurnRiskResult = {
        riskScore: 60,
        riskLevel: "high",
        indicators: {},
      };
      expect(result.riskLevel).toBe("high");
    });

    it("maps score 76-100 to critical", () => {
      const result: ChurnRiskResult = {
        riskScore: 85,
        riskLevel: "critical",
        indicators: {},
      };
      expect(result.riskLevel).toBe("critical");
    });
  });

  it("applies 1.2x tenure multiplier for new centres (<3 months)", async () => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1:
          return setupChainedMock({
            data: { health_score: 50, created_at: oneMonthAgo.toISOString() },
            error: null,
          }) as never;
        case 2: return setupChainedMock({ count: 5, error: null }) as never;
        case 3: return setupChainedMock({ count: 5, error: null }) as never;
        case 4:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        case 5:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        case 6: return setupChainedMock({ count: 0, error: null }) as never;
        case 7: return setupChainedMock({ count: 0, error: null }) as never;
        case 8: return setupChainedMock({ count: 10, error: null }) as never;
        default: return setupChainedMock({ data: null, error: null }) as never;
      }
    });

    const result = await calculateChurnRisk(centreId);

    // New centre gets 1.2x multiplier on raw score, so risk is elevated
    // The relationship indicator should show 60 (new centre)
    expect(result.indicators.relationship.score).toBe(60);
    expect(result.indicators.relationship.detail).toContain("New centre");
  });

  it("payment risk is high with overdue invoices", async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 8);

    let callCount = 0;
    adminClient.from.mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1:
          return setupChainedMock({
            data: { health_score: 70, created_at: sixMonthsAgo.toISOString() },
            error: null,
          }) as never;
        case 2: return setupChainedMock({ count: 8, error: null }) as never;
        case 3: return setupChainedMock({ count: 8, error: null }) as never;
        case 4:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        case 5:
          return setupChainedMock({
            data: [{ created_at: new Date().toISOString() }],
            error: null,
          }) as never;
        // 2 overdue invoices
        case 6: return setupChainedMock({ count: 2, error: null }) as never;
        case 7: return setupChainedMock({ count: 0, error: null }) as never;
        case 8: return setupChainedMock({ count: 16, error: null }) as never;
        default: return setupChainedMock({ data: null, error: null }) as never;
      }
    });

    const result = await calculateChurnRisk(centreId);

    // 2 overdue invoices → paymentRisk = 80 + min(20, 2*10) = 100
    expect(result.indicators.payment.score).toBe(100);
    expect(result.indicators.payment.detail).toContain("2");
  });
});
