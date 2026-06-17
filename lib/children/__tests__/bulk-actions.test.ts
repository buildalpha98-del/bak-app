import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, adminMock, magicLinkMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  adminMock: {
    from: vi.fn(),
  },
  magicLinkMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/parent/actions", () => ({
  sendParentMagicLink: magicLinkMock,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  bulkLinkChildrenToCentre,
  bulkUpdateChildrenStatus,
  bulkMessageParents,
  exportChildrenCsv,
  inviteParentForChild,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Auth shim — installs a profile lookup + activity_log capture
// ============================================================

interface RoleCfg {
  role: "admin" | "ops" | "coach";
  /** Force a per-id failure on the given ids when writing. */
  failIds?: Set<string>;
  /** Active links to skip during bulkLinkChildrenToCentre. */
  existingLinks?: string[];
  /** parent_children rows returned for bulkMessageParents. */
  parentChildrenRows?: Array<{ parent_id: string }>;
  /** parent_profiles rows returned for bulkMessageParents user_id lookup. */
  parentProfiles?: Array<{ user_id: string }>;
  /** Children list (for exportChildrenCsv path). */
  childrenList?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    age_group: string;
    status: string;
    centres: { id: string; name: string }[];
    parents: { id: string; name: string }[];
    last_attended_at: string | null;
    assessment_status: string;
    region_ids: string[];
    has_recent_insight: boolean;
    parents_total: number;
    created_at: string;
  }>;
}

function mockAuth(opts: RoleCfg) {
  const failIds = opts.failIds ?? new Set<string>();
  const activityLogs: Array<{ action: string; entity_id: string | null }> = [];
  const linkInserts: string[] = [];
  const statusUpdates: string[] = [];
  const notificationsInserted: Array<Record<string, unknown>> = [];

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
    if (table === "activity_log") {
      return {
        insert: (row: { action: string; entity_id: string | null }) => {
          activityLogs.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "centre_children") {
      const existingSet = new Set(opts.existingLinks ?? []);
      const inExistingPayload = Array.from(existingSet).map((id) => ({
        child_id: id,
      }));
      return {
        // bulkLinkChildrenToCentre's existing-link query chain:
        // .eq("centre_id",X).eq("status","active").in("child_id",ids)
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: inExistingPayload,
                  error: null,
                }),
            }),
          }),
          // getChildrenList chain: .in("child_id",ids).eq("status","active")
          in: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        upsert: (row: { child_id: string }) => {
          if (failIds.has(row.child_id)) {
            return Promise.resolve({
              error: { message: `forced upsert failure for ${row.child_id}` },
            });
          }
          linkInserts.push(row.child_id);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "children") {
      return {
        // Status update path
        update: () => ({
          eq: (_col: string, id: string) => {
            if (failIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced update failure for ${id}` },
              });
            }
            statusUpdates.push(id);
            return Promise.resolve({ error: null });
          },
        }),
        // getChildrenList read path (used by exportChildrenCsv).
        select: () => ({
          order: () =>
            Promise.resolve({
              data: (opts.childrenList ?? []).map((c) => ({
                id: c.id,
                first_name: c.first_name,
                last_name: c.last_name,
                age_group: c.age_group,
                status: c.status,
                created_at: c.created_at,
              })),
              error: null,
            }),
        }),
      };
    }
    if (table === "parent_children") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: opts.parentChildrenRows ?? [],
              error: null,
            }),
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (table === "parent_profiles") {
      return {
        select: (cols?: string) => ({
          in: () =>
            Promise.resolve({
              data: opts.parentProfiles ?? [],
              error: null,
            }),
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    }
    if (table === "notifications") {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          notificationsInserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "session_attendances") {
      return {
        select: () => ({
          in: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "centres") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    }
    if (table === "terms") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    if (table === "skill_ratings") {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      };
    }
    if (table === "child_insights") {
      return {
        select: () => ({
          in: () => ({
            gte: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected supabase table ${table}`);
  });

  adminMock.from.mockImplementation((table: string) => {
    if (table === "parent_profiles") {
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "new-parent-id" },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "parent_children") {
      return {
        insert: () => Promise.resolve({ error: null }),
      };
    }
    throw new Error(`unexpected admin table ${table}`);
  });

  magicLinkMock.mockResolvedValue({ error: null });

  return {
    activityLogs,
    linkInserts,
    statusUpdates,
    notificationsInserted,
  };
}

// ============================================================
// bulkLinkChildrenToCentre
// ============================================================

describe("bulkLinkChildrenToCentre", () => {
  it("rejects empty selection", async () => {
    const result = await bulkLinkChildrenToCentre([], "centre-1");
    expect(result).toEqual({
      linked: 0,
      alreadyLinked: 0,
      errors: [],
      error: "No children selected.",
    });
  });

  it("rejects coach role", async () => {
    mockAuth({ role: "coach" });
    const result = await bulkLinkChildrenToCentre(["c1"], "centre-1");
    expect(result.error).toBe("Not authorised.");
    expect(result.linked).toBe(0);
  });

  it("links 3 children on the happy path with 3 activity_log rows", async () => {
    const ctx = mockAuth({ role: "admin" });
    const result = await bulkLinkChildrenToCentre(
      ["c1", "c2", "c3"],
      "centre-1",
    );
    expect(result.linked).toBe(3);
    expect(result.alreadyLinked).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(ctx.linkInserts).toEqual(["c1", "c2", "c3"]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "child_bulk_linked_centre",
      ).length,
    ).toBe(3);
  });

  it("captures per-id failures without sinking the batch", async () => {
    const ctx = mockAuth({
      role: "admin",
      failIds: new Set(["c2"]),
    });
    const result = await bulkLinkChildrenToCentre(
      ["c1", "c2", "c3"],
      "centre-1",
    );
    expect(result.linked).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("c2");
    expect(ctx.linkInserts).toEqual(["c1", "c3"]);
  });
});

// ============================================================
// bulkUpdateChildrenStatus
// ============================================================

describe("bulkUpdateChildrenStatus", () => {
  it("rejects empty selection", async () => {
    const result = await bulkUpdateChildrenStatus([], "active");
    expect(result.error).toBe("No children selected.");
  });

  it("rejects coach role", async () => {
    mockAuth({ role: "coach" });
    const result = await bulkUpdateChildrenStatus(["c1"], "inactive");
    expect(result.error).toBe("Not authorised.");
  });

  it("updates 3 children happily", async () => {
    const ctx = mockAuth({ role: "ops" });
    const result = await bulkUpdateChildrenStatus(
      ["c1", "c2", "c3"],
      "inactive",
    );
    expect(result.updated).toBe(3);
    expect(ctx.statusUpdates).toEqual(["c1", "c2", "c3"]);
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "child_bulk_status_updated",
      ).length,
    ).toBe(3);
  });

  it("captures per-id failures", async () => {
    const ctx = mockAuth({
      role: "admin",
      failIds: new Set(["c2"]),
    });
    const result = await bulkUpdateChildrenStatus(
      ["c1", "c2", "c3"],
      "inactive",
    );
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("c2");
    expect(ctx.statusUpdates).toEqual(["c1", "c3"]);
  });
});

// ============================================================
// bulkMessageParents
// ============================================================

describe("bulkMessageParents", () => {
  it("rejects empty selection", async () => {
    const result = await bulkMessageParents([], "Title", "Body");
    expect(result.error).toBe("No children selected.");
  });

  it("rejects coach role", async () => {
    mockAuth({ role: "coach" });
    const result = await bulkMessageParents(["c1"], "Title", "Body");
    expect(result.error).toBe("Not authorised.");
  });

  it("dedupes parents across selected children", async () => {
    const ctx = mockAuth({
      role: "admin",
      parentChildrenRows: [
        { parent_id: "p1" },
        { parent_id: "p1" },
        { parent_id: "p2" },
      ],
      parentProfiles: [{ user_id: "u1" }, { user_id: "u2" }],
    });
    const result = await bulkMessageParents(
      ["c1", "c2"],
      "Title",
      "Body",
    );
    expect(result.notified).toBe(2);
    expect(result.uniqueParents).toBe(2);
    expect(ctx.notificationsInserted).toHaveLength(2);
    expect(
      (ctx.notificationsInserted[0] as { tier?: string }).tier,
    ).toBe("important");
  });
});

// ============================================================
// exportChildrenCsv — parent emails NEVER leak in the CSV
// ============================================================

describe("exportChildrenCsv", () => {
  it("rejects empty selection", async () => {
    const result = await exportChildrenCsv([]);
    expect(result).toEqual({ csv: null, error: "No children selected." });
  });

  it("rejects coach callers up-front", async () => {
    mockAuth({ role: "coach" });
    const result = await exportChildrenCsv(["c1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("CSV header never contains parent_email or parent_phone columns", async () => {
    mockAuth({
      role: "admin",
      childrenList: [
        {
          id: "c1",
          first_name: "Jack",
          last_name: "Smith",
          age_group: "5-8",
          status: "active",
          centres: [{ id: "ce1", name: "Little Stars" }],
          parents: [{ id: "p1", name: "Jane Smith" }],
          parents_total: 1,
          last_attended_at: "2026-06-01",
          assessment_status: "done",
          region_ids: [],
          has_recent_insight: false,
          created_at: "2026-06-01",
        },
      ],
    });
    const { csv } = await exportChildrenCsv(["c1"]);
    expect(csv).not.toBeNull();
    const header = csv!.split("\n")[0];
    expect(header).not.toContain("parent_email");
    expect(header).not.toContain("parent_phone");
    // Sanity: header still has the expected columns.
    expect(header).toContain("parent_names");
    expect(header).toContain("assessment_status");
  });
});

// ============================================================
// inviteParentForChild
// ============================================================

describe("inviteParentForChild", () => {
  it("rejects coach role", async () => {
    mockAuth({ role: "coach" });
    const result = await inviteParentForChild("c1", {
      first_name: "Jane",
      last_name: "Smith",
      email: "j@x",
    });
    expect(result.error).toBe("Not authorised.");
  });

  it("creates parent + link + dispatches magic-link on the happy path", async () => {
    mockAuth({ role: "admin" });
    const result = await inviteParentForChild("c1", {
      first_name: "Jane",
      last_name: "Smith",
      email: "JANE@example.COM",
    });
    expect(result.error).toBeNull();
    expect(magicLinkMock).toHaveBeenCalledWith("jane@example.com");
  });
});
