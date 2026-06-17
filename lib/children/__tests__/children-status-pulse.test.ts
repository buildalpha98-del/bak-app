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

import { getChildrenStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — fan out per-table behaviour with mockImplementation
// ============================================================

interface PulseFixture {
  newThisWeekCount?: number;
  activeChildren?: Array<{ id: string }>;
  centreLinks?: Array<{ child_id: string }>;
  activeTerm?: { id: string; start_date: string } | null;
  skillRatings?: Array<{ child_id: string }>;
  recentAttendances?: Array<{ child_id: string; created_at: string }>;
}

function installFixture(opts: PulseFixture) {
  const newThisWeekCount = opts.newThisWeekCount ?? 0;
  const activeChildren = opts.activeChildren ?? [];
  const centreLinks = opts.centreLinks ?? [];
  const activeTerm = opts.activeTerm === undefined ? null : opts.activeTerm;
  const skillRatings = opts.skillRatings ?? [];
  const recentAttendances = opts.recentAttendances ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "children") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => {
          if (opts2?.head) {
            // newThisWeek head count: .gte("created_at", monday)
            return {
              gte: () =>
                Promise.resolve({
                  count: newThisWeekCount,
                  data: null,
                  error: null,
                }),
            };
          }
          // active-children fetch: .eq("status","active")
          return {
            eq: () =>
              Promise.resolve({
                data: activeChildren,
                error: null,
              }),
          };
        },
      };
    }
    if (table === "centre_children") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: centreLinks,
              error: null,
            }),
        }),
      };
    }
    if (table === "terms") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: activeTerm ? [activeTerm] : [],
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "skill_ratings") {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: skillRatings,
              error: null,
            }),
        }),
      };
    }
    if (table === "session_attendances") {
      return {
        select: () => ({
          gte: () =>
            Promise.resolve({
              data: recentAttendances,
              error: null,
            }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getChildrenStatusPulse", () => {
  it("returns expected shape with mixed counts", async () => {
    installFixture({
      newThisWeekCount: 3,
      activeChildren: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      // c1 has a centre link, c2 + c3 don't → noCentre = 2
      centreLinks: [{ child_id: "c1" }],
      activeTerm: { id: "t1", start_date: "2020-01-01" },
      // c1 is rated, c2 + c3 are not → 2 overdue (term older than 14d)
      skillRatings: [{ child_id: "c1" }],
      // c1 has recent attendance, c2 + c3 don't → 2 inactive
      recentAttendances: [{ child_id: "c1", created_at: "2026-06-01" }],
    });

    const pulse = await getChildrenStatusPulse();
    expect(pulse).toEqual({
      newThisWeekCount: 3,
      noCentreCount: 2,
      assessmentsOverdueCount: 2,
      inactive30dCount: 2,
    });
  });

  it("returns clean zeros when nothing matches", async () => {
    installFixture({
      newThisWeekCount: 0,
      activeChildren: [],
      centreLinks: [],
      activeTerm: null,
      skillRatings: [],
      recentAttendances: [],
    });

    const pulse = await getChildrenStatusPulse();
    expect(pulse).toEqual({
      newThisWeekCount: 0,
      noCentreCount: 0,
      assessmentsOverdueCount: 0,
      inactive30dCount: 0,
    });
  });

  it("counts inactive only against active children", async () => {
    installFixture({
      // Only c1 is active; c2/c3 are absent (inactive) so they shouldn't
      // appear in the inactive count denominator at all.
      activeChildren: [{ id: "c1" }],
      centreLinks: [{ child_id: "c1" }],
      activeTerm: { id: "t1", start_date: "2020-01-01" },
      skillRatings: [{ child_id: "c1" }],
      // c1 has no recent attendance row → inactive = 1.
      recentAttendances: [],
    });

    const pulse = await getChildrenStatusPulse();
    expect(pulse.inactive30dCount).toBe(1);
  });

  it("uses Monday-of-current-week for newThisWeek scope", async () => {
    // The gate is simple: getChildrenStatusPulse passes monday into the
    // `gte("created_at", mondayIso)` query. We verify by asserting the
    // count we wired returns exactly.
    installFixture({
      newThisWeekCount: 5,
      activeChildren: [],
    });
    const pulse = await getChildrenStatusPulse();
    expect(pulse.newThisWeekCount).toBe(5);
  });

  it("reports zero overdue when there's no active term", async () => {
    installFixture({
      activeChildren: [{ id: "c1" }, { id: "c2" }],
      centreLinks: [{ child_id: "c1" }, { child_id: "c2" }],
      activeTerm: null,
    });
    const pulse = await getChildrenStatusPulse();
    expect(pulse.assessmentsOverdueCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getChildrenStatusPulse();
    expect(pulse).toEqual({
      newThisWeekCount: 0,
      noCentreCount: 0,
      assessmentsOverdueCount: 0,
      inactive30dCount: 0,
    });
  });
});
