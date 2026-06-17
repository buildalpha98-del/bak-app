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

import { getIntelligenceStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Six queries (fan-out):
//   1. centres   head count   .gte("created_at", monthStart)
//   2. parent_profiles head count  .gte("created_at", monthStart)
//   3. churn_risk_indicators select centre_id  .in("severity",...).is("resolved_at",null)
//   4. profiles  select id    .eq("role","coach").eq("status","active")
// then conditional:
//   5. sessions  select coach_id   .gte("date",...).in("coach_id",ids)
//   6. availability_slots select coach_id,day_of_week .in("coach_id",ids)
// ============================================================

interface PulseFixture {
  newCentres?: number;
  newParents?: number;
  churnRisks?: Array<{ centre_id: string }>;
  coaches?: Array<{ id: string }>;
  sessions?: Array<{ coach_id: string | null }>;
  availability?: Array<{ coach_id: string; day_of_week: number }>;
}

function installFixture(opts: PulseFixture = {}) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centres") {
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              count: opts.newCentres ?? 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "parent_profiles") {
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              count: opts.newParents ?? 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "churn_risk_indicators") {
      return {
        select: () => ({
          in: () => ({
            is: () =>
              Promise.resolve({
                data: opts.churnRisks ?? [],
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: opts.coaches ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          gte: () => ({
            in: () =>
              Promise.resolve({ data: opts.sessions ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === "availability_slots") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: opts.availability ?? [], error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getIntelligenceStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture();
    const pulse = await getIntelligenceStatusPulse();
    expect(pulse).toEqual({
      newCentresThisMonthCount: 0,
      openChurnRisksCount: 0,
      lowUtilisationCoachesCount: 0,
      newParentsThisMonthCount: 0,
    });
  });

  it("dedupes churn-risk rows down to distinct centres", async () => {
    installFixture({
      churnRisks: [
        { centre_id: "c1" },
        { centre_id: "c1" }, // duplicate row, same centre
        { centre_id: "c2" },
      ],
    });
    const pulse = await getIntelligenceStatusPulse();
    expect(pulse.openChurnRisksCount).toBe(2);
  });

  it("passes new-centres + new-parents head counts through", async () => {
    installFixture({ newCentres: 3, newParents: 7 });
    const pulse = await getIntelligenceStatusPulse();
    expect(pulse.newCentresThisMonthCount).toBe(3);
    expect(pulse.newParentsThisMonthCount).toBe(7);
  });

  it("flags coaches whose utilisation < 30% over 90 days", async () => {
    // c1: 5 weekly slots × 13 weeks = 65 capacity → 10 sessions → 15% — low
    // c2: 5 weekly slots × 13 weeks = 65 capacity → 30 sessions → 46% — fine
    installFixture({
      coaches: [{ id: "c1" }, { id: "c2" }],
      sessions: [
        ...Array.from({ length: 10 }, () => ({ coach_id: "c1" as string | null })),
        ...Array.from({ length: 30 }, () => ({ coach_id: "c2" as string | null })),
      ],
      availability: [
        ...Array.from({ length: 5 }, (_, i) => ({
          coach_id: "c1",
          day_of_week: i,
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          coach_id: "c2",
          day_of_week: i,
        })),
      ],
    });
    const pulse = await getIntelligenceStatusPulse();
    expect(pulse.lowUtilisationCoachesCount).toBe(1);
  });

  it("swallows thrown errors and returns zeros (hard fail safety net)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getIntelligenceStatusPulse();
    expect(pulse).toEqual({
      newCentresThisMonthCount: 0,
      openChurnRisksCount: 0,
      lowUtilisationCoachesCount: 0,
      newParentsThisMonthCount: 0,
    });
  });
});
