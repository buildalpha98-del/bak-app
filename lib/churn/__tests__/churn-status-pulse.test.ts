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

import { getChurnStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// Fan-out:
//   1. churn_risk_indicators select("centre_id, risk_score,
//      risk_level, snapshot_date").order() — to dedupe latest +
//      prev per centre
//   2. churn_events head count where detected_at >= Monday

interface PulseFixture {
  snapshots?: Array<{
    centre_id: string;
    risk_score: number;
    risk_level: string;
    snapshot_date: string;
  }>;
  newEventsThisWeekCount?: number;
}

function installFixture(opts: PulseFixture) {
  const snapshots = opts.snapshots ?? [];
  const newEventsThisWeekCount = opts.newEventsThisWeekCount ?? 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "churn_risk_indicators") {
      return {
        select: () => ({
          order: () =>
            Promise.resolve({ data: snapshots, error: null }),
        }),
      };
    }
    if (table === "churn_events") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean }
        ) => ({
          gte: () =>
            Promise.resolve({
              count: opts2?.head ? newEventsThisWeekCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getChurnStatusPulse", () => {
  it("returns zeros on a fresh org (no snapshots)", async () => {
    installFixture({});
    const pulse = await getChurnStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 0,
      newEventsThisWeekCount: 0,
      improvingCount: 0,
      unchangedCount: 0,
    });
  });

  it("counts high+critical centres as at-risk", async () => {
    installFixture({
      snapshots: [
        // Centre c1 — only one snapshot, critical.
        {
          centre_id: "c1",
          risk_score: 90,
          risk_level: "critical",
          snapshot_date: "2026-06-15",
        },
        // Centre c2 — latest high, prev high.
        {
          centre_id: "c2",
          risk_score: 75,
          risk_level: "high",
          snapshot_date: "2026-06-15",
        },
        {
          centre_id: "c2",
          risk_score: 78,
          risk_level: "high",
          snapshot_date: "2026-06-08",
        },
        // Centre c3 — low.
        {
          centre_id: "c3",
          risk_score: 20,
          risk_level: "low",
          snapshot_date: "2026-06-15",
        },
      ],
    });
    const pulse = await getChurnStatusPulse();
    expect(pulse.atRiskCount).toBe(2);
  });

  it("classifies score drop of 5+ as improving", async () => {
    installFixture({
      snapshots: [
        // Latest 60, previous 70 → improving.
        {
          centre_id: "c1",
          risk_score: 60,
          risk_level: "medium",
          snapshot_date: "2026-06-15",
        },
        {
          centre_id: "c1",
          risk_score: 70,
          risk_level: "high",
          snapshot_date: "2026-06-08",
        },
      ],
    });
    const pulse = await getChurnStatusPulse();
    expect(pulse.improvingCount).toBe(1);
  });

  it("classifies ±2 swing as unchanged", async () => {
    installFixture({
      snapshots: [
        {
          centre_id: "c1",
          risk_score: 41,
          risk_level: "medium",
          snapshot_date: "2026-06-15",
        },
        {
          centre_id: "c1",
          risk_score: 40,
          risk_level: "medium",
          snapshot_date: "2026-06-08",
        },
      ],
    });
    const pulse = await getChurnStatusPulse();
    expect(pulse.unchangedCount).toBe(1);
  });

  it("passes new events this week through", async () => {
    installFixture({ newEventsThisWeekCount: 6 });
    const pulse = await getChurnStatusPulse();
    expect(pulse.newEventsThisWeekCount).toBe(6);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getChurnStatusPulse();
    expect(pulse).toEqual({
      atRiskCount: 0,
      newEventsThisWeekCount: 0,
      improvingCount: 0,
      unchangedCount: 0,
    });
  });
});
