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
  bulkArchiveDocuments,
  bulkDeleteDocuments,
  bulkSetVisibility,
  bulkTagDocuments,
  exportDocumentsCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  docs?: Map<
    string,
    {
      id: string;
      title: string;
      category?: string;
      tags?: string[] | null;
      visibility?: string;
      version?: number;
      created_at?: string;
      profiles?: { name: string } | null;
    }
  >;
  failUpdateIds?: Set<string>;
  failDeleteIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const docs = opts.docs ?? new Map();
  const failUpdateIds = opts.failUpdateIds ?? new Set<string>();
  const failDeleteIds = opts.failDeleteIds ?? new Set<string>();

  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const deletes: string[] = [];
  const activityLogs: Array<{
    action: string;
    entity_id: string;
    metadata?: Record<string, unknown>;
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
    if (table === "documents") {
      return {
        select: (cols: string) => ({
          in: (_col: string, ids: string[]) => {
            const rows = ids
              .filter((id) => docs.has(id))
              .map((id) => docs.get(id));
            return Promise.resolve({
              data: rows,
              error: null,
            });
          },
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
        delete: () => ({
          eq: (_col: string, id: string) => {
            if (failDeleteIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced delete failure for ${id}` },
              });
            }
            deletes.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === "activity_log") {
      return {
        insert: (row: {
          action: string;
          entity_id: string;
          metadata?: Record<string, unknown>;
        }) => {
          activityLogs.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { updates, deletes, activityLogs };
}

// ============================================================
// bulkArchiveDocuments
// ============================================================

describe("bulkArchiveDocuments", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkArchiveDocuments([]);
    expect(result).toEqual({
      updated: 0,
      errors: [],
      error: "No documents selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects coach callers with 'Not authorised.'", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkArchiveDocuments(["d1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("prefixes title with [Archived] and sets visibility=admin_only on happy path", async () => {
    const docs = new Map([
      ["d1", { id: "d1", title: "Risk Assessment" }],
      ["d2", { id: "d2", title: "Waiver Template" }],
    ]);
    const ctx = mockCtx({ role: "admin", docs });
    const result = await bulkArchiveDocuments(["d1", "d2"]);
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates).toHaveLength(2);
    expect(ctx.updates[0].patch.title).toBe("[Archived] Risk Assessment");
    expect(ctx.updates[0].patch.visibility).toBe("admin_only");
    expect(
      ctx.activityLogs.filter((l) => l.action === "document_bulk_archived"),
    ).toHaveLength(2);
  });

  it("captures per-id update failures without sinking the whole batch", async () => {
    const docs = new Map([
      ["d1", { id: "d1", title: "A" }],
      ["d2", { id: "d2", title: "B" }],
      ["d3", { id: "d3", title: "C" }],
    ]);
    const ctx = mockCtx({
      role: "ops",
      docs,
      failUpdateIds: new Set(["d2"]),
    });
    const result = await bulkArchiveDocuments(["d1", "d2", "d3"]);
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("d2");
    expect(ctx.updates.map((u) => u.id)).toEqual(["d1", "d3"]);
  });
});

// ============================================================
// bulkTagDocuments
// ============================================================

describe("bulkTagDocuments", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkTagDocuments([], "review");
    expect(result.error).toBe("No documents selected.");
  });

  it("rejects empty tag up front", async () => {
    const result = await bulkTagDocuments(["d1"], "  ");
    expect(result.error).toBe("Tag cannot be empty.");
  });

  it("rejects coach callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkTagDocuments(["d1"], "needs_review");
    expect(result.error).toBe("Not authorised.");
  });

  it("appends a new tag, idempotently skips duplicates", async () => {
    const docs = new Map([
      ["d1", { id: "d1", title: "X", tags: ["foo"] }],
      ["d2", { id: "d2", title: "Y", tags: ["needs_review", "bar"] }],
    ]);
    const ctx = mockCtx({ role: "admin", docs });
    const result = await bulkTagDocuments(["d1", "d2"], "needs_review");
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    // Only one update because d2 already had the tag.
    expect(ctx.updates).toHaveLength(1);
    expect(ctx.updates[0].id).toBe("d1");
    expect(ctx.updates[0].patch.tags).toEqual(["foo", "needs_review"]);
  });
});

// ============================================================
// bulkSetVisibility
// ============================================================

describe("bulkSetVisibility", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkSetVisibility([], "admin_only");
    expect(result.error).toBe("No documents selected.");
  });

  it("rejects coach callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkSetVisibility(["d1"], "admin_only");
    expect(result.error).toBe("Not authorised.");
  });

  it("updates visibility on the happy path (ops)", async () => {
    const ctx = mockCtx({ role: "ops" });
    const result = await bulkSetVisibility(["d1", "d2"], "admin_ops");
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates).toHaveLength(2);
    expect(ctx.updates[0].patch.visibility).toBe("admin_ops");
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "document_bulk_visibility_changed",
      ),
    ).toHaveLength(2);
  });
});

// ============================================================
// bulkDeleteDocuments (admin only)
// ============================================================

describe("bulkDeleteDocuments", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkDeleteDocuments([]);
    expect(result.error).toBe("No documents selected.");
  });

  it("rejects ops callers (admin-only)", async () => {
    mockCtx({ role: "ops" });
    const result = await bulkDeleteDocuments(["d1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Only admins can perform this action.");
  });

  it("rejects coach callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDeleteDocuments(["d1"]);
    expect(result.error).toBe("Only admins can perform this action.");
  });

  it("deletes all selected on the happy path (admin)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkDeleteDocuments(["d1", "d2"]);
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.deletes).toEqual(["d1", "d2"]);
    expect(
      ctx.activityLogs.filter((l) => l.action === "document_bulk_deleted"),
    ).toHaveLength(2);
  });

  it("captures per-id delete failures without sinking the whole batch", async () => {
    const ctx = mockCtx({
      role: "admin",
      failDeleteIds: new Set(["d2"]),
    });
    const result = await bulkDeleteDocuments(["d1", "d2", "d3"]);
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("d2");
    expect(ctx.deletes).toEqual(["d1", "d3"]);
  });
});

// ============================================================
// exportDocumentsCsv
// ============================================================

describe("exportDocumentsCsv", () => {
  it("rejects empty selection up front", async () => {
    const result = await exportDocumentsCsv([]);
    expect(result).toEqual({ csv: null, error: "No documents selected." });
  });

  it("rejects coach callers", async () => {
    mockCtx({ role: "coach" });
    const result = await exportDocumentsCsv(["d1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("returns a CSV with header + one row per document", async () => {
    const docs = new Map([
      [
        "d1",
        {
          id: "d1",
          title: "Risk Assessment, Q3",
          category: "risk_assessment",
          tags: ["q3", "centre"],
          visibility: "admin_ops",
          version: 2,
          created_at: "2026-05-01T12:00:00Z",
          profiles: { name: "Abdul" },
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", docs });
    const result = await exportDocumentsCsv(["d1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    const lines = (result.csv ?? "").split("\n");
    expect(lines[0]).toContain("Title");
    expect(lines[0]).toContain("Visibility");
    expect(lines[0]).toContain("Uploader");
    expect(lines[1]).toContain("Risk Assessment");
    expect(lines[1]).toContain("q3; centre");
    expect(lines[1]).toContain("admin_ops");
    expect(lines[1]).toContain("Abdul");
    expect(
      ctx.activityLogs.some((l) => l.action === "documents_exported_csv"),
    ).toBe(true);
  });
});
