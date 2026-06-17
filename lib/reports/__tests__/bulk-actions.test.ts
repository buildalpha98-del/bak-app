import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import {
  bulkSendReports,
  bulkDeleteDraftReports,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Mock fixtures
// ============================================================
//
// Both bulk actions follow the same shape:
//   1. auth.getUser() → user id
//   2. profiles.select(role).eq().single() → role gate
//   3. centre_reports.select("id, status").in() → partition pre-check
//   4. per id: centre_reports.update().eq() OR .delete().eq()
//   5. per success: activity_log.insert()
//
// We expose `updates`, `deletes`, `logs` as observable side-effects.

interface AuthOpts {
  role?: "admin" | "ops" | "coach";
  /** Existing report rows used by the pre-check. */
  existing?: Array<{ id: string; status: "draft" | "sent" }>;
  /** Force a per-row failure for these ids. */
  failOnIds?: Set<string>;
}

function mockReportsHarness(opts: AuthOpts = {}) {
  const role = opts.role ?? "admin";
  const existing = opts.existing ?? [];
  const failOnIds = opts.failOnIds ?? new Set<string>();

  const updates: string[] = [];
  const deletes: string[] = [];
  const logs: string[] = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "viewer-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { role }, error: null }),
          }),
        }),
      };
    }
    if (table === "centre_reports") {
      return {
        // Pre-check: .select("id, status").in("id", ids)
        select: () => ({
          in: () => Promise.resolve({ data: existing, error: null }),
        }),
        update: () => ({
          eq: (_col: string, id: string) => {
            updates.push(id);
            if (failOnIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced failure for ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletes.push(id);
            if (failOnIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced delete failure for ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { entity_id: string }) => {
          logs.push(row.entity_id);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates, deletes, logs };
}

// ============================================================
// bulkSendReports
// ============================================================

describe("bulkSendReports", () => {
  it("rejects coaches with an Insufficient-permissions error", async () => {
    mockReportsHarness({
      role: "coach",
      existing: [{ id: "r1", status: "draft" }],
    });
    const result = await bulkSendReports(["r1"], ["a@x.com"]);
    expect(result.sent).toBe(0);
    expect(result.error).toBe("Insufficient permissions.");
  });

  it("transitions every draft on the happy path", async () => {
    const { updates, logs } = mockReportsHarness({
      role: "admin",
      existing: [
        { id: "r1", status: "draft" },
        { id: "r2", status: "draft" },
        { id: "r3", status: "draft" },
      ],
    });
    const result = await bulkSendReports(
      ["r1", "r2", "r3"],
      ["centre@example.com"]
    );
    expect(result).toEqual({ sent: 3, alreadySent: 0, error: null });
    expect(updates).toEqual(["r1", "r2", "r3"]);
    expect(logs).toEqual(["r1", "r2", "r3"]);
  });

  it("skips already-sent reports and counts them as alreadySent", async () => {
    const { updates } = mockReportsHarness({
      role: "ops",
      existing: [
        { id: "r1", status: "draft" },
        { id: "r2", status: "sent" },
        { id: "r3", status: "draft" },
      ],
    });
    const result = await bulkSendReports(
      ["r1", "r2", "r3"],
      ["centre@example.com"]
    );
    expect(result.sent).toBe(2);
    expect(result.alreadySent).toBe(1);
    expect(result.error).toBeNull();
    // r2 must not have been included in the update batch.
    expect(updates).toEqual(["r1", "r3"]);
  });

  it("surfaces a partial-failure message when one update fails", async () => {
    const { updates, logs } = mockReportsHarness({
      role: "admin",
      existing: [
        { id: "r1", status: "draft" },
        { id: "r2", status: "draft" },
        { id: "r3", status: "draft" },
      ],
      failOnIds: new Set(["r2"]),
    });
    const result = await bulkSendReports(
      ["r1", "r2", "r3"],
      ["centre@example.com"]
    );
    expect(result.sent).toBe(2);
    expect(result.error).toContain("Sent 2 of 3");
    expect(result.error).toContain("forced failure for r2");
    expect(updates).toEqual(["r1", "r2", "r3"]);
    expect(logs).toEqual(["r1", "r3"]);
  });

  it("rejects empty selection up front", async () => {
    const result = await bulkSendReports([], ["a@x.com"]);
    expect(result).toEqual({
      sent: 0,
      alreadySent: 0,
      error: "No reports selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects empty recipient list up front", async () => {
    const result = await bulkSendReports(["r1"], []);
    expect(result.sent).toBe(0);
    expect(result.error).toBe("At least one recipient is required.");
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });
});

// ============================================================
// bulkDeleteDraftReports
// ============================================================

describe("bulkDeleteDraftReports", () => {
  it("rejects coaches with an Insufficient-permissions error", async () => {
    mockReportsHarness({
      role: "coach",
      existing: [{ id: "r1", status: "draft" }],
    });
    const result = await bulkDeleteDraftReports(["r1"]);
    expect(result.deleted).toBe(0);
    expect(result.error).toBe("Insufficient permissions.");
  });

  it("skips already-sent reports and only deletes drafts", async () => {
    const { deletes, logs } = mockReportsHarness({
      role: "admin",
      existing: [
        { id: "r1", status: "draft" },
        { id: "r2", status: "sent" },
        { id: "r3", status: "draft" },
      ],
    });
    const result = await bulkDeleteDraftReports(["r1", "r2", "r3"]);
    expect(result.deleted).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.error).toBeNull();
    // r2 (sent) must NOT have been deleted — protecting the audit trail.
    expect(deletes).toEqual(["r1", "r3"]);
    expect(logs).toEqual(["r1", "r3"]);
  });

  it("returns 0 deletions when the selection is all already-sent", async () => {
    const { deletes } = mockReportsHarness({
      role: "ops",
      existing: [
        { id: "r1", status: "sent" },
        { id: "r2", status: "sent" },
      ],
    });
    const result = await bulkDeleteDraftReports(["r1", "r2"]);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.error).toContain("already sent");
    expect(deletes).toEqual([]);
  });

  it("rejects empty selection up front", async () => {
    const result = await bulkDeleteDraftReports([]);
    expect(result).toEqual({
      deleted: 0,
      skipped: 0,
      error: "No reports selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });
});
