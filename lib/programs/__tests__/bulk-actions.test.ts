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
  bulkDeleteProgrammes,
  bulkDuplicateProgrammes,
  checkProgrammeDuplicate,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  programmes?: Map<
    string,
    {
      id: string;
      sport: string;
      age_group: string | null;
      age_groups: string[];
      duration_minutes: number;
      skill_focus: string | null;
      content_json: Record<string, unknown> | null;
      equipment_used: string[];
    }
  >;
  sessionCounts?: Map<string, number>;
  // Force a per-id failure on insert/delete. Insert path keys on the
  // source programme's sport (since we duplicate by sport carry-over);
  // delete path keys on the programme id directly.
  failIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const programmes = opts.programmes ?? new Map();
  const sessionCounts = opts.sessionCounts ?? new Map();
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
              Promise.resolve({ data: { role: opts.role }, error: null }),
          }),
        }),
      };
    }
    if (table === "programs") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => programmes.has(id))
                .map((id) => programmes.get(id)),
              error: null,
            }),
        }),
        insert: (row: Record<string, unknown>) => {
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
    if (table === "sessions") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) => {
            const rows: Array<{ program_id: string }> = [];
            for (const id of ids) {
              const n = sessionCounts.get(id) ?? 0;
              for (let i = 0; i < n; i++) {
                rows.push({ program_id: id });
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
// bulkDuplicateProgrammes
// ============================================================

describe("bulkDuplicateProgrammes", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkDuplicateProgrammes([]);
    expect(result).toEqual({
      duplicated: 0,
      errors: [],
      error: "No programmes selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin/ops callers with 'Not authorised.'", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDuplicateProgrammes(["p1", "p2"]);
    expect(result.duplicated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("duplicates all selected programmes on the happy path (admin)", async () => {
    const programmes = new Map([
      [
        "p1",
        {
          id: "p1",
          sport: "Soccer",
          age_group: "5-8",
          age_groups: ["5-8"],
          duration_minutes: 45,
          skill_focus: "ball control",
          content_json: { title: "Soccer A", skillDevelopment: [{ name: "x" }] },
          equipment_used: ["balls"],
        },
      ],
      [
        "p2",
        {
          id: "p2",
          sport: "Yoga",
          age_group: "3-5",
          age_groups: ["3-5"],
          duration_minutes: 30,
          skill_focus: null,
          content_json: { title: "Yoga B", skillDevelopment: [{ name: "y" }] },
          equipment_used: ["mats"],
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", programmes });

    const result = await bulkDuplicateProgrammes(["p1", "p2"]);
    expect(result.duplicated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(ctx.inserts).toHaveLength(2);
    expect(ctx.inserts[0].created_by).toBe("actor-1");
    // Duplicate carries over the sport but appends "(copy)" to title.
    const firstContent = ctx.inserts[0].content_json as Record<string, unknown>;
    expect(firstContent.title).toBe("Soccer A (copy)");
    // version_number resets to 1 (fresh family, not a v2).
    expect(ctx.inserts[0].version_number).toBe(1);
    expect(ctx.inserts[0].parent_version_id).toBeNull();
    expect(
      ctx.activityLogs.filter((l) => l.action === "programme_bulk_duplicated"),
    ).toHaveLength(2);
  });

  it("captures per-id insert failures without sinking the whole batch", async () => {
    const programmes = new Map([
      [
        "p1",
        {
          id: "p1",
          sport: "Soccer",
          age_group: "5-8",
          age_groups: ["5-8"],
          duration_minutes: 45,
          skill_focus: null,
          content_json: { title: "S", skillDevelopment: [] },
          equipment_used: [],
        },
      ],
      [
        "p2",
        {
          id: "p2",
          sport: "BadSport",
          age_group: "5-8",
          age_groups: ["5-8"],
          duration_minutes: 30,
          skill_focus: null,
          content_json: { title: "X", skillDevelopment: [] },
          equipment_used: [],
        },
      ],
    ]);
    mockCtx({
      role: "ops",
      programmes,
      failIds: new Set(["BadSport"]),
    });
    const result = await bulkDuplicateProgrammes(["p1", "p2"]);
    expect(result.duplicated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("p2");
  });
});

// ============================================================
// bulkDeleteProgrammes
// ============================================================

describe("bulkDeleteProgrammes", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkDeleteProgrammes([]);
    expect(result).toEqual({
      deleted: 0,
      errors: [],
      error: "No programmes selected.",
    });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkDeleteProgrammes(["p1"]);
    expect(result.deleted).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("deletes programmes with no sessions, keeps the rest, on the happy path", async () => {
    const ctx = mockCtx({
      role: "admin",
      sessionCounts: new Map([
        ["p1", 0],
        ["p2", 2], // assigned to sessions → kept
        ["p3", 0],
      ]),
    });
    const result = await bulkDeleteProgrammes(["p1", "p2", "p3"]);
    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("p2");
    expect(result.errors[0].error).toContain("session");
    expect(ctx.deletes).toEqual(["p1", "p3"]);
    expect(
      ctx.activityLogs.filter((l) => l.action === "programme_bulk_deleted"),
    ).toHaveLength(2);
  });

  it("captures per-id failures from the delete call itself", async () => {
    const ctx = mockCtx({
      role: "admin",
      sessionCounts: new Map([
        ["p1", 0],
        ["p2", 0],
        ["p3", 0],
      ]),
      failIds: new Set(["p2"]),
    });
    const result = await bulkDeleteProgrammes(["p1", "p2", "p3"]);
    expect(result.deleted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("p2");
    expect(ctx.deletes).toEqual(["p1", "p3"]);
  });
});

// ============================================================
// checkProgrammeDuplicate
// ============================================================

describe("checkProgrammeDuplicate", () => {
  it("returns an empty matches array when sport / ageGroups are missing", async () => {
    const result = await checkProgrammeDuplicate("", []);
    expect(result.matches).toEqual([]);
    expect(result.error).toBeNull();
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("matches programmes whose age bands overlap the input", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "actor" } },
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "programs") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      // Overlap on 5-8 → match.
                      {
                        id: "match-1",
                        sport: "Soccer",
                        age_group: "5-8",
                        age_groups: ["5-8", "8-12"],
                        duration_minutes: 45,
                        content_json: { title: "Soccer 5-12" },
                        created_at: "2026-06-01T00:00:00Z",
                      },
                      // No overlap → skip.
                      {
                        id: "skip-1",
                        sport: "Soccer",
                        age_group: "3-5",
                        age_groups: ["3-5"],
                        duration_minutes: 30,
                        content_json: { title: "Soccer 3-5" },
                        created_at: "2026-06-01T00:00:00Z",
                      },
                      // Legacy row (age_groups empty, falls back to age_group). 5-8 overlaps.
                      {
                        id: "match-2",
                        sport: "Soccer",
                        age_group: "5-8",
                        age_groups: [],
                        duration_minutes: 45,
                        content_json: null,
                        created_at: "2026-05-01T00:00:00Z",
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
    const { matches } = await checkProgrammeDuplicate("Soccer", ["5-8"]);
    const ids = matches.map((m) => m.id).sort();
    expect(ids).toEqual(["match-1", "match-2"]);
  });
});
