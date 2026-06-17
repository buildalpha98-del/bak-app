import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Hoist a single Supabase mock so the test module captures it before
// the dynamic import of `status-pulse-actions` resolves.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getStaffStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers
// ============================================================
//
// Mirrors the centres-status-pulse fixture pattern: per-test we
// install per-table handlers via `mockImplementation` so we can drive
// the four (or five) Supabase calls independently.

interface PulseFixture {
  /** Profiles returned for the "active" id-set lookup. */
  activeProfiles: Array<{ id: string; role: string }>;
  /** Compliance docs flagged as expired (no profile-active filter). */
  expiredDocs?: Array<{ user_id: string; expiry_date: string }>;
  pendingCount?: number;
  onboardingCount?: number;
  /** Week-window sessions (coach_id rows). */
  weekSessions?: Array<{ coach_id: string | null }>;
}

function installFixture(opts: PulseFixture) {
  const expiredDocs = opts.expiredDocs ?? [];
  const pendingCount = opts.pendingCount ?? 0;
  const onboardingCount = opts.onboardingCount ?? 0;
  const weekSessions = opts.weekSessions ?? [];

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: (_cols: string, opts2?: { count?: string; head?: boolean }) => {
          if (opts2?.head) {
            // The head:true onboarding count.
            return {
              eq: () =>
                Promise.resolve({
                  count: onboardingCount,
                  data: null,
                  error: null,
                }),
            };
          }
          // Plain active-profiles read.
          return {
            eq: () =>
              Promise.resolve({
                data: opts.activeProfiles,
                error: null,
              }),
          };
        },
      };
    }
    if (table === "compliance_docs") {
      return {
        select: (_cols: string, opts2?: { count?: string; head?: boolean }) => {
          if (opts2?.head) {
            // Pending head count.
            return {
              eq: () =>
                Promise.resolve({
                  count: pendingCount,
                  data: null,
                  error: null,
                }),
            };
          }
          // Expired docs select chain: .lt(...).not(...) → thenable.
          return {
            lt: () => ({
              not: () =>
                Promise.resolve({
                  data: expiredDocs,
                  error: null,
                }),
            }),
          };
        },
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          gte: () => ({
            lte: () => ({
              neq: () => ({
                not: () =>
                  Promise.resolve({
                    data: weekSessions,
                    error: null,
                  }),
              }),
            }),
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

describe("getStaffStatusPulse", () => {
  it("returns expected shape with a mix of counts", async () => {
    installFixture({
      activeProfiles: [
        { id: "c1", role: "coach" },
        { id: "c2", role: "coach" },
        { id: "c3", role: "coach" },
        { id: "a1", role: "admin" },
      ],
      expiredDocs: [
        // c1 active → counted; missing-from-active → not counted
        { user_id: "c1", expiry_date: "2020-01-01" },
        { user_id: "unknown", expiry_date: "2020-01-01" },
      ],
      pendingCount: 3,
      onboardingCount: 2,
      // c1 was rostered; c2 + c3 not rostered → not-rostered = 2.
      // Admin a1 excluded from the denominator by role.
      weekSessions: [{ coach_id: "c1" }],
    });

    const pulse = await getStaffStatusPulse();
    expect(pulse).toEqual({
      expiredCertsCount: 1,
      pendingVerificationsCount: 3,
      notRosteredThisWeekCount: 2,
      onboardingCount: 2,
    });
  });

  it("returns clean zeros when nothing matches", async () => {
    installFixture({
      activeProfiles: [],
      expiredDocs: [],
      pendingCount: 0,
      onboardingCount: 0,
      weekSessions: [],
    });

    const pulse = await getStaffStatusPulse();
    expect(pulse).toEqual({
      expiredCertsCount: 0,
      pendingVerificationsCount: 0,
      notRosteredThisWeekCount: 0,
      onboardingCount: 0,
    });
  });

  it("excludes admins/ops from the not-rostered denominator", async () => {
    installFixture({
      activeProfiles: [
        { id: "c1", role: "coach" },
        { id: "ops1", role: "ops" },
        { id: "admin1", role: "admin" },
      ],
      // Nobody rostered → only c1 should land on the count.
      weekSessions: [],
    });

    const pulse = await getStaffStatusPulse();
    expect(pulse.notRosteredThisWeekCount).toBe(1);
  });

  it("limits expired-cert count to active profiles only", async () => {
    installFixture({
      activeProfiles: [{ id: "active-coach", role: "coach" }],
      expiredDocs: [
        { user_id: "active-coach", expiry_date: "2020-01-01" },
        { user_id: "inactive-or-archived", expiry_date: "2020-01-01" },
      ],
    });

    const pulse = await getStaffStatusPulse();
    expect(pulse.expiredCertsCount).toBe(1);
  });

  it("swallows thrown errors and returns all zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getStaffStatusPulse();
    expect(pulse).toEqual({
      expiredCertsCount: 0,
      pendingVerificationsCount: 0,
      notRosteredThisWeekCount: 0,
      onboardingCount: 0,
    });
  });
});
