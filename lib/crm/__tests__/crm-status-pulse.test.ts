import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoisted shared mocks — vi.mock factories are top-of-file hoisted so
// any state they capture has to live in vi.hoisted. Mirror the pattern
// used in lib/centres/__tests__/centres-status-pulse.test.ts and
// lib/roster/__tests__/roster-status-pulse.test.ts.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { from: vi.fn() },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getCrmStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

interface PulseMockOpts {
  /** Count returned for the .lt("next_follow_up_date", …) overdue query. */
  overdueCount: number;
  /** Count returned for the .gte/.lte("trial_end_date", …) trials query. */
  trialsCount: number;
  /** Active-stage leads (used to derive stale). Provide created_at iso. */
  activeLeads?: Array<{ id: string; created_at: string }>;
  /** Recent activities (last 7 days) — used to derive stale via set-difference. */
  recentActivities?: Array<{ lead_id: string }>;
  /** Email_opened/clicked activities in the last 48h — derives hot count. */
  hotActivities?: Array<{ lead_id: string }>;
}

/**
 * The action fires:
 *   - leads.select(head).lt(next_follow_up_date).not(...).in(stage)  → overdueCount
 *   - leads.select(head).eq(stage,free_trial).gte(...).lte(...)        → trialsCount
 *   - leads.select("id, created_at").in(stage, ACTIVE)                  → activeLeads
 *   - lead_activities.select("lead_id").gte("created_at", 7d)           → recentActivities
 *   - lead_activities.select("lead_id").in("type", […]).gte(48h)         → hotActivities
 *
 * Tell each call apart by the chain shape. We track flags as `select`
 * builders walk and resolve at the terminating step.
 */
function mockQueries(opts: PulseMockOpts) {
  const activeLeads = opts.activeLeads ?? [];
  const recentActivities = opts.recentActivities ?? [];
  const hotActivities = opts.hotActivities ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "leads") {
      const state = {
        isHeadCount: false,
        hasLt: false,
        hasEqFreeTrial: false,
        hasInStageProjection: false,
      };

      const builder: Record<string, unknown> = {};

      // The .select() decides whether this is a head-count or a row
      // projection. We don't get the second arg from a chain-method
      // mock easily, so we use a simpler heuristic: if `.select` is
      // called with no args or with a tuple containing "id, created_at"
      // we treat it as the projection. Production code calls it with
      // an options arg {count:'exact', head:true} for the head paths.
      builder.select = (
        ..._args: unknown[]
      ) => {
        const second = _args[1] as { count?: string; head?: boolean } | undefined;
        if (second && second.head === true) {
          state.isHeadCount = true;
        }
        return builder;
      };
      builder.lt = (col: string) => {
        if (col === "next_follow_up_date") state.hasLt = true;
        return builder;
      };
      builder.gte = () => builder;
      builder.lte = () => {
        // The trial-end-date chain ends with .lte("trial_end_date", sunday).
        // It's a head-count, comes after .eq("stage","free_trial"),
        // so when both flags are set we can terminate here.
        if (state.hasEqFreeTrial) {
          return Promise.resolve({
            data: null,
            count: opts.trialsCount,
            error: null,
          });
        }
        return builder;
      };
      builder.not = () => builder;
      builder.eq = (col: string, val: string) => {
        if (col === "stage" && val === "free_trial") {
          state.hasEqFreeTrial = true;
        }
        return builder;
      };
      builder.in = () => {
        // Two .in("stage", ACTIVE) chains: (a) head-count overdue (after
        // .lt), and (b) the row projection (no head). The head-count
        // chain terminates at .in (it's the last call in the production
        // code). The projection chain also terminates at .in.
        if (state.isHeadCount && state.hasLt) {
          return Promise.resolve({
            data: null,
            count: opts.overdueCount,
            error: null,
          });
        }
        // Row projection — active leads.
        return Promise.resolve({ data: activeLeads, error: null });
      };
      return builder;
    }

    if (table === "lead_activities") {
      const state = { hasIn: false };
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.in = () => {
        state.hasIn = true;
        return builder;
      };
      builder.gte = () => {
        if (state.hasIn) {
          // hot activities chain terminates here (.in then .gte)
          return Promise.resolve({ data: hotActivities, error: null });
        }
        // recent activities — terminates here (.gte only)
        return Promise.resolve({ data: recentActivities, error: null });
      };
      return builder;
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe("getCrmStatusPulse", () => {
  it("returns expected shape with mocked Supabase", async () => {
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockQueries({
      overdueCount: 4,
      trialsCount: 2,
      activeLeads: [
        { id: "l1", created_at: oldIso }, // old + no activity → stale
        { id: "l2", created_at: oldIso }, // old + activity     → not stale
        { id: "l3", created_at: oldIso }, // old + no activity → stale
      ],
      recentActivities: [{ lead_id: "l2" }],
      hotActivities: [{ lead_id: "l5" }, { lead_id: "l6" }],
    });

    const pulse = await getCrmStatusPulse();
    expect(pulse).toEqual({
      staleCount: 2,
      overdueFollowupCount: 4,
      trialsEndingThisWeekCount: 2,
      hotLeadsCount: 2,
    });
  });

  it("treats brand-new (<7d) active leads as fresh, not stale", async () => {
    const recentIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockQueries({
      overdueCount: 0,
      trialsCount: 0,
      activeLeads: [
        { id: "fresh-1", created_at: recentIso },
        { id: "fresh-2", created_at: recentIso },
      ],
      recentActivities: [],
      hotActivities: [],
    });

    const pulse = await getCrmStatusPulse();
    expect(pulse.staleCount).toBe(0);
  });

  it("dedupes the hot-leads count by lead_id", async () => {
    mockQueries({
      overdueCount: 0,
      trialsCount: 0,
      activeLeads: [],
      recentActivities: [],
      hotActivities: [
        // Same lead triggered both an open + a click in the 48h window —
        // should count once, not twice.
        { lead_id: "hot-1" },
        { lead_id: "hot-1" },
        { lead_id: "hot-2" },
      ],
    });

    const pulse = await getCrmStatusPulse();
    expect(pulse.hotLeadsCount).toBe(2);
  });

  it("returns all zeros cleanly when nothing matches", async () => {
    mockQueries({
      overdueCount: 0,
      trialsCount: 0,
      activeLeads: [],
      recentActivities: [],
      hotActivities: [],
    });

    const pulse = await getCrmStatusPulse();
    expect(pulse).toEqual({
      staleCount: 0,
      overdueFollowupCount: 0,
      trialsEndingThisWeekCount: 0,
      hotLeadsCount: 0,
    });
  });

  it("returns safe zeros on a thrown error rather than crashing the page", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });

    const pulse = await getCrmStatusPulse();
    expect(pulse).toEqual({
      staleCount: 0,
      overdueFollowupCount: 0,
      trialsEndingThisWeekCount: 0,
      hotLeadsCount: 0,
    });
  });
});
