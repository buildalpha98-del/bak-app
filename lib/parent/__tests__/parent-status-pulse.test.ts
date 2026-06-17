import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getParentStatusPulse } from "../status-pulse-actions";

// ============================================================
// getParentStatusPulse() fans out across:
//   1. parent_profiles.select(id).eq(user_id,…).single → parentId
//   2. parent_children.select(child_id).eq(parent_id,…)  → childIds
//   3. bookings.select(bookable_sessions(date)) confirmed gte today → nextSession
//   4. bookings.head pending_payment                                  → unpaid
//   5. waitlist.head offered                                          → waitlistOffers
//   6. child_insights.head -14d on child_ids                          → newInsights
//   7. package_balances.select(expires_at, remaining_sessions) active → expiringPackages
// ============================================================

interface PulseFixture {
  parentId?: string | null;
  childIds?: string[];
  nextSessionDate?: string | null;
  unpaid?: number;
  waitlistOffers?: number;
  newInsights?: number;
  packageRows?: Array<{ expires_at: string; remaining_sessions: number }>;
}

function isoIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isoDateIn(days: number): string {
  return isoIn(days).split("T")[0];
}

function installFixture(opts: PulseFixture) {
  const parentId = opts.parentId === undefined ? "parent-1" : opts.parentId;
  const childIds = opts.childIds ?? ["child-1"];
  const sessionDate = opts.nextSessionDate ?? null;
  const unpaid = opts.unpaid ?? 0;
  const waitlistOffers = opts.waitlistOffers ?? 0;
  const newInsights = opts.newInsights ?? 0;
  const packageRows = opts.packageRows ?? [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "parent_profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: parentId ? { id: parentId } : null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "parent_children") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: childIds.map((id) => ({ child_id: id })),
              error: null,
            }),
        }),
      };
    }
    if (table === "bookings") {
      // First call → next session lookup (.gte chain ends with .limit)
      // Second call → unpaid count (.eq().eq() ends with head)
      return {
        select: (_: string, opts2?: { head?: boolean }) => {
          if (opts2?.head) {
            return {
              eq: () => ({
                eq: () =>
                  Promise.resolve({ count: unpaid, data: null, error: null }),
              }),
            };
          }
          return {
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: sessionDate
                          ? [{ bookable_sessions: { date: sessionDate } }]
                          : [],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        },
      };
    }
    if (table === "waitlist") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: () =>
                Promise.resolve({
                  count: waitlistOffers,
                  data: null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "child_insights") {
      return {
        select: () => ({
          in: () => ({
            gte: () =>
              Promise.resolve({
                count: newInsights,
                data: null,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "package_balances") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({ data: packageRows, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getParentStatusPulse", () => {
  it("returns calm zeros for a parent with nothing on", async () => {
    installFixture({});
    const pulse = await getParentStatusPulse();
    expect(pulse).toEqual({
      nextSessionDays: null,
      unpaidBookingsCount: 0,
      waitlistOffersCount: 0,
      newInsightsCount: 0,
      expiringPackagesCount: 0,
    });
  });

  it("returns all-zero when no auth user", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const pulse = await getParentStatusPulse();
    expect(pulse).toEqual({
      nextSessionDays: null,
      unpaidBookingsCount: 0,
      waitlistOffersCount: 0,
      newInsightsCount: 0,
      expiringPackagesCount: 0,
    });
  });

  it("computes days-until-next-session for a future booking", async () => {
    installFixture({ nextSessionDate: isoDateIn(4) });
    const pulse = await getParentStatusPulse();
    expect(pulse.nextSessionDays).toBe(4);
  });

  it("passes unpaid booking count through", async () => {
    installFixture({ unpaid: 2 });
    const pulse = await getParentStatusPulse();
    expect(pulse.unpaidBookingsCount).toBe(2);
  });

  it("passes waitlist offers count through", async () => {
    installFixture({ waitlistOffers: 1 });
    const pulse = await getParentStatusPulse();
    expect(pulse.waitlistOffersCount).toBe(1);
  });

  it("passes new insight count through", async () => {
    installFixture({ newInsights: 3 });
    const pulse = await getParentStatusPulse();
    expect(pulse.newInsightsCount).toBe(3);
  });

  it("flags packages expiring within 7 days as expiring", async () => {
    installFixture({
      packageRows: [
        { expires_at: isoIn(3), remaining_sessions: 5 },
        { expires_at: isoIn(60), remaining_sessions: 5 },
      ],
    });
    const pulse = await getParentStatusPulse();
    expect(pulse.expiringPackagesCount).toBe(1);
  });

  it("flags packages with <= 1 remaining session as expiring", async () => {
    installFixture({
      packageRows: [
        { expires_at: isoIn(60), remaining_sessions: 1 },
        { expires_at: isoIn(60), remaining_sessions: 8 },
      ],
    });
    const pulse = await getParentStatusPulse();
    expect(pulse.expiringPackagesCount).toBe(1);
  });

  it("skips insight query when parent has no kids", async () => {
    installFixture({ childIds: [], newInsights: 5 });
    const pulse = await getParentStatusPulse();
    // childIds is empty so child_insights query never runs
    expect(pulse.newInsightsCount).toBe(0);
  });

  it("swallows thrown errors and returns calm zeros", async () => {
    supabaseMock.auth.getUser.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getParentStatusPulse();
    expect(pulse).toEqual({
      nextSessionDays: null,
      unpaidBookingsCount: 0,
      waitlistOffersCount: 0,
      newInsightsCount: 0,
      expiringPackagesCount: 0,
    });
  });
});
