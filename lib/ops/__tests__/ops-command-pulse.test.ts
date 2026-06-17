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

import { getOpsCommandPulse } from "../command-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// getOpsCommandPulse fans out across:
//   1. sessions.eq(date, today).is(coach_id, null)         → unassigned today
//   2. sessions.eq(date, today).eq(status, "needs_replacement") → needs_replacement today
//   3. sessions.eq(status,"pending_confirmation").gte(date,today).lte(date,+48h).not(coach_id,null)
//   4. equipment_logs.eq(action,"issue_flagged").order().limit(50)
//   5. tasks.eq(linked_entity_type,"equipment_kit").eq(source,"equipment_issue").in(linked_entity_id, …)
//
// Setup helper installs a stateful router that walks the call sequence
// for sessions (which is queried three times) and returns each
// branch's count in order.
// ============================================================

interface PulseFixture {
  unassignedToday?: number;
  needsReplacementToday?: number;
  unconfirmedWindow?: number;
  /** Equipment logs returned (kit_id only is what matters). */
  equipmentLogs?: Array<{ kit_id: string }>;
  /** Kit ids whose linked task is already in a final column. */
  resolvedKitIds?: string[];
}

function installFixture(opts: PulseFixture) {
  const unassignedToday = opts.unassignedToday ?? 0;
  const needsReplacementToday = opts.needsReplacementToday ?? 0;
  const unconfirmedWindow = opts.unconfirmedWindow ?? 0;
  const equipmentLogs = opts.equipmentLogs ?? [];
  const resolvedKitIds = new Set(opts.resolvedKitIds ?? []);

  let sessionsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "sessions") {
      sessionsCall += 1;
      const callIdx = sessionsCall;
      // The three call shapes:
      //   1. .select("id",{count,head:true}).eq("date",today).is("coach_id",null)
      //   2. .select("id",{count,head:true}).eq("date",today).eq("status","needs_replacement")
      //   3. .select("id",{count,head:true}).eq("status","pending_confirmation").gte().lte().not("coach_id","is",null)
      return {
        select: () => {
          if (callIdx === 1) {
            return {
              eq: () => ({
                is: () =>
                  Promise.resolve({
                    count: unassignedToday,
                    data: null,
                    error: null,
                  }),
              }),
            };
          }
          if (callIdx === 2) {
            return {
              eq: () => ({
                eq: () =>
                  Promise.resolve({
                    count: needsReplacementToday,
                    data: null,
                    error: null,
                  }),
              }),
            };
          }
          // call 3 — unconfirmed window
          return {
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  not: () =>
                    Promise.resolve({
                      count: unconfirmedWindow,
                      data: null,
                      error: null,
                    }),
                }),
              }),
            }),
          };
        },
      };
    }

    if (table === "equipment_logs") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: equipmentLogs,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }

    if (table === "tasks") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: Array.from(resolvedKitIds).map((kid) => ({
                    linked_entity_id: kid,
                    column: { is_final: true },
                  })),
                  error: null,
                }),
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe("getOpsCommandPulse", () => {
  it("returns clean zeros on a quiet day", async () => {
    installFixture({});
    const pulse = await getOpsCommandPulse();
    expect(pulse).toEqual({
      needsCoachTodayCount: 0,
      unconfirmedShiftsCount: 0,
      equipmentIssuesCount: 0,
    });
  });

  it("sums unassigned + needs_replacement into needsCoachTodayCount", async () => {
    installFixture({
      unassignedToday: 2,
      needsReplacementToday: 3,
    });
    const pulse = await getOpsCommandPulse();
    expect(pulse.needsCoachTodayCount).toBe(5);
  });

  it("passes the unconfirmed shifts window count through", async () => {
    installFixture({ unconfirmedWindow: 7 });
    const pulse = await getOpsCommandPulse();
    expect(pulse.unconfirmedShiftsCount).toBe(7);
  });

  it("counts unresolved equipment issues only (excludes resolved kits)", async () => {
    installFixture({
      equipmentLogs: [
        { kit_id: "kit-1" },
        { kit_id: "kit-2" },
        { kit_id: "kit-3" },
      ],
      resolvedKitIds: ["kit-2"],
    });
    const pulse = await getOpsCommandPulse();
    expect(pulse.equipmentIssuesCount).toBe(2);
  });

  it("counts each open issue log (multiple reports on the same kit count separately)", async () => {
    installFixture({
      equipmentLogs: [
        { kit_id: "kit-1" },
        { kit_id: "kit-1" },
        { kit_id: "kit-1" },
      ],
      resolvedKitIds: [],
    });
    const pulse = await getOpsCommandPulse();
    // Three flagged reports against kit-1 with no resolved task →
    // three open issues. This matches the existing getEquipmentIssues
    // widget which lists each log row separately.
    expect(pulse.equipmentIssuesCount).toBe(3);
  });

  it("counts a kit's issues as zero once a follow-up task lands in a final column", async () => {
    installFixture({
      equipmentLogs: [
        { kit_id: "kit-1" },
        { kit_id: "kit-1" },
      ],
      resolvedKitIds: ["kit-1"],
    });
    const pulse = await getOpsCommandPulse();
    // Even if multiple flag reports exist for kit-1, once the linked
    // task is resolved, all are dropped from the unresolved count.
    expect(pulse.equipmentIssuesCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getOpsCommandPulse();
    expect(pulse).toEqual({
      needsCoachTodayCount: 0,
      unconfirmedShiftsCount: 0,
      equipmentIssuesCount: 0,
    });
  });
});
