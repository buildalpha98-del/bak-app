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
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  bulkMarkFeedbackRead,
  bulkAcknowledgeFeedback,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================
//
// The bulk helpers fan out:
//   1. auth.getUser
//   2. profiles select role
//   3. feedback_ratings .update().in(ids).is(ack_at,null).select(id)
//   4. activity_log .insert(...)
//
// We route `feedback_ratings` by chain shape: only the update path is
// exercised (no plain select). `failUpdate` forces the .select() call
// at the tail of the update chain to return an error.

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  /** ids that count as "already acknowledged" (filtered by .is(ack_at,null)). */
  alreadyReadIds?: Set<string>;
  /** Force the update-step .select() to return an error string. */
  failUpdate?: boolean;
}

function mockCtx(opts: MockCtxOpts) {
  const alreadyReadIds = opts.alreadyReadIds ?? new Set<string>();
  const failUpdate = opts.failUpdate ?? false;

  const updates: Array<{ ids: string[]; patch: Record<string, unknown> }> = [];
  const activityLogs: Array<{
    action: string;
    metadata: Record<string, unknown>;
  }> = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { role: opts.role },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "feedback_ratings") {
      return {
        update: (patch: Record<string, unknown>) => ({
          in: (_col: string, ids: string[]) => ({
            is: () => ({
              select: () => {
                if (failUpdate) {
                  return Promise.resolve({
                    data: null,
                    error: { message: "forced update failure" },
                  });
                }
                const effective = ids.filter((id) => !alreadyReadIds.has(id));
                updates.push({ ids: effective, patch });
                return Promise.resolve({
                  data: effective.map((id) => ({ id })),
                  error: null,
                });
              },
            }),
          }),
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { action: string; metadata: Record<string, unknown> }) => {
          activityLogs.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates, activityLogs };
}

// ============================================================
// bulkMarkFeedbackRead
// ============================================================

describe("bulkMarkFeedbackRead", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkMarkFeedbackRead([]);
    expect(result).toEqual({ updated: 0, error: "No feedback selected." });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkMarkFeedbackRead(["f1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("marks all selected as read on the happy path (admin)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkMarkFeedbackRead(["f1", "f2", "f3"]);
    expect(result).toEqual({ updated: 3, error: null });
    expect(ctx.updates).toHaveLength(1);
    expect(ctx.updates[0].ids).toEqual(["f1", "f2", "f3"]);
    expect(ctx.updates[0].patch).toMatchObject({
      acknowledged_by: "actor-1",
    });
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "feedback_bulk_marked_read"
      )
    ).toHaveLength(1);
  });

  it("skips rows already acknowledged (the .is filter narrows the result)", async () => {
    // f2 is already read — only f1 + f3 should land in the updated count.
    const ctx = mockCtx({
      role: "ops",
      alreadyReadIds: new Set(["f2"]),
    });
    const result = await bulkMarkFeedbackRead(["f1", "f2", "f3"]);
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates[0].ids).toEqual(["f1", "f3"]);
  });

  it("surfaces update errors and emits no activity log on full failure", async () => {
    const ctx = mockCtx({ role: "admin", failUpdate: true });
    const result = await bulkMarkFeedbackRead(["f1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("forced update failure");
    expect(ctx.activityLogs).toHaveLength(0);
  });
});

// ============================================================
// bulkAcknowledgeFeedback
// ============================================================

describe("bulkAcknowledgeFeedback", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkAcknowledgeFeedback([], "noted");
    expect(result).toEqual({ updated: 0, error: "No feedback selected." });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("acknowledges with a note (records note in activity-log metadata)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkAcknowledgeFeedback(["f1", "f2"], "  Called centre  ");
    expect(result).toEqual({ updated: 2, error: null });

    const entry = ctx.activityLogs.find(
      (l) => l.action === "feedback_bulk_acknowledged"
    );
    expect(entry).toBeTruthy();
    expect(entry?.metadata).toMatchObject({
      count: 2,
      note: "Called centre", // trimmed
    });
  });

  it("skips already-acknowledged rows (mirrors mark-read narrowing)", async () => {
    const ctx = mockCtx({
      role: "ops",
      alreadyReadIds: new Set(["f1"]),
    });
    const result = await bulkAcknowledgeFeedback(["f1", "f2"], "");
    expect(result.updated).toBe(1);
    expect(ctx.updates[0].ids).toEqual(["f2"]);
    // An empty note still acknowledges; metadata.note normalises to null.
    const entry = ctx.activityLogs.find(
      (l) => l.action === "feedback_bulk_acknowledged"
    );
    expect(entry?.metadata).toMatchObject({ note: null });
  });
});
