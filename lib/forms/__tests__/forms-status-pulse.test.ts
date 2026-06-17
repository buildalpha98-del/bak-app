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

import { getFormsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table mock routing
// ============================================================
//
// The action fans out:
//   1. `form_submissions` head count where submitted_at >= Monday
//      (the "submitted this week" bucket).
//   2. `form_templates` head count where name ilike '[Archived]%'
//      AND updated_at >= Monday.
//   3. `form_templates` select(id) where is_default = false
//      (non-default templates — drafts-pending candidate set).
//   4. `form_submissions` select(form_template_id) — used to
//      subtract from (3) for the drafts-pending derivation.
//   5. `sessions` select(id) .gte("date") .lte("date") .eq("status")
//      — completed sessions in the last 7d.
//   6. `form_submissions` select(session_id) .gte("submitted_at")
//      .not("session_id", "is", null) — covered session ids in 7d.
//
// Two `form_templates` calls and two `form_submissions` calls have to
// route by chain shape (head vs select). We use call-index counters.

interface PulseFixture {
  submittedThisWeek?: number;
  archivedThisWeek?: number;
  nonDefaultTemplates?: Array<{ id: string }>;
  allSubmittedTemplateIds?: Array<{ form_template_id: string }>;
  recentSessions?: Array<{ id: string }>;
  recentCoveredSubmissions?: Array<{ session_id: string | null }>;
}

function installFixture(opts: PulseFixture) {
  const submittedThisWeek = opts.submittedThisWeek ?? 0;
  const archivedThisWeek = opts.archivedThisWeek ?? 0;
  const nonDefaultTemplates = opts.nonDefaultTemplates ?? [];
  const allSubmittedTemplateIds = opts.allSubmittedTemplateIds ?? [];
  const recentSessions = opts.recentSessions ?? [];
  const recentCoveredSubmissions = opts.recentCoveredSubmissions ?? [];

  let formSubmissionsCall = 0;
  let formTemplatesCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "form_submissions") {
      formSubmissionsCall += 1;
      // Call #1: head count of submissions this week (.gte("submitted_at"))
      if (formSubmissionsCall === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean },
          ) => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? submittedThisWeek : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      // Call #2: select(form_template_id) (all-time submissions)
      if (formSubmissionsCall === 2) {
        return {
          select: () =>
            Promise.resolve({
              data: allSubmittedTemplateIds,
              error: null,
            }),
        };
      }
      // Call #3: select(session_id) .gte().not() for recent-coverage.
      return {
        select: () => ({
          gte: () => ({
            not: () =>
              Promise.resolve({
                data: recentCoveredSubmissions,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "form_templates") {
      formTemplatesCall += 1;
      // Call #1: head count of [Archived] ones (.ilike().gte())
      if (formTemplatesCall === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean },
          ) => ({
            ilike: () => ({
              gte: () =>
                Promise.resolve({
                  count: opts2?.head ? archivedThisWeek : 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      // Call #2: select(id) where is_default = false.
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: nonDefaultTemplates, error: null }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          gte: () => ({
            lte: () => ({
              eq: () =>
                Promise.resolve({ data: recentSessions, error: null }),
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

describe("getFormsStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getFormsStatusPulse();
    expect(pulse).toEqual({
      draftsPendingCount: 0,
      submittedThisWeekCount: 0,
      overdueCount: 0,
      archivedThisWeekCount: 0,
    });
  });

  it("passes the submitted-this-week head count through", async () => {
    installFixture({ submittedThisWeek: 7 });
    const pulse = await getFormsStatusPulse();
    expect(pulse.submittedThisWeekCount).toBe(7);
  });

  it("counts non-default templates with zero submissions as drafts pending", async () => {
    installFixture({
      nonDefaultTemplates: [{ id: "t1" }, { id: "t2" }, { id: "t3" }],
      // t1 has submissions, t2 + t3 don't → 2 drafts pending.
      allSubmittedTemplateIds: [{ form_template_id: "t1" }],
    });
    const pulse = await getFormsStatusPulse();
    expect(pulse.draftsPendingCount).toBe(2);
  });

  it("derives overdue as completed sessions in 7d minus covered sessions", async () => {
    installFixture({
      recentSessions: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      // s1 has a submission in the last 7d. s2 + s3 don't.
      recentCoveredSubmissions: [{ session_id: "s1" }],
    });
    const pulse = await getFormsStatusPulse();
    expect(pulse.overdueCount).toBe(2);
  });

  it("clamps overdue to >=0 when coverage exceeds session count (defensive)", async () => {
    installFixture({
      recentSessions: [{ id: "s1" }],
      // Covered set includes a stale session not in the recent list —
      // the difference would naively go negative, so we expect clamp.
      recentCoveredSubmissions: [
        { session_id: "s1" },
        { session_id: "s_other" },
      ],
    });
    const pulse = await getFormsStatusPulse();
    expect(pulse.overdueCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getFormsStatusPulse();
    expect(pulse).toEqual({
      draftsPendingCount: 0,
      submittedThisWeekCount: 0,
      overdueCount: 0,
      archivedThisWeekCount: 0,
    });
  });
});
