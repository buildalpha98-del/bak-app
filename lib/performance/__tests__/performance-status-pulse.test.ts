import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoist a single Supabase mock — the dynamic import of
// `status-pulse-actions` captures this stub at module-eval time.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getPerformanceStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Fixture helper
// ============================================================
//
// The status-pulse action fans out three Supabase calls:
//   - `profiles` (active coach id-set lookup)
//   - `coach_performance_snapshots` (period-scoped, latest-per-coach)
//   - `coach_badges` (head-count for the window)
//
// We model each with `mockImplementation` so per-test we control what
// each table returns. This mirrors the centres / staff / children pulse
// test pattern so future maintainers see one shape.

interface SnapshotFixture {
  coach_id: string;
  overall_score: number;
  feedback_count: number;
}

interface PulseFixture {
  activeCoachIds?: string[];
  snapshots?: SnapshotFixture[];
  newBadgesCount?: number;
}

function installFixture(opts: PulseFixture) {
  const activeCoachIds = opts.activeCoachIds ?? [];
  const snapshots = opts.snapshots ?? [];
  const newBadgesCount = opts.newBadgesCount ?? 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: activeCoachIds.map((id) => ({ id })),
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "coach_performance_snapshots") {
      return {
        select: () => ({
          in: () => ({
            gte: () => ({
              lte: () => ({
                order: () =>
                  Promise.resolve({
                    data: snapshots.map((s) => ({
                      coach_id: s.coach_id,
                      overall_score: s.overall_score,
                      metrics_json: {
                        // Only feedback_rating.count is read in the
                        // pulse path; the rest can be empty.
                        feedback_rating: { count: s.feedback_count, average: 0, trend: 0 },
                        session_volume: { count: 0, trend: 0 },
                        form_completion: { rate: 0, actual: 0, expected: 0 },
                        punctuality: {
                          average_minutes: 0,
                          late_count: 0,
                          total_tracked: 0,
                        },
                        shift_reliability: { rate: 0, completed: 0, total: 0 },
                        assessment_thoroughness: {
                          std_dev: 0,
                          avg_rating: 0,
                          flagged: false,
                        },
                        equipment_responsibility: {
                          issue_rate: 0,
                          issues: 0,
                          checkins: 0,
                        },
                        attendance_consistency: {
                          trend: "stable",
                          average_per_session: 0,
                        },
                      },
                      created_at: "2026-05-01T00:00:00Z",
                    })),
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "coach_badges") {
      return {
        select: (_cols: string, opts2?: { count?: string; head?: boolean }) => {
          if (opts2?.head) {
            return {
              in: () => ({
                gte: () => ({
                  lte: () =>
                    Promise.resolve({
                      count: newBadgesCount,
                      data: null,
                      error: null,
                    }),
                }),
              }),
            };
          }
          throw new Error("coach_badges expected head:true");
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getPerformanceStatusPulse", () => {
  it("returns the expected shape with mixed counts", async () => {
    installFixture({
      activeCoachIds: ["c1", "c2", "c3", "c4"],
      snapshots: [
        // c1: top performer (>=80), has feedback
        { coach_id: "c1", overall_score: 88, feedback_count: 12 },
        // c2: underperforming (<60), no feedback
        { coach_id: "c2", overall_score: 42, feedback_count: 0 },
        // c3: mid-range (no zero feedback, no benchmark hit)
        { coach_id: "c3", overall_score: 65, feedback_count: 5 },
        // c4: top performer + zero feedback
        { coach_id: "c4", overall_score: 80, feedback_count: 0 },
      ],
      newBadgesCount: 2,
    });

    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse).toEqual({
      underperformingCount: 1,
      topPerformerCount: 2,
      zeroFeedbackCount: 2,
      newBadgesCount: 2,
    });
  });

  it("returns clean zeros when no active coaches", async () => {
    installFixture({
      activeCoachIds: [],
    });
    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse).toEqual({
      underperformingCount: 0,
      topPerformerCount: 0,
      zeroFeedbackCount: 0,
      newBadgesCount: 0,
    });
  });

  it("treats a score of exactly 80 as a top performer (>= threshold)", async () => {
    // Threshold is `>= 80` per CLAUDE.md performance weights; a coach
    // landing exactly at 80 should tip into the top bucket so Abdul
    // sees them as a success rather than ignored.
    installFixture({
      activeCoachIds: ["c1", "c2"],
      snapshots: [
        { coach_id: "c1", overall_score: 80, feedback_count: 4 },
        { coach_id: "c2", overall_score: 79.999, feedback_count: 4 },
      ],
    });
    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse.topPerformerCount).toBe(1);
  });

  it("counts coaches with no snapshot as neither under nor top", async () => {
    // Prior-period gap — a coach exists but has no snapshot in window.
    // The pulse should not flag them as underperforming (score == 0)
    // because there's no row to evaluate. The view will simply omit
    // them; the pulse uses the snapshot set as the denominator.
    installFixture({
      activeCoachIds: ["c1", "c2", "c3"],
      snapshots: [{ coach_id: "c1", overall_score: 90, feedback_count: 6 }],
    });
    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse.underperformingCount).toBe(0);
    expect(pulse.topPerformerCount).toBe(1);
  });

  it("reads new-badges count from the period window only", async () => {
    installFixture({
      activeCoachIds: ["c1"],
      snapshots: [{ coach_id: "c1", overall_score: 70, feedback_count: 2 }],
      newBadgesCount: 5,
    });
    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse.newBadgesCount).toBe(5);
  });

  it("swallows thrown errors and returns all zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getPerformanceStatusPulse(
      "2026-05-01",
      "2026-05-31",
    );
    expect(pulse).toEqual({
      underperformingCount: 0,
      topPerformerCount: 0,
      zeroFeedbackCount: 0,
      newBadgesCount: 0,
    });
  });
});
