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
  bulkMarkInventoryDamaged,
  bulkMoveInventoryToCentre,
  exportInventoryCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test ctx — auth + per-table behaviour shim
// ============================================================

interface MockCtxOpts {
  role: "admin" | "ops" | "coach";
  inventoryRows?: Map<
    string,
    {
      id: string;
      name: string;
      sport?: string[] | null;
      quantity?: number;
      condition?: string;
      location?: string;
      notes?: string | null;
      created_at?: string;
    }
  >;
  failUpdateIds?: Set<string>;
}

function mockCtx(opts: MockCtxOpts) {
  const inventoryRows = opts.inventoryRows ?? new Map();
  const failUpdateIds = opts.failUpdateIds ?? new Set<string>();

  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
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
    if (table === "equipment_inventory") {
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => inventoryRows.has(id))
                .map((id) => inventoryRows.get(id)),
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

  return { updates, activityLogs };
}

// ============================================================
// bulkMarkInventoryDamaged
// ============================================================

describe("bulkMarkInventoryDamaged", () => {
  it("rejects empty selection up front without any auth call", async () => {
    const result = await bulkMarkInventoryDamaged([]);
    expect(result).toEqual({
      updated: 0,
      errors: [],
      error: "No items selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkMarkInventoryDamaged(["i1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("rejects ops callers too — admin-only operation", async () => {
    mockCtx({ role: "ops" });
    const result = await bulkMarkInventoryDamaged(["i1"]);
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("marks all selected items as damaged on the happy path (admin)", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkMarkInventoryDamaged(["i1", "i2"]);
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.error).toBeNull();
    expect(ctx.updates).toHaveLength(2);
    expect(ctx.updates[0].patch.condition).toBe("poor");
    expect(
      ctx.activityLogs.filter(
        (l) => l.action === "inventory_bulk_marked_damaged",
      ),
    ).toHaveLength(2);
  });

  it("captures per-id update failures without sinking the whole batch", async () => {
    const ctx = mockCtx({
      role: "admin",
      failUpdateIds: new Set(["i2"]),
    });
    const result = await bulkMarkInventoryDamaged(["i1", "i2", "i3"]);
    expect(result.updated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("i2");
    expect(ctx.updates).toHaveLength(2);
  });
});

// ============================================================
// bulkMoveInventoryToCentre
// ============================================================

describe("bulkMoveInventoryToCentre", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkMoveInventoryToCentre([], "Centre A");
    expect(result).toEqual({
      updated: 0,
      errors: [],
      error: "No items selected.",
    });
  });

  it("rejects empty destination", async () => {
    const result = await bulkMoveInventoryToCentre(["i1"], "");
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Destination is required.");
  });

  it("rejects non-admin callers", async () => {
    mockCtx({ role: "coach" });
    const result = await bulkMoveInventoryToCentre(["i1"], "Centre A");
    expect(result.updated).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("updates location on all selected items on the happy path", async () => {
    const ctx = mockCtx({ role: "admin" });
    const result = await bulkMoveInventoryToCentre(["i1", "i2"], "Centre A");
    expect(result.updated).toBe(2);
    expect(result.error).toBeNull();
    expect(ctx.updates).toHaveLength(2);
    expect(ctx.updates[0].patch.location).toBe("Centre A");
    expect(
      ctx.activityLogs.filter((l) => l.action === "inventory_bulk_moved"),
    ).toHaveLength(2);
  });

  it("captures per-id update failures", async () => {
    const ctx = mockCtx({
      role: "admin",
      failUpdateIds: new Set(["i1"]),
    });
    const result = await bulkMoveInventoryToCentre(["i1", "i2"], "Centre B");
    expect(result.updated).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(ctx.updates).toHaveLength(1);
  });
});

// ============================================================
// exportInventoryCsv
// ============================================================

describe("exportInventoryCsv", () => {
  it("rejects empty selection up front", async () => {
    const result = await exportInventoryCsv([]);
    expect(result).toEqual({ csv: null, error: "No items selected." });
  });

  it("rejects non-admin/ops callers", async () => {
    mockCtx({ role: "coach" });
    const result = await exportInventoryCsv(["i1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });

  it("allows ops callers (admin/ops gate)", async () => {
    const rows = new Map([
      [
        "i1",
        {
          id: "i1",
          name: "Cones",
          sport: ["Soccer"],
          quantity: 12,
          condition: "good",
          location: "warehouse",
          notes: null,
          created_at: "2026-06-01T12:00:00Z",
        },
      ],
    ]);
    const ctx = mockCtx({ role: "ops", inventoryRows: rows });
    const result = await exportInventoryCsv(["i1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    expect(
      ctx.activityLogs.some((l) => l.action === "inventory_exported_csv"),
    ).toBe(true);
  });

  it("returns a CSV with header + one row per item", async () => {
    const rows = new Map([
      [
        "i1",
        {
          id: "i1",
          name: "Soccer Balls",
          sport: ["Soccer", "Multi-Sport"],
          quantity: 8,
          condition: "good",
          location: "warehouse",
          notes: "Size 4",
          created_at: "2026-06-01T12:00:00Z",
        },
      ],
    ]);
    const ctx = mockCtx({ role: "admin", inventoryRows: rows });
    const result = await exportInventoryCsv(["i1"]);
    expect(result.error).toBeNull();
    expect(result.csv).toBeTruthy();
    const lines = (result.csv ?? "").split("\n");
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Sport");
    expect(lines[0]).toContain("Quantity");
    expect(lines[0]).toContain("Condition");
    expect(lines[0]).toContain("Location");
    expect(lines[0]).toContain("Notes");
    expect(lines[0]).toContain("Created");
    expect(lines[1]).toContain("Soccer Balls");
    expect(lines[1]).toContain("Soccer; Multi-Sport");
    expect(lines[1]).toContain("8");
    expect(lines[1]).toContain("good");
    expect(
      ctx.activityLogs.some((l) => l.action === "inventory_exported_csv"),
    ).toBe(true);
  });
});
