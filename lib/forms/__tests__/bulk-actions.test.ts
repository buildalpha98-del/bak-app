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
  bulkPublishTemplates,
  bulkArchiveTemplates,
  bulkDuplicateTemplates,
  exportTemplatesCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================

interface MockTemplate {
  id: string;
  name: string;
  form_type?: string;
  fields_json?: unknown[];
  is_default?: boolean;
  centre_id?: string | null;
  created_at?: string;
}

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  templates?: Map<string, MockTemplate>;
  centres?: Map<string, { id: string; name: string }>;
  // Force update failure on these ids (publish/archive paths).
  failUpdateIds?: Set<string>;
  // Force insert failure when duplicating these template ids (treated
  // as the "source" id of the duplicate operation).
  failInsertIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const templates = opts.templates ?? new Map();
  const centres = opts.centres ?? new Map();
  const failUpdateIds = opts.failUpdateIds ?? new Set<string>();
  const failInsertIds = opts.failInsertIds ?? new Set<string>();

  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const activityLogs: Array<{ action: string; entity_id: string }> = [];

  // Counter so we can route subsequent inserts (template insert
  // then activity_log insert).
  let insertCallSource: string | null = null;

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
    if (table === "form_templates") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => templates.has(id))
                .map((id) => templates.get(id)),
              error: null,
            }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            if (failUpdateIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced update failure for ${id}` },
              });
            }
            updates.push({ id, patch });
            return Promise.resolve({ error: null });
          },
        }),
        insert: (row: Record<string, unknown>) => {
          // Track the source-id for failure routing.
          insertCallSource = (row as { name: string }).name;
          const failByName = Array.from(failInsertIds).some(
            (sid) =>
              templates.get(sid)?.name &&
              `${templates.get(sid)?.name} (Copy)` === insertCallSource,
          );
          if (failByName) {
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: "forced insert failure" },
                  }),
              }),
            };
          }
          inserts.push(row);
          const insertedId = `inserted-${inserts.length}`;
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: insertedId },
                  error: null,
                }),
            }),
          };
        },
      };
    }
    if (table === "centres") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => centres.has(id))
                .map((id) => centres.get(id)),
              error: null,
            }),
        }),
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

  return { updates, inserts, activityLogs };
}

// ============================================================
// bulkPublishTemplates
// ============================================================

describe("bulkPublishTemplates", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkPublishTemplates([]);
    expect(result).toEqual({
      published: 0,
      errors: [],
      error: "No templates selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkPublishTemplates(["t1"]);
    expect(result.published).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("strips the [Archived] prefix on the happy path (admin)", async () => {
    const templates = new Map<string, MockTemplate>([
      ["t1", { id: "t1", name: "[Archived] Incident Form" }],
      ["t2", { id: "t2", name: "[Archived] Risk Assessment" }],
    ]);
    const ctx = mockCtx({ role: "admin", templates });
    const result = await bulkPublishTemplates(["t1", "t2"]);
    expect(result.published).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(ctx.updates).toEqual([
      { id: "t1", patch: { name: "Incident Form" } },
      { id: "t2", patch: { name: "Risk Assessment" } },
    ]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "form_template_bulk_published",
      ),
    ).toHaveLength(2);
  });

  it("treats already-published templates as no-op writes but still counts them", async () => {
    const templates = new Map<string, MockTemplate>([
      ["t1", { id: "t1", name: "Already Live" }],
    ]);
    const ctx = mockCtx({ role: "ops", templates });
    const result = await bulkPublishTemplates(["t1"]);
    expect(result.published).toBe(1);
    expect(ctx.updates).toHaveLength(0);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "form_template_bulk_published",
      ),
    ).toHaveLength(1);
  });

  it("captures per-id update failures without sinking the whole batch", async () => {
    const templates = new Map<string, MockTemplate>([
      ["t1", { id: "t1", name: "[Archived] One" }],
      ["t2", { id: "t2", name: "[Archived] Two" }],
      ["t3", { id: "t3", name: "[Archived] Three" }],
    ]);
    const ctx = mockCtx({
      role: "admin",
      templates,
      failUpdateIds: new Set(["t2"]),
    });
    const result = await bulkPublishTemplates(["t1", "t2", "t3"]);
    expect(result.published).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("t2");
    expect(ctx.updates).toEqual([
      { id: "t1", patch: { name: "One" } },
      { id: "t3", patch: { name: "Three" } },
    ]);
  });
});

// ============================================================
// bulkArchiveTemplates
// ============================================================

describe("bulkArchiveTemplates", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkArchiveTemplates([]);
    expect(result).toEqual({
      archived: 0,
      errors: [],
      error: "No templates selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkArchiveTemplates(["t1"]);
    expect(result.archived).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("prefixes [Archived] on the happy path (admin)", async () => {
    const templates = new Map<string, MockTemplate>([
      ["t1", { id: "t1", name: "Custom Form", is_default: false }],
      ["t2", { id: "t2", name: "Other Custom", is_default: false }],
    ]);
    const ctx = mockCtx({ role: "admin", templates });
    const result = await bulkArchiveTemplates(["t1", "t2"]);
    expect(result.archived).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates).toEqual([
      { id: "t1", patch: { name: "[Archived] Custom Form" } },
      { id: "t2", patch: { name: "[Archived] Other Custom" } },
    ]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "form_template_bulk_archived",
      ),
    ).toHaveLength(2);
  });

  it("refuses to archive default templates and surfaces a per-id error", async () => {
    const templates = new Map<string, MockTemplate>([
      ["t1", { id: "t1", name: "Attendance", is_default: true }],
    ]);
    const ctx = mockCtx({ role: "admin", templates });
    const result = await bulkArchiveTemplates(["t1"]);
    expect(result.archived).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("t1");
    expect(ctx.updates).toHaveLength(0);
  });
});

// ============================================================
// bulkDuplicateTemplates
// ============================================================

describe("bulkDuplicateTemplates", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkDuplicateTemplates([]);
    expect(result).toEqual({
      duplicated: 0,
      errors: [],
      error: "No templates selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDuplicateTemplates(["t1"]);
    expect(result.duplicated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("inserts a copy of each selected template on the happy path", async () => {
    const templates = new Map<string, MockTemplate>([
      [
        "t1",
        {
          id: "t1",
          name: "Original",
          form_type: "attendance",
          fields_json: [],
          is_default: false,
        },
      ],
      [
        "t2",
        {
          id: "t2",
          name: "[Archived] Stale",
          form_type: "incident",
          fields_json: [{ id: "f1" }],
          is_default: false,
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", templates });
    const result = await bulkDuplicateTemplates(["t1", "t2"]);
    expect(result.duplicated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.inserts).toHaveLength(2);
    expect(ctx.inserts[0]).toMatchObject({
      name: "Original (Copy)",
      form_type: "attendance",
    });
    // Archive prefix gets stripped before "(Copy)" suffix.
    expect(ctx.inserts[1]).toMatchObject({
      name: "Stale (Copy)",
      form_type: "incident",
    });
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "form_template_bulk_duplicated",
      ),
    ).toHaveLength(2);
  });
});

// ============================================================
// exportTemplatesCsv
// ============================================================

describe("exportTemplatesCsv", () => {
  it("rejects empty selection up front", async () => {
    const result = await exportTemplatesCsv([]);
    expect(result).toEqual({ csv: null, error: "No templates selected." });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await exportTemplatesCsv(["t1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("returns a CSV with header + one row per template", async () => {
    const templates = new Map<string, MockTemplate>([
      [
        "t1",
        {
          id: "t1",
          name: "Attendance",
          form_type: "attendance",
          fields_json: [
            { id: "f1", locked: false },
            { id: "f2", locked: true }, // locked field, excluded from count
            { id: "f3", locked: false },
          ] as unknown[],
          is_default: true,
          centre_id: "c1",
          created_at: "2026-06-01T12:00:00Z",
        },
      ],
    ]);
    const centres = new Map([["c1", { id: "c1", name: "Sunshine Centre" }]]);
    const ctx = mockCtx({ role: "admin", templates, centres });
    const result = await exportTemplatesCsv(["t1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    const lines = (result.csv ?? "").split("\n");
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Field count");
    expect(lines[0]).toContain("Default");
    expect(lines[0]).toContain("Centre");
    expect(lines[1]).toContain("Attendance");
    expect(lines[1]).toContain("Yes");
    expect(lines[1]).toContain("Sunshine Centre");
    // Field count excludes locked fields: 3 - 1 = 2.
    expect(lines[1]).toContain(",2,");
    // Activity-log entry recorded.
    expect(
      ctx.activityLogs.some(
        (l) => l.action === "form_templates_exported_csv",
      ),
    ).toBe(true);
  });
});
