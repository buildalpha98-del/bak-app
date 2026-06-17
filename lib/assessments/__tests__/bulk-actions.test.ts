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
  bulkDuplicateAssessmentTemplates,
  bulkDeleteAssessmentTemplates,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Auth + table shim
// ============================================================

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  // Templates that exist in the "DB" — id → row.
  templates?: Map<
    string,
    {
      id: string;
      sport: string;
      age_group: string;
      skills_json: unknown;
      term_id: string | null;
      centre_id: string | null;
    }
  >;
  // Rating counts per template_id — drives the delete-block logic.
  ratingCounts?: Map<string, number>;
  // Force a per-id failure on insert/delete.
  failIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const templates = opts.templates ?? new Map();
  const ratingCounts = opts.ratingCounts ?? new Map();
  const failIds = opts.failIds ?? new Set<string>();

  const inserts: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  const activityLogs: Array<{ action: string; entity_id: string }> = [];

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
    if (table === "assessment_templates") {
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
        insert: (row: Record<string, unknown>) => {
          // Surface a per-id failure if the source template id is on
          // the fail list. The duplicate path inserts new rows but we
          // track them by sport for the test's accounting.
          const sourceKey = row.sport as string;
          if (failIds.has(sourceKey)) {
            return Promise.resolve({
              error: { message: `forced insert failure for ${sourceKey}` },
            });
          }
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: (_col: string, id: string) => {
            if (failIds.has(id)) {
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
    if (table === "skill_ratings") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => {
            // Returns one row per existing rating so the caller can
            // bucket counts. Convert ratingCounts into a flat array.
            const rows: Array<{ assessment_template_id: string }> = [];
            for (const id of ids) {
              const n = ratingCounts.get(id) ?? 0;
              for (let i = 0; i < n; i++) {
                rows.push({ assessment_template_id: id });
              }
            }
            return Promise.resolve({ data: rows, error: null });
          },
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

  return { inserts, deletes, activityLogs };
}

// ============================================================
// bulkDuplicateAssessmentTemplates
// ============================================================

describe("bulkDuplicateAssessmentTemplates", () => {
  it("rejects empty selection up front without any auth calls", async () => {
    const result = await bulkDuplicateAssessmentTemplates([]);
    expect(result).toEqual({
      duplicated: 0,
      errors: [],
      error: "No templates selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin/ops callers with 'Not authorised.'", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDuplicateAssessmentTemplates(["t1", "t2"]);
    expect(result.duplicated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("duplicates all selected templates on the happy path (admin)", async () => {
    const templates = new Map([
      [
        "t1",
        {
          id: "t1",
          sport: "Soccer",
          age_group: "5-8",
          skills_json: [{ name: "kick", description: "" }],
          term_id: null,
          centre_id: null,
        },
      ],
      [
        "t2",
        {
          id: "t2",
          sport: "Yoga",
          age_group: "3-5",
          skills_json: [{ name: "pose", description: "" }],
          term_id: "term-1",
          centre_id: null,
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", templates });

    const result = await bulkDuplicateAssessmentTemplates(["t1", "t2"]);
    expect(result.duplicated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(ctx.inserts).toHaveLength(2);
    // Inserts should carry the actor as `created_by`.
    expect(ctx.inserts[0].created_by).toBe("actor-1");
    // Two activity log rows (one per duplicate).
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "assessment_template_bulk_duplicated",
      ),
    ).toHaveLength(2);
  });

  it("captures per-id failures without sinking the whole batch", async () => {
    // The mock fails on inserts where the source.sport is on failIds.
    const templates = new Map([
      [
        "t1",
        {
          id: "t1",
          sport: "Soccer",
          age_group: "5-8",
          skills_json: [],
          term_id: null,
          centre_id: null,
        },
      ],
      [
        "t2",
        {
          id: "t2",
          sport: "BadSport",
          age_group: "5-8",
          skills_json: [],
          term_id: null,
          centre_id: null,
        },
      ],
    ]);
    mockCtx({
      role: "ops",
      templates,
      failIds: new Set(["BadSport"]),
    });

    const result = await bulkDuplicateAssessmentTemplates(["t1", "t2"]);
    expect(result.duplicated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("t2");
  });
});

// ============================================================
// bulkDeleteAssessmentTemplates
// ============================================================

describe("bulkDeleteAssessmentTemplates", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkDeleteAssessmentTemplates([]);
    expect(result).toEqual({
      deleted: 0,
      errors: [],
      error: "No templates selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDeleteAssessmentTemplates(["t1"]);
    expect(result.deleted).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("deletes templates with no ratings, keeps the rest, on the happy path", async () => {
    const ctx = mockCtx({
      role: "admin",
      ratingCounts: new Map([
        ["t1", 0],
        ["t2", 3], // has ratings → kept
        ["t3", 0],
      ]),
    });

    const result = await bulkDeleteAssessmentTemplates(["t1", "t2", "t3"]);
    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("t2");
    expect(result.errors[0].error).toContain("rating");
    expect(ctx.deletes).toEqual(["t1", "t3"]);
    // Two activity log rows (only successful deletes).
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "assessment_template_bulk_deleted",
      ),
    ).toHaveLength(2);
  });

  it("captures per-id failures from the delete call itself", async () => {
    const ctx = mockCtx({
      role: "admin",
      ratingCounts: new Map([
        ["t1", 0],
        ["t2", 0],
        ["t3", 0],
      ]),
      failIds: new Set(["t2"]),
    });

    const result = await bulkDeleteAssessmentTemplates(["t1", "t2", "t3"]);
    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("t2");
    expect(ctx.deletes).toEqual(["t1", "t3"]);
  });
});
