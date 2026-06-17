import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, opsApproveSwapMock, opsRejectSwapMock, triggerNotificationMock } =
  vi.hoisted(() => ({
    supabaseMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    },
    opsApproveSwapMock: vi.fn(),
    opsRejectSwapMock: vi.fn(),
    triggerNotificationMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));
vi.mock("@/lib/sessions/shift-actions", () => ({
  opsApproveSwap: opsApproveSwapMock,
  opsRejectSwap: opsRejectSwapMock,
}));
vi.mock("@/lib/notifications/send", () => ({
  triggerNotification: triggerNotificationMock,
}));

import {
  getInboxItems,
  getInboxCounts,
  acknowledgeInboxItem,
} from "../actions";
import { INBOX_LIMIT } from "../types";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Mock context — per-table input-based routing
// ============================================================
//
// Every helper in actions.ts fans out across 8 source tables plus
// `profiles` for the auth gate. We route by table name and chain
// shape, mirroring the bulk-actions test approach in
// /lib/feedback/__tests__.
//
// Each table's data is supplied via `data` — shape per table is
// the SELECT shape used by the corresponding loader, so the loader
// can map straight through. We use lenient thenables that always
// resolve to `{ data, error: null }` regardless of which `.eq()`
// / `.lte()` / `.is()` / `.gte()` / `.not()` / `.order()` /
// `.limit()` get chained on top.

interface MockCtxOpts {
  role?: "admin" | "ops" | "coach";
  authed?: boolean;
  tasks?: Array<Record<string, unknown>>;
  notifications?: Array<Record<string, unknown>>;
  feedback?: Array<Record<string, unknown>>;
  needsReplacement?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  churn?: Array<Record<string, unknown>>;
  unconfirmed?: Array<Record<string, unknown>>;
  swaps?: Array<Record<string, unknown>>;
  /** When a notification mark_read happens, surface the patch. */
  recordUpdate?: (table: string, patch: Record<string, unknown>) => void;
  activityLog?: Array<{ action: string; metadata: Record<string, unknown> }>;
}

function lenientQuery(rows: Array<Record<string, unknown>>) {
  // A thenable that resolves to { data: rows, error: null } and
  // also exposes every chainable method as a passthrough so the
  // loader can stack any combination.
  const make = (): {
    then: PromiseLike<unknown>["then"];
    eq: () => unknown;
    lte: () => unknown;
    lt: () => unknown;
    gte: () => unknown;
    is: () => unknown;
    in: () => unknown;
    not: () => unknown;
    order: () => unknown;
    limit: () => unknown;
    select: () => unknown;
    single: () => unknown;
  } => {
    const chain = {
      then: ((onFulfilled?: ((value: unknown) => unknown) | null) =>
        Promise.resolve({ data: rows, error: null }).then(onFulfilled)) as PromiseLike<unknown>["then"],
      eq: () => make(),
      lte: () => make(),
      lt: () => make(),
      gte: () => make(),
      is: () => make(),
      in: () => make(),
      not: () => make(),
      order: () => make(),
      limit: () => make(),
      select: () => make(),
      single: () =>
        Promise.resolve({ data: rows[0] ?? null, error: null }),
    };
    return chain;
  };
  return make();
}

function mockCtx(opts: MockCtxOpts = {}) {
  const role = opts.role ?? "admin";
  const authed = opts.authed ?? true;
  const activityLog = opts.activityLog ?? [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: authed ? { id: "user-1" } : null },
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
    if (table === "task_columns") {
      // `getInboxItems` reads this to fetch final col ids.
      // `acknowledgeInboxItem` (task complete) reads it for final col.
      return {
        select: () => ({
          eq: () => {
            // For status-pulse-style chained .eq() (returns thenable).
            const thenable: PromiseLike<unknown> & {
              order?: () => unknown;
            } = {
              then: ((onFulfilled?: ((value: unknown) => unknown) | null) =>
                Promise.resolve({
                  data: [{ id: "done-col" }],
                  error: null,
                }).then(onFulfilled)) as PromiseLike<unknown>["then"],
            };
            thenable.order = () => ({
              limit: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "done-col" }, error: null }),
              }),
            });
            return thenable;
          },
        }),
      };
    }
    if (table === "tasks") {
      return {
        select: () => lenientQuery(opts.tasks ?? []),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            opts.recordUpdate?.(table, patch);
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    }
    if (table === "notifications") {
      return {
        select: () => lenientQuery(opts.notifications ?? []),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => {
              opts.recordUpdate?.(table, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      };
    }
    if (table === "feedback_ratings") {
      return {
        select: () => lenientQuery(opts.feedback ?? []),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            is: () => {
              opts.recordUpdate?.(table, patch);
              return Promise.resolve({ data: null, error: null });
            },
          }),
        }),
      };
    }
    if (table === "sessions") {
      // `loadNeedsReplacementItems` filters status="needs_replacement",
      // `loadUnconfirmedShiftItems` filters status="pending_confirmation".
      // We can't distinguish without arg-tracking — but both source
      // loaders for this test fixture accept any rows tagged with a
      // `__source` discriminator. To keep the routing simple we serve
      // both via the same lenient mock and let the caller assemble.
      const merged = [
        ...(opts.needsReplacement ?? []),
        ...(opts.unconfirmed ?? []),
      ];
      return {
        select: () => lenientQuery(merged),
      };
    }
    if (table === "direct_messages") {
      return {
        select: () => lenientQuery(opts.messages ?? []),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              is: () => {
                opts.recordUpdate?.(table, patch);
                return Promise.resolve({ data: null, error: null });
              },
            }),
          }),
        }),
      };
    }
    if (table === "centres") {
      return {
        select: () => lenientQuery(opts.churn ?? []),
      };
    }
    if (table === "swap_requests") {
      return {
        select: () => lenientQuery(opts.swaps ?? []),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { action: string; metadata: Record<string, unknown> }) => {
          activityLog.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { activityLog };
}

// ============================================================
// getInboxItems — fan-out
// ============================================================

describe("getInboxItems", () => {
  it("fans out across all 8 sources and concatenates results", async () => {
    mockCtx({
      role: "admin",
      tasks: [
        {
          id: "t1",
          title: "Task 1",
          description: null,
          priority: "medium",
          due_date: null,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      notifications: [
        {
          id: "n1",
          type: "info",
          title: "Notif 1",
          body: "body",
          tier: "informational",
          entity_type: null,
          entity_id: null,
          created_at: "2025-01-02T00:00:00Z",
        },
      ],
      feedback: [
        {
          id: "fb1",
          rating: 1,
          comment: "bad",
          sport: "Soccer",
          centre_id: "c1",
          submitted_at: "2025-01-03T00:00:00Z",
          created_at: "2025-01-03T00:00:00Z",
          centres: { name: "Centre One" },
        },
      ],
      needsReplacement: [
        {
          id: "s1",
          sport: "Soccer",
          date: "2026-07-01",
          time: "09:00",
          centre_id: "c1",
          updated_at: "2025-01-04T00:00:00Z",
          status: "needs_replacement",
          centres: { name: "Centre One" },
        },
      ],
      messages: [
        {
          id: "m1",
          sender_id: "u-sender",
          content: "Hi",
          created_at: "2025-01-05T00:00:00Z",
          sender: { name: "Sender" },
        },
      ],
      churn: [
        {
          id: "c1",
          name: "Centre One",
          health_score: 25,
          churn_risk: true,
          updated_at: "2025-01-06T00:00:00Z",
        },
      ],
      unconfirmed: [],
      swaps: [
        {
          id: "sw1",
          session_id: "s2",
          requesting_coach_id: "u-r",
          proposed_coach_id: "u-p",
          created_at: "2025-01-07T00:00:00Z",
          sessions: {
            sport: "Soccer",
            date: "2026-07-02",
            time: "10:00",
            centres: { name: "Centre One" },
          },
          requesting: { name: "Ramy" },
          proposed: { name: "Sam" },
        },
      ],
    });

    const { data, error } = await getInboxItems("admin");
    expect(error).toBeNull();
    const sources = new Set(data.map((i) => i.source));
    // We expect at least 6 distinct sources to be represented.
    // (unconfirmed empty; sessions table returns needs_replacement rows
    // for both loaders in our shared mock — both loaders dedup by id
    // but the data shape suits "needs_replacement" so we cover that.)
    expect(sources.has("task")).toBe(true);
    expect(sources.has("notification")).toBe(true);
    expect(sources.has("flagged_feedback")).toBe(true);
    expect(sources.has("needs_replacement_shift")).toBe(true);
    expect(sources.has("unread_message")).toBe(true);
    expect(sources.has("churn_alert")).toBe(true);
    expect(sources.has("swap_request")).toBe(true);
  });

  it("sorts urgent items before important and informational", async () => {
    mockCtx({
      role: "ops",
      feedback: [
        {
          id: "fb1",
          rating: 1,
          comment: "x",
          sport: "Soccer",
          centre_id: "c1",
          submitted_at: "2025-01-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
          centres: { name: "Centre" },
        },
      ],
      notifications: [
        {
          id: "n1",
          type: "info",
          title: "Info notif",
          body: "b",
          tier: "informational",
          entity_type: null,
          entity_id: null,
          created_at: "2025-12-01T00:00:00Z",
        },
      ],
      messages: [
        {
          id: "m1",
          sender_id: "u-sender",
          content: "Hi",
          created_at: "2025-06-01T00:00:00Z",
          sender: { name: "Sender" },
        },
      ],
    });

    const { data } = await getInboxItems("ops");
    expect(data.length).toBeGreaterThan(0);
    // First item must be urgent.
    expect(data[0].tier).toBe("urgent");
    // Informational should sort after important/urgent.
    const lastTier = data[data.length - 1].tier;
    expect(lastTier).toBe("informational");
  });

  it("filters by source param", async () => {
    mockCtx({
      role: "admin",
      tasks: [
        {
          id: "t1",
          title: "T",
          description: null,
          priority: "medium",
          due_date: null,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
      notifications: [
        {
          id: "n1",
          type: "info",
          title: "N",
          body: "b",
          tier: "informational",
          entity_type: null,
          entity_id: null,
          created_at: "2025-01-02T00:00:00Z",
        },
      ],
    });

    const { data } = await getInboxItems("admin", { source: "task" });
    expect(data.every((i) => i.source === "task")).toBe(true);
    expect(data.length).toBe(1);
  });

  it("rejects coach role — coaches use their own surfaces", async () => {
    mockCtx({ role: "coach" });
    const result = await getInboxItems("coach");
    expect(result.data).toEqual([]);
    expect(result.error).toBe("Inbox is admin/ops only.");
  });

  it("returns empty inbox when there's nothing to triage", async () => {
    mockCtx({ role: "admin" });
    const { data, error } = await getInboxItems("admin");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("caps the merged list at INBOX_LIMIT (100)", async () => {
    // 120 notifications + 50 tasks → 170 → must cap at 100.
    const manyNotifs = Array.from({ length: 120 }, (_, i) => ({
      id: `n${i}`,
      type: "info",
      title: `Notif ${i}`,
      body: "b",
      tier: "informational" as const,
      entity_type: null,
      entity_id: null,
      created_at: `2025-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    const manyTasks = Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      description: null,
      priority: "medium",
      due_date: null,
      created_at: `2025-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    mockCtx({
      role: "admin",
      tasks: manyTasks,
      notifications: manyNotifs,
    });
    const { data } = await getInboxItems("admin");
    expect(data.length).toBe(INBOX_LIMIT);
  });

  it("rejects when no auth user is present", async () => {
    mockCtx({ authed: false });
    const result = await getInboxItems("admin");
    expect(result.data).toEqual([]);
    expect(result.error).toBe("Not authenticated.");
  });
});

// ============================================================
// getInboxCounts
// ============================================================

describe("getInboxCounts", () => {
  it("rolls up counts by tier", async () => {
    mockCtx({
      role: "admin",
      feedback: [
        {
          id: "fb1",
          rating: 1,
          comment: "x",
          sport: "Soccer",
          centre_id: "c1",
          submitted_at: "2025-01-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
          centres: { name: "Centre" },
        },
      ],
      messages: [
        {
          id: "m1",
          sender_id: "u-sender",
          content: "Hi",
          created_at: "2025-01-02T00:00:00Z",
          sender: { name: "Sender" },
        },
      ],
      notifications: [
        {
          id: "n1",
          type: "info",
          title: "Notif",
          body: "b",
          tier: "informational",
          entity_type: null,
          entity_id: null,
          created_at: "2025-01-03T00:00:00Z",
        },
      ],
    });

    const counts = await getInboxCounts();
    expect(counts.urgent).toBe(1);
    expect(counts.important).toBe(1);
    expect(counts.informational).toBe(1);
  });

  it("returns zeros for non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const counts = await getInboxCounts();
    expect(counts).toEqual({ urgent: 0, important: 0, informational: 0 });
  });
});

// ============================================================
// acknowledgeInboxItem — per-source dispatch + activity log
// ============================================================

describe("acknowledgeInboxItem", () => {
  it("dispatches task → complete (writes activity_log)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await acknowledgeInboxItem("task", "t1", "complete");
    expect(result.error).toBeNull();
    const entry = ctx.activityLog.find(
      (l) => l.action === "inbox_task_completed",
    );
    expect(entry).toBeTruthy();
  });

  it("dispatches notification → mark_read (writes activity_log)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await acknowledgeInboxItem(
      "notification",
      "n1",
      "mark_read",
    );
    expect(result.error).toBeNull();
    const entry = ctx.activityLog.find(
      (l) => l.action === "inbox_notification_read",
    );
    expect(entry).toBeTruthy();
  });

  it("dispatches flagged_feedback → acknowledge (writes activity_log)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await acknowledgeInboxItem(
      "flagged_feedback",
      "fb1",
      "acknowledge",
    );
    expect(result.error).toBeNull();
    const entry = ctx.activityLog.find(
      (l) => l.action === "inbox_feedback_acknowledged",
    );
    expect(entry).toBeTruthy();
  });

  it("dispatches swap_request → approve via opsApproveSwap helper", async () => {
    const ctx = mockCtx({ role: "admin" });
    opsApproveSwapMock.mockResolvedValue({ error: null });
    const result = await acknowledgeInboxItem("swap_request", "sw1", "approve");
    expect(result.error).toBeNull();
    expect(opsApproveSwapMock).toHaveBeenCalledWith("sw1");
    const entry = ctx.activityLog.find(
      (l) => l.action === "inbox_swap_approved",
    );
    expect(entry).toBeTruthy();
  });

  it("rejects acknowledgement attempts from a coach (auth gate)", async () => {
    mockCtx({ role: "coach" });
    const result = await acknowledgeInboxItem("task", "t1", "complete");
    expect(result.error).toBe("Inbox is admin/ops only.");
  });
});
