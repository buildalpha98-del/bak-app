import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, triggerNotificationMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  triggerNotificationMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => supabaseMock,
}));
vi.mock("@/lib/notifications/send", () => ({
  triggerNotification: triggerNotificationMock,
}));

import {
  bulkReassignTasks,
  bulkMarkComplete,
  bulkChangePriority,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  triggerNotificationMock.mockResolvedValue(undefined);
});

// ============================================================
// Common mock harness
// ============================================================
//
// Each bulk action reads + writes against:
//   - profiles (role gate)
//   - tasks    (per-id read for the "from" value, then update)
//   - task_columns (only bulkMarkComplete — final-column lookup)
//   - task_activity (per-row activity insert)
//   - activity_log (per-row audit insert)
//
// The fixture below routes each table by inspecting the chain
// shape. Failures are forced via the `failOnIds` set.

interface FixtureOpts {
  role?: "admin" | "ops" | "coach";
  // Tasks to claim already exist and what their pre-state was.
  // Default: every accessed id returns { priority: 'medium',
  // assignee_id: null, column_id: 'col-todo', title: 'T-<id>' }.
  taskRows?: Record<
    string,
    {
      priority?: string;
      assignee_id?: string | null;
      column_id?: string;
      title?: string;
    }
  >;
  // Force a tasks.update failure for this id set.
  failOnIds?: Set<string>;
  // Optional: who the reassign assignee is. Provided => profile lookup
  // succeeds with this email/role pair.
  assigneeProfile?: { id: string; email: string; name: string; role: string };
  // Final column rows for bulkMarkComplete.
  finalColumn?: { id: string; name: string } | null;
}

interface Recorders {
  taskUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  activityInserts: string[];
  auditInserts: string[];
}

function installFixture(opts: FixtureOpts = {}): Recorders {
  const role = opts.role ?? "admin";
  const failOnIds = opts.failOnIds ?? new Set<string>();
  const taskRows = opts.taskRows ?? {};
  // Note: use `in` rather than `??` so an explicit `null` (the "no final
  // column configured" branch) doesn't get silently defaulted back to the
  // happy-path fixture.
  const finalColumn =
    "finalColumn" in opts ? opts.finalColumn : { id: "done-col", name: "Done" };

  const recorders: Recorders = {
    taskUpdates: [],
    activityInserts: [],
    auditInserts: [],
  };

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "viewer-1" } },
  });

  // Two callers hit `profiles`:
  //   1. The role-gate (returns viewer's role) — fires first.
  //   2. bulkReassignTasks looking up the assignee's contact info —
  //      fires immediately after the gate when assigneeId is non-null.
  // A simple call counter is enough to disambiguate.
  let profilesCall = 0;
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      profilesCall += 1;
      const isGate = profilesCall === 1;
      return {
        select: () => ({
          eq: () => ({
            single: () => {
              if (isGate) {
                return Promise.resolve({ data: { role }, error: null });
              }
              return Promise.resolve({
                data: opts.assigneeProfile ?? null,
                error: opts.assigneeProfile ? null : { message: "no assignee" },
              });
            },
          }),
        }),
      };
    }
    if (table === "tasks") {
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            single: () => {
              const row = taskRows[id] ?? {
                priority: "medium",
                assignee_id: null,
                column_id: "col-todo",
                title: `T-${id}`,
              };
              return Promise.resolve({ data: row, error: null });
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            recorders.taskUpdates.push({ id, patch });
            if (failOnIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced failure for ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "task_columns") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () =>
                  Promise.resolve({
                    data: finalColumn,
                    error: finalColumn ? null : { message: "no final col" },
                  }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "task_activity") {
      return {
        insert: (row: { task_id: string }) => {
          recorders.activityInserts.push(row.task_id);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { entity_id: string }) => {
          recorders.auditInserts.push(row.entity_id);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return recorders;
}

// ============================================================
// Auth gate
// ============================================================

describe("bulk task actions — auth gate", () => {
  it("rejects coaches with Insufficient permissions on reassign", async () => {
    installFixture({ role: "coach" });
    const r = await bulkReassignTasks(["t1"], null);
    expect(r).toEqual({ updated: 0, error: "Insufficient permissions." });
  });

  it("rejects empty selection without an auth call (reassign)", async () => {
    const r = await bulkReassignTasks([], null);
    expect(r).toEqual({ updated: 0, error: "No tasks selected." });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });
});

// ============================================================
// bulkReassignTasks
// ============================================================

describe("bulkReassignTasks", () => {
  it("updates every task and writes an activity + audit row each (happy path)", async () => {
    const recorders = installFixture({
      role: "admin",
      taskRows: {
        t1: { assignee_id: null, title: "First", column_id: "col-todo", priority: "medium" },
        t2: { assignee_id: "old-user", title: "Second", column_id: "col-todo", priority: "medium" },
      },
      assigneeProfile: {
        id: "new-user",
        email: "n@example.com",
        name: "New",
        role: "coach",
      },
    });

    const r = await bulkReassignTasks(["t1", "t2"], "new-user");
    expect(r).toEqual({ updated: 2, error: null });
    expect(recorders.taskUpdates.map((u) => u.id)).toEqual(["t1", "t2"]);
    expect(recorders.taskUpdates[0].patch).toEqual({ assignee_id: "new-user" });
    expect(recorders.activityInserts).toEqual(["t1", "t2"]);
    expect(recorders.auditInserts).toEqual(["t1", "t2"]);
  });

  it("surfaces a partial failure when one row errors", async () => {
    installFixture({
      role: "ops",
      failOnIds: new Set(["t2"]),
    });

    const r = await bulkReassignTasks(["t1", "t2", "t3"], null);
    expect(r.updated).toBe(2);
    expect(r.error).toContain("Updated 2 of 3");
    expect(r.error).toContain("forced failure for t2");
  });
});

// ============================================================
// bulkMarkComplete
// ============================================================

describe("bulkMarkComplete", () => {
  it("moves every task into the final column with column_order=0", async () => {
    const recorders = installFixture({
      role: "admin",
      taskRows: {
        t1: { column_id: "col-todo", title: "First", priority: "medium", assignee_id: null },
        t2: { column_id: "col-doing", title: "Second", priority: "medium", assignee_id: null },
      },
      finalColumn: { id: "done-col", name: "Done" },
    });

    const r = await bulkMarkComplete(["t1", "t2"]);
    expect(r).toEqual({ updated: 2, error: null });
    expect(recorders.taskUpdates[0].patch).toEqual({
      column_id: "done-col",
      column_order: 0,
    });
    expect(recorders.taskUpdates[1].patch).toEqual({
      column_id: "done-col",
      column_order: 0,
    });
    expect(recorders.auditInserts).toEqual(["t1", "t2"]);
  });

  it("bails when no final column exists", async () => {
    installFixture({ role: "admin", finalColumn: null });
    const r = await bulkMarkComplete(["t1"]);
    expect(r).toEqual({ updated: 0, error: "No final column configured." });
  });
});

// ============================================================
// bulkChangePriority
// ============================================================

describe("bulkChangePriority", () => {
  it("updates priority on every task + records activity when the value changed", async () => {
    const recorders = installFixture({
      role: "admin",
      taskRows: {
        t1: { priority: "medium", assignee_id: null, column_id: "col", title: "T1" },
        t2: { priority: "urgent", assignee_id: null, column_id: "col", title: "T2" },
      },
    });

    const r = await bulkChangePriority(["t1", "t2"], "urgent");
    expect(r).toEqual({ updated: 2, error: null });
    expect(recorders.taskUpdates[0].patch).toEqual({ priority: "urgent" });
    // t2 was already urgent — no activity row written, but the task
    // still counts as updated (idempotent semantics).
    expect(recorders.activityInserts).toEqual(["t1"]);
  });
});
