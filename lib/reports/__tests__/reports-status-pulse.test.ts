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

import { getReportsStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — per-table mock routing
// ============================================================
//
// The action fans out:
//   1. centre_reports head count where status='draft' (.eq("status",
//      "draft"))
//   2. centre_reports head count where sent_at >= Monday
//      (.gte("sent_at", monday))
//   3. centre_reports head count where status='draft' AND
//      created_at < 14d-ago (.eq().lt())
//   4. centres select(id) where contract_status in
//      ['active','trial']
//   5. terms select(id) where status='active' (.eq().limit().maybeSingle())
//   6. (only if active term exists) centre_reports select(centre_id)
//      where term_id = activeTerm.id
//
// We route by call-index for centre_reports because three calls all
// hit that table with different chain shapes.

interface PulseFixture {
  draftsCount?: number;
  sentThisWeekCount?: number;
  overdueCount?: number;
  activeCentres?: Array<{ id: string }>;
  activeTerm?: { id: string; name: string } | null;
  reportsForTerm?: Array<{ centre_id: string }>;
}

function installFixture(opts: PulseFixture) {
  const draftsCount = opts.draftsCount ?? 0;
  const sentThisWeekCount = opts.sentThisWeekCount ?? 0;
  const overdueCount = opts.overdueCount ?? 0;
  const activeCentres = opts.activeCentres ?? [];
  const activeTerm = opts.activeTerm ?? null;
  const reportsForTerm = opts.reportsForTerm ?? [];

  let centreReportsCall = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "centre_reports") {
      centreReportsCall += 1;
      // Call #1: head count where status='draft'.
      if (centreReportsCall === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            eq: () =>
              Promise.resolve({
                count: opts2?.head ? draftsCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      // Call #2: head count where sent_at >= Monday.
      if (centreReportsCall === 2) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            gte: () =>
              Promise.resolve({
                count: opts2?.head ? sentThisWeekCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      // Call #3: head count where status='draft' AND created_at <
      // 14d-ago. .eq().lt() chain.
      if (centreReportsCall === 3) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean }
          ) => ({
            eq: () => ({
              lt: () =>
                Promise.resolve({
                  count: opts2?.head ? overdueCount : 0,
                  data: null,
                  error: null,
                }),
            }),
          }),
        };
      }
      // Call #4: select(centre_id) where term_id = activeTerm.id.
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({ data: reportsForTerm, error: null }),
        }),
      };
    }
    if (table === "centres") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: activeCentres, error: null }),
        }),
      };
    }
    if (table === "terms") {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: activeTerm, error: null }),
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

describe("getReportsStatusPulse", () => {
  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getReportsStatusPulse();
    expect(pulse).toEqual({
      draftsCount: 0,
      sentThisWeekCount: 0,
      overdueCount: 0,
      centresWithoutReportCount: 0,
    });
  });

  it("passes the drafts head count through", async () => {
    installFixture({ draftsCount: 4 });
    const pulse = await getReportsStatusPulse();
    expect(pulse.draftsCount).toBe(4);
  });

  it("passes the sent-this-week head count through", async () => {
    installFixture({ sentThisWeekCount: 7 });
    const pulse = await getReportsStatusPulse();
    expect(pulse.sentThisWeekCount).toBe(7);
  });

  it("passes the overdue head count through (drafts > 14d old)", async () => {
    installFixture({ overdueCount: 2 });
    const pulse = await getReportsStatusPulse();
    expect(pulse.overdueCount).toBe(2);
  });

  it("computes centres-without-report as active centres minus covered", async () => {
    installFixture({
      activeCentres: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      activeTerm: { id: "t-active", name: "Term 2" },
      // c1 already has a report for the active term; c2 + c3 don't → 2.
      reportsForTerm: [{ centre_id: "c1" }],
    });
    const pulse = await getReportsStatusPulse();
    expect(pulse.centresWithoutReportCount).toBe(2);
  });

  it("returns 0 centresWithoutReport when there's no active term", async () => {
    installFixture({
      activeCentres: [{ id: "c1" }, { id: "c2" }],
      activeTerm: null,
    });
    const pulse = await getReportsStatusPulse();
    // No active term → we don't know which term to compare against,
    // so the bucket safely reports zero rather than flagging every
    // centre.
    expect(pulse.centresWithoutReportCount).toBe(0);
  });

  it("swallows thrown errors and returns all zeros (defensive)", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getReportsStatusPulse();
    expect(pulse).toEqual({
      draftsCount: 0,
      sentThisWeekCount: 0,
      overdueCount: 0,
      centresWithoutReportCount: 0,
    });
  });
});
