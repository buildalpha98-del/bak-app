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

import { getTrainingStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — input-based per-table routing
// ============================================================
//
// The action fans out:
//   1. `training_assignments` head count with .lt("due_date").not().neq()
//   2. `training_modules` head count with .gte("created_at", monday)
//   3. `profiles` select where role="coach" status="active"
//   4. `training_modules` select where is_mandatory=true status='published'
//   5. `training_completions` select coach_id (all-time)
//
// Then, conditionally:
//   6. `training_assignments` select(coach_id, module_id) .in(module_id).in(status)
//
// Each table mock is keyed by the chain shape so the fixture can
// return data tailored to which branch is being exercised.

interface PulseFixture {
  overdueCount?: number;
  newModulesCount?: number;
  coaches?: Array<{ id: string }>;
  mandatoryModules?: Array<{ id: string }>;
  completions?: Array<{ coach_id: string }>;
  openAssignments?: Array<{ coach_id: string; module_id: string }>;
}

function installFixture(opts: PulseFixture) {
  const overdueCount = opts.overdueCount ?? 0;
  const newModulesCount = opts.newModulesCount ?? 0;
  const coaches = opts.coaches ?? [];
  const mandatoryModules = opts.mandatoryModules ?? [];
  const completions = opts.completions ?? [];
  const openAssignments = opts.openAssignments ?? [];

  let trainingAssignmentsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "training_assignments") {
      trainingAssignmentsCall += 1;
      // Call #1: head-count overdue branch — .lt().not().neq() chain.
      if (trainingAssignmentsCall === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean },
          ) => ({
            lt: () => ({
              not: () => ({
                neq: () =>
                  Promise.resolve({
                    count: opts2?.head ? overdueCount : 0,
                    data: null,
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      // Call #2+: open-assignments select with .in().in() chain.
      return {
        select: () => ({
          in: () => ({
            in: () =>
              Promise.resolve({
                data: openAssignments,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "training_modules") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => {
          // Head-count new-this-week branch — .gte()
          if (opts2?.head) {
            return {
              gte: () =>
                Promise.resolve({
                  count: newModulesCount,
                  data: null,
                  error: null,
                }),
            };
          }
          // Plain select — mandatory published modules. .eq().eq()
          return {
            eq: () => ({
              eq: () =>
                Promise.resolve({ data: mandatoryModules, error: null }),
            }),
          };
        },
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: coaches, error: null }),
          }),
        }),
      };
    }
    if (table === "training_completions") {
      return {
        select: () => Promise.resolve({ data: completions, error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getTrainingStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getTrainingStatusPulse();
    expect(pulse).toEqual({
      overdueAssignmentsCount: 0,
      unassignedMandatoryCount: 0,
      newModulesThisWeekCount: 0,
      coachesZeroCompletionsCount: 0,
    });
  });

  it("passes the overdue head-count through", async () => {
    installFixture({ overdueCount: 3 });
    const pulse = await getTrainingStatusPulse();
    expect(pulse.overdueAssignmentsCount).toBe(3);
  });

  it("counts active coaches with no completion rows as zero-completion", async () => {
    installFixture({
      coaches: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      // c1 has a completion, c2 + c3 don't.
      completions: [{ coach_id: "c1" }],
    });
    const pulse = await getTrainingStatusPulse();
    expect(pulse.coachesZeroCompletionsCount).toBe(2);
  });

  it("scopes unassigned mandatory to (coach, module) pairs missing an open assignment", async () => {
    installFixture({
      coaches: [{ id: "c1" }, { id: "c2" }],
      mandatoryModules: [{ id: "m1" }, { id: "m2" }],
      // c1 has m1 open, c2 has m2 in_progress (both pulled via .in("status"))
      openAssignments: [
        { coach_id: "c1", module_id: "m1" },
        { coach_id: "c2", module_id: "m2" },
      ],
    });
    // 4 total pairs (2 × 2) minus 2 already open = 2 missing.
    const pulse = await getTrainingStatusPulse();
    expect(pulse.unassignedMandatoryCount).toBe(2);
  });

  it("swallows thrown errors and returns all zeros (role gate / hard fail)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getTrainingStatusPulse();
    expect(pulse).toEqual({
      overdueAssignmentsCount: 0,
      unassignedMandatoryCount: 0,
      newModulesThisWeekCount: 0,
      coachesZeroCompletionsCount: 0,
    });
  });
});
