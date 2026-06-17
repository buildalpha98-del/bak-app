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
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  bulkPublishTrainingModules,
  bulkArchiveTrainingModules,
  bulkAssignTrainingModulesToAllCoaches,
  exportTrainingModulesCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  modules?: Map<
    string,
    {
      id: string;
      title: string;
      type?: string;
      category?: string;
      status?: string;
      is_mandatory?: boolean;
      estimated_minutes?: number | null;
      required_for_sports?: string[] | null;
      created_at?: string;
    }
  >;
  coaches?: Array<{ id: string }>;
  existingOpenAssignments?: Array<{ coach_id: string; module_id: string }>;
  // Force a per-id update failure (publish/archive paths).
  failUpdateIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const modules = opts.modules ?? new Map();
  const coaches = opts.coaches ?? [];
  const existingOpenAssignments = opts.existingOpenAssignments ?? [];
  const failUpdateIds = opts.failUpdateIds ?? new Set<string>();

  const updates: Array<{ id: string; status: string }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const activityLogs: Array<{ action: string; entity_id: string }> = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: (_cols: string) => ({
          // .eq("id", user.id).single() for the auth gate
          eq: (col: string, value: string) => {
            if (col === "id") {
              return {
                single: () =>
                  Promise.resolve({
                    data: { role: opts.role },
                    error: null,
                  }),
              };
            }
            // .eq("role", "coach").eq("status", "active") — coaches list
            return {
              eq: () => Promise.resolve({ data: coaches, error: null }),
            };
            void value;
          },
        }),
      };
    }
    if (table === "training_modules") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => modules.has(id))
                .map((id) => modules.get(id)),
              error: null,
            }),
        }),
        update: (patch: { status: string }) => ({
          eq: (_col: string, id: string) => {
            if (failUpdateIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced update failure for ${id}` },
              });
            }
            updates.push({ id, status: patch.status });
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "training_assignments") {
      return {
        select: () => ({
          in: () => ({
            in: () =>
              Promise.resolve({
                data: existingOpenAssignments,
                error: null,
              }),
          }),
        }),
        insert: (rows: Array<Record<string, unknown>>) => {
          for (const row of rows) inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "notifications") {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          for (const row of rows) notifications.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: { action: string; entity_id: string }) => {
          activityLogs.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates, inserts, notifications, activityLogs };
}

// ============================================================
// bulkPublishTrainingModules
// ============================================================

describe("bulkPublishTrainingModules", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkPublishTrainingModules([]);
    expect(result).toEqual({
      published: 0,
      errors: [],
      error: "No modules selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin/ops callers with 'Not authorised.'", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkPublishTrainingModules(["m1", "m2"]);
    expect(result.published).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("publishes all selected modules on the happy path (admin)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkPublishTrainingModules(["m1", "m2"]);
    expect(result.published).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(ctx.updates).toEqual([
      { id: "m1", status: "published" },
      { id: "m2", status: "published" },
    ]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "training_module_bulk_published",
      ),
    ).toHaveLength(2);
  });

  it("captures per-id update failures without sinking the whole batch", async () => {
    const ctx = mockCtx({
      role: "ops",
      failUpdateIds: new Set(["m2"]),
    });
    const result = await bulkPublishTrainingModules(["m1", "m2", "m3"]);
    expect(result.published).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("m2");
    expect(ctx.updates).toEqual([
      { id: "m1", status: "published" },
      { id: "m3", status: "published" },
    ]);
  });
});

// ============================================================
// bulkArchiveTrainingModules
// ============================================================

describe("bulkArchiveTrainingModules", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkArchiveTrainingModules([]);
    expect(result).toEqual({
      archived: 0,
      errors: [],
      error: "No modules selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkArchiveTrainingModules(["m1"]);
    expect(result.archived).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("archives all selected modules on the happy path", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkArchiveTrainingModules(["m1", "m2"]);
    expect(result.archived).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates).toEqual([
      { id: "m1", status: "archived" },
      { id: "m2", status: "archived" },
    ]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "training_module_bulk_archived",
      ),
    ).toHaveLength(2);
  });
});

// ============================================================
// bulkAssignTrainingModulesToAllCoaches
// ============================================================

describe("bulkAssignTrainingModulesToAllCoaches", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkAssignTrainingModulesToAllCoaches([]);
    expect(result).toEqual({
      assignments: 0,
      errors: [],
      error: "No modules selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkAssignTrainingModulesToAllCoaches(["m1"]);
    expect(result.assignments).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("assigns published modules to every active coach, skipping open assignments", async () => {
    const modules = new Map([
      [
        "m1",
        {
          id: "m1",
          title: "Safeguarding 101",
          status: "published",
        },
      ],
      [
        "m2",
        {
          id: "m2",
          title: "Soccer Drills",
          status: "published",
        },
      ],
    ]);
    const ctx = mockCtx({
      role: "admin",
      modules,
      coaches: [{ id: "c1" }, { id: "c2" }],
      // c1 already has m1 open → only m2 for c1 + both m1 and m2 for c2.
      existingOpenAssignments: [{ coach_id: "c1", module_id: "m1" }],
    });

    const result = await bulkAssignTrainingModulesToAllCoaches(["m1", "m2"]);
    expect(result.assignments).toBe(3);
    expect(result.error).toBeNull();
    expect(ctx.inserts).toHaveLength(3);
    expect(ctx.notifications).toHaveLength(3);
    // One activity log per module bulk-assigned.
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "training_module_bulk_assigned_all",
      ),
    ).toHaveLength(2);
  });

  it("skips unpublished modules in the selection and notes them as errors", async () => {
    const modules = new Map([
      [
        "m1",
        {
          id: "m1",
          title: "Draft Module",
          status: "draft",
        },
      ],
    ]);
    mockCtx({
      role: "admin",
      modules,
      coaches: [{ id: "c1" }],
    });
    const result = await bulkAssignTrainingModulesToAllCoaches(["m1"]);
    expect(result.assignments).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("not published");
  });
});

// ============================================================
// exportTrainingModulesCsv
// ============================================================

describe("exportTrainingModulesCsv", () => {
  it("rejects empty selection up front", async () => {
    const result = await exportTrainingModulesCsv([]);
    expect(result).toEqual({ csv: null, error: "No modules selected." });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await exportTrainingModulesCsv(["m1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("returns a CSV with header + one row per module", async () => {
    const modules = new Map([
      [
        "m1",
        {
          id: "m1",
          title: "Safeguarding 101",
          type: "video",
          category: "compliance",
          is_mandatory: true,
          status: "published",
          estimated_minutes: 15,
          required_for_sports: ["Soccer", "Cricket"],
          created_at: "2026-06-01T12:00:00Z",
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", modules });
    const result = await exportTrainingModulesCsv(["m1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    const lines = (result.csv ?? "").split("\n");
    expect(lines[0]).toContain("Title");
    expect(lines[0]).toContain("Required for sports");
    expect(lines[1]).toContain("Safeguarding 101");
    expect(lines[1]).toContain("Yes");
    expect(lines[1]).toContain("Soccer; Cricket");
    // Activity-log row recorded.
    expect(
      ctx.activityLogs.some(
        (l) => l.action === "training_modules_exported_csv",
      ),
    ).toBe(true);
  });
});
