import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

import { getEquipmentStatusPulse } from "../status-pulse-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Test helpers — input-based per-table routing
// ============================================================
//
// The action fans out:
//   1. `equipment_inventory` head count where condition IN (poor, retired)
//   2. `equipment_kits` head count where condition IN (needs_attention,
//      needs_replacement)
//   3. `equipment_items` select kit_id, quantity (no filter)
//   4. `equipment_kits` select where location_type='coach'
//   5. `equipment_kits` select where location_type='storage' AND
//      condition='good'
//   6. `sessions` select equipment_kit_id where date >= today AND
//      equipment_kit_id IS NOT NULL
//   7. `equipment_logs` select where created_at >= 14d ago AND
//      action IN (check_out, check_in)
//
// Each table mock distinguishes by chain shape so the fixture can
// return data tailored to which branch is being exercised. The
// `equipment_kits` table appears 3 times (damaged head + coach + storage).

interface PulseFixture {
  damagedInventoryCount?: number;
  damagedKitsCount?: number;
  items?: Array<{ kit_id: string; quantity: number }>;
  coachKits?: Array<{ id: string; location_id?: string }>;
  storageKits?: Array<{ id: string }>;
  upcomingSessionKitIds?: Array<{ equipment_kit_id: string | null }>;
  recentLogs?: Array<{
    kit_id: string;
    action: string;
    created_at: string;
  }>;
}

function installFixture(opts: PulseFixture) {
  const damagedInventoryCount = opts.damagedInventoryCount ?? 0;
  const damagedKitsCount = opts.damagedKitsCount ?? 0;
  const items = opts.items ?? [];
  const coachKits = opts.coachKits ?? [];
  const storageKits = opts.storageKits ?? [];
  const upcomingSessionKitIds = opts.upcomingSessionKitIds ?? [];
  const recentLogs = opts.recentLogs ?? [];

  let kitsCallCount = 0;

  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "equipment_inventory") {
      return {
        select: (
          _cols: string,
          opts2?: { count?: string; head?: boolean },
        ) => ({
          in: () =>
            Promise.resolve({
              count: opts2?.head ? damagedInventoryCount : 0,
              data: null,
              error: null,
            }),
        }),
      };
    }
    if (table === "equipment_kits") {
      kitsCallCount += 1;
      // Call #1 — damaged head count via `.select(..., {count, head}).in()`
      if (kitsCallCount === 1) {
        return {
          select: (
            _cols: string,
            opts2?: { count?: string; head?: boolean },
          ) => ({
            in: () =>
              Promise.resolve({
                count: opts2?.head ? damagedKitsCount : 0,
                data: null,
                error: null,
              }),
          }),
        };
      }
      // Call #2 — coach kits via `.select().eq('location_type', 'coach')`
      if (kitsCallCount === 2) {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: coachKits,
                error: null,
              }),
          }),
        };
      }
      // Call #3 — storage + good via `.select().eq().eq()`
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: storageKits,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "equipment_items") {
      return {
        select: () => Promise.resolve({ data: items, error: null }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          gte: () => ({
            not: () =>
              Promise.resolve({
                data: upcomingSessionKitIds,
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "equipment_logs") {
      return {
        select: () => ({
          gte: () => ({
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: recentLogs,
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

// ============================================================
// Cases
// ============================================================

describe("getEquipmentStatusPulse", () => {
  it("returns the full shape (mixed counts)", async () => {
    installFixture({
      damagedInventoryCount: 2,
      damagedKitsCount: 1,
      items: [
        { kit_id: "k1", quantity: 0 }, // low-stock: hasZero
        { kit_id: "k2", quantity: 5 }, // healthy
      ],
      coachKits: [{ id: "c-kit-1" }, { id: "c-kit-2" }],
      // c-kit-1 logged recently, c-kit-2 has no recent log → overdue.
      recentLogs: [
        {
          kit_id: "c-kit-1",
          action: "check_in",
          created_at: new Date().toISOString(),
        },
      ],
      storageKits: [{ id: "s-kit-1" }, { id: "s-kit-2" }],
      // s-kit-1 is in an upcoming session; s-kit-2 is unassigned.
      upcomingSessionKitIds: [{ equipment_kit_id: "s-kit-1" }],
    });

    const pulse = await getEquipmentStatusPulse();
    expect(pulse).toEqual({
      damagedOrMissingCount: 3, // 2 inventory + 1 kit
      lowStockKitsCount: 1, // k1 has quantity 0
      overdueCheckinsCount: 1, // c-kit-2
      unassignedKitsCount: 1, // s-kit-2
    });
  });

  it("returns clean zeros on a fresh org (shape check)", async () => {
    installFixture({});
    const pulse = await getEquipmentStatusPulse();
    expect(pulse).toEqual({
      damagedOrMissingCount: 0,
      lowStockKitsCount: 0,
      overdueCheckinsCount: 0,
      unassignedKitsCount: 0,
    });
  });

  it("passes the damaged-or-missing head count through (sums inventory + kits)", async () => {
    installFixture({
      damagedInventoryCount: 4,
      damagedKitsCount: 3,
    });
    const pulse = await getEquipmentStatusPulse();
    expect(pulse.damagedOrMissingCount).toBe(7);
  });

  it("only flags storage kits with condition='good' AND no upcoming session as unassigned", async () => {
    installFixture({
      storageKits: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      // s1 is in an upcoming session; s2 and s3 are not.
      upcomingSessionKitIds: [{ equipment_kit_id: "s1" }],
    });
    const pulse = await getEquipmentStatusPulse();
    expect(pulse.unassignedKitsCount).toBe(2);
  });

  it("swallows thrown errors and returns all zeros", async () => {
    supabaseMock.from.mockImplementation(() => {
      throw new Error("boom");
    });
    const pulse = await getEquipmentStatusPulse();
    expect(pulse).toEqual({
      damagedOrMissingCount: 0,
      lowStockKitsCount: 0,
      overdueCheckinsCount: 0,
      unassignedKitsCount: 0,
    });
  });
});
