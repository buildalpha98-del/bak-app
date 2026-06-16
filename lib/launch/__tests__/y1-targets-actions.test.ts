import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { adminMock, serverMock, revalidateMock } = vi.hoisted(() => ({
  adminMock: {
    from: vi.fn(),
  },
  serverMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  revalidateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(serverMock),
}));
vi.mock("next/cache", () => ({
  revalidatePath: revalidateMock,
}));

import { getY1Targets, updateY1Targets } from "../y1-targets-actions";
import { DEFAULT_Y1_TARGETS } from "../y1-targets-types";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockSelect(rows: Array<{ key: string; value: unknown }> | null) {
  adminMock.from.mockImplementation((table: string) => {
    if (table === "business_settings") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe("getY1Targets", () => {
  it("returns the defaults when the rows are present with default values", async () => {
    mockSelect([
      { key: "y1_target_centres", value: 40 },
      { key: "y1_target_schools", value: 10 },
      { key: "y1_target_revenue", value: 400_000 },
    ]);

    const targets = await getY1Targets();
    expect(targets).toEqual({
      centres: 40,
      schools: 10,
      revenue: 400_000,
    });
    expect(targets).toEqual(DEFAULT_Y1_TARGETS);
  });

  it("falls back to defaults when rows are missing", async () => {
    mockSelect([]);
    const targets = await getY1Targets();
    expect(targets).toEqual(DEFAULT_Y1_TARGETS);
  });

  it("coerces stringified values into numbers", async () => {
    mockSelect([
      { key: "y1_target_centres", value: "55" },
      { key: "y1_target_schools", value: "12" },
      { key: "y1_target_revenue", value: "500000" },
    ]);

    const targets = await getY1Targets();
    expect(targets).toEqual({
      centres: 55,
      schools: 12,
      revenue: 500_000,
    });
  });

  it("uses defaults for malformed rows but keeps valid ones", async () => {
    mockSelect([
      { key: "y1_target_centres", value: "not-a-number" },
      { key: "y1_target_schools", value: 15 },
    ]);

    const targets = await getY1Targets();
    expect(targets.centres).toBe(DEFAULT_Y1_TARGETS.centres);
    expect(targets.schools).toBe(15);
    expect(targets.revenue).toBe(DEFAULT_Y1_TARGETS.revenue);
  });
});

// ===========================================================
// updateY1Targets
// ===========================================================

function mockAuth(
  user: { id: string } | null,
  profile: { role: string } | null,
) {
  serverMock.auth.getUser.mockResolvedValue({
    data: { user },
  });
  serverMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: profile, error: null }),
          }),
        }),
      };
    }
    throw new Error(`unexpected server table ${table}`);
  });
}

function mockAdminWritePath(rows: Array<{ key: string; value: unknown }>) {
  const upsertMock = vi.fn(
    (..._args: unknown[]) => Promise.resolve({ error: null }),
  );
  const insertMock = vi.fn(
    (..._args: unknown[]) => Promise.resolve({ error: null }),
  );

  adminMock.from.mockImplementation((table: string) => {
    if (table === "business_settings") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: rows, error: null }),
        }),
        upsert: upsertMock,
      };
    }
    if (table === "activity_log") {
      return {
        insert: insertMock,
      };
    }
    throw new Error(`unexpected admin table ${table}`);
  });

  return { upsertMock, insertMock };
}

describe("updateY1Targets", () => {
  it("rejects unauthenticated callers", async () => {
    mockAuth(null, null);

    const { error } = await updateY1Targets({ centres: 50 });
    expect(error).toBe("Not authenticated.");
  });

  it("rejects non-admin callers", async () => {
    mockAuth({ id: "ops-1" }, { role: "ops" });

    const { error } = await updateY1Targets({ centres: 50 });
    expect(error).toBe("Only administrators can update Year-1 targets.");
  });

  it("accepts an admin and writes business_settings + activity_log", async () => {
    mockAuth({ id: "admin-1" }, { role: "admin" });
    const { upsertMock, insertMock } = mockAdminWritePath([
      { key: "y1_target_centres", value: 40 },
      { key: "y1_target_schools", value: 10 },
      { key: "y1_target_revenue", value: 400_000 },
    ]);

    const { error } = await updateY1Targets({ centres: 55 });
    expect(error).toBeNull();

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      key: "y1_target_centres",
      value: 55,
      updated_by: "admin-1",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      user_id: "admin-1",
      action: "y1_target_updated",
      entity_type: "business_settings",
      metadata: { field: "centres", old: 40, new: 55 },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/admin");
  });

  it("rejects values outside the configured bounds", async () => {
    mockAuth({ id: "admin-1" }, { role: "admin" });
    mockAdminWritePath([]);

    const { error } = await updateY1Targets({ revenue: -1 });
    expect(error).toMatch(/between/);
  });

  it("rejects unknown target keys", async () => {
    mockAuth({ id: "admin-1" }, { role: "admin" });
    mockAdminWritePath([]);

    // @ts-expect-error — testing runtime guard, type-time blocks it
    const { error } = await updateY1Targets({ bogus: 1 });
    expect(error).toMatch(/Unknown target/);
  });

  it("rejects empty payloads", async () => {
    mockAuth({ id: "admin-1" }, { role: "admin" });
    mockAdminWritePath([]);

    const { error } = await updateY1Targets({});
    expect(error).toBe("No targets supplied.");
  });
});
