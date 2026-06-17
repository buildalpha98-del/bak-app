import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { supabaseMock, adminMock, financialAccessMock, sendEmailMock } =
  vi.hoisted(() => ({
    supabaseMock: {
      auth: { getUser: vi.fn() },
      from: vi.fn(),
    },
    adminMock: {
      auth: {
        admin: {
          createUser: vi.fn(),
          deleteUser: vi.fn(),
          updateUserById: vi.fn(),
          signOut: vi.fn(),
          generateLink: vi.fn(),
        },
      },
      from: vi.fn(),
    },
    financialAccessMock: vi.fn(),
    sendEmailMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/auth/financial-access", () => ({
  getFinancialAccess: financialAccessMock,
  requireFinancialAccess: vi.fn(),
}));
vi.mock("@/lib/launch/email", () => ({
  sendEmail: sendEmailMock,
}));
vi.mock("@/lib/launch/email-templates", () => ({
  staffOnboarding: () => ({ subject: "x", html: "<p>x</p>" }),
}));

import {
  bulkResetPasswords,
  bulkArchiveStaff,
  exportStaffCsv,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Auth shim
// ============================================================

interface RoleCfg {
  role: "admin" | "ops" | "coach";
  /** Force a per-id failure on the given ids when archiving. */
  archiveFailIds?: Set<string>;
}

function mockAuth(opts: RoleCfg) {
  const archiveFailIds = opts.archiveFailIds ?? new Set<string>();
  const passwordResets: string[] = [];
  const activityLogs: Array<{ action: string; entity_id: string | null }> = [];
  const updates: string[] = [];
  const notificationsInserted: Array<Record<string, unknown>> = [];

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "actor-1" } },
  });

  // Caller profile reads always return the chosen role.
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { role: opts.role, name: "Target", email: "t@x" },
                error: null,
              }),
          }),
        }),
        // archiveStaffMember sets status=inactive via the admin client,
        // we don't go through supabaseMock here so this entry is unused.
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
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
    if (table === "notifications") {
      return {
        insert: (rows: Array<Record<string, unknown>>) => {
          notificationsInserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  // adminMock is used for password resets + archive bans.
  adminMock.auth.admin.updateUserById.mockImplementation(
    async (id: string, payload: Record<string, unknown>) => {
      if ("password" in payload) {
        passwordResets.push(id);
        return { error: null };
      }
      if (archiveFailIds.has(id)) {
        return { error: { message: `forced ban failure for ${id}` } };
      }
      return { error: null };
    },
  );
  adminMock.auth.admin.signOut.mockResolvedValue({ error: null });
  adminMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        update: () => ({
          eq: (_col: string, id: string) => {
            updates.push(id);
            if (archiveFailIds.has(id)) {
              return Promise.resolve({
                error: { message: `forced update failure for ${id}` },
              });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected admin table ${table}`);
  });

  return { passwordResets, activityLogs, updates, notificationsInserted };
}

// ============================================================
// bulkResetPasswords
// ============================================================

describe("bulkResetPasswords", () => {
  it("rejects empty selection up front without any auth calls", async () => {
    const result = await bulkResetPasswords([]);
    expect(result).toEqual({
      reset: 0,
      errors: [],
      error: "No staff selected.",
    });
    expect(supabaseMock.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects non-admin callers with 'Not authorised.'", async () => {
    mockAuth({ role: "ops" });
    const result = await bulkResetPasswords(["s1", "s2"]);
    expect(result.reset).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("resets 3 staff and writes 3 activity_log rows on the happy path", async () => {
    const ctx = mockAuth({ role: "admin" });
    const result = await bulkResetPasswords(["s1", "s2", "s3"]);
    expect(result).toEqual({
      reset: 3,
      errors: [],
      error: null,
    });
    expect(ctx.passwordResets).toEqual(["s1", "s2", "s3"]);
    expect(
      ctx.activityLogs.filter((l) => l.action === "staff_password_bulk_reset")
        .length,
    ).toBe(3);
  });

  it("captures per-id failures without sinking the whole batch", async () => {
    // Force the second updateUserById call to fail by returning an
    // error from the admin client.
    let callIdx = 0;
    adminMock.auth.admin.updateUserById.mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 2) return { error: { message: "throttled" } };
      return { error: null };
    });

    mockAuth({ role: "admin" });
    // Re-stub the mock after mockAuth installed its own implementation
    callIdx = 0;
    adminMock.auth.admin.updateUserById.mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 2) return { error: { message: "throttled" } };
      return { error: null };
    });

    const result = await bulkResetPasswords(["s1", "s2", "s3"]);
    expect(result.reset).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toEqual({ id: "s2", error: "throttled" });
  });
});

// ============================================================
// bulkArchiveStaff
// ============================================================

describe("bulkArchiveStaff", () => {
  it("rejects empty selection up front", async () => {
    const result = await bulkArchiveStaff([]);
    expect(result).toEqual({
      archived: 0,
      errors: [],
      error: "No staff selected.",
    });
  });

  it("rejects non-admin callers", async () => {
    mockAuth({ role: "ops" });
    const result = await bulkArchiveStaff(["s1"]);
    expect(result.archived).toBe(0);
    expect(result.error).toBe("Not authorised.");
  });

  it("archives 3 staff happily", async () => {
    const ctx = mockAuth({ role: "admin" });
    const result = await bulkArchiveStaff(["s1", "s2", "s3"]);
    expect(result.archived).toBe(3);
    expect(result.errors).toHaveLength(0);
    expect(ctx.updates).toEqual(["s1", "s2", "s3"]);
  });

  it("captures per-id failures", async () => {
    const ctx = mockAuth({
      role: "admin",
      archiveFailIds: new Set(["s2"]),
    });
    const result = await bulkArchiveStaff(["s1", "s2", "s3"]);
    expect(result.archived).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("s2");
    expect(ctx.updates).toEqual(["s1", "s2", "s3"]);
  });
});

// ============================================================
// exportStaffCsv — financial gating
// ============================================================
//
// We can't easily fake getStaffList() here, but we can short-circuit by
// asserting that the CSV NEVER contains a financial_access column when
// the viewer lacks access. We stub the underlying function calls so
// getStaffList returns one row that DOES have financial_access=true.

describe("exportStaffCsv", () => {
  function mockListAccess(opts: {
    role: "admin" | "ops" | "coach";
    financialAccess: boolean;
  }) {
    financialAccessMock.mockResolvedValue(opts.financialAccess);
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: { id: "actor-1" } },
    });
    // We need profiles for both the bulk auth gate AND getStaffList
    // itself; both go through supabaseMock.from. We return the same
    // single profile for each call.
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          // For the auth gate:
          select: (cols: string) => {
            if (cols === "role") {
              return {
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { role: opts.role },
                      error: null,
                    }),
                }),
              };
            }
            // getStaffList path: select("*").order("name").
            return {
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "s1",
                      email: "s1@example.com",
                      name: "Sam One",
                      phone: "0400",
                      role: "coach",
                      status: "active",
                      financial_access: true,
                      region_ids: [],
                    },
                  ],
                  error: null,
                }),
            };
          },
        };
      }
      if (table === "compliance_docs") {
        return { select: () => ({ in: () => Promise.resolve({ data: [] }) }) };
      }
      if (table === "sessions") {
        return {
          select: () => ({
            in: () => ({
              gte: () => ({
                lte: () => ({
                  neq: () => Promise.resolve({ data: [] }),
                }),
              }),
              gt: () => ({
                lte: () => ({
                  neq: () => Promise.resolve({ data: [] }),
                }),
              }),
              lt: () => ({
                neq: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [] }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });
  }

  it("omits the financial_access column when the caller lacks access", async () => {
    mockListAccess({ role: "ops", financialAccess: false });
    const { csv, error } = await exportStaffCsv(["s1"]);
    expect(error).toBeNull();
    expect(csv).not.toBeNull();
    expect(csv!.split("\n")[0]).not.toContain("financial_access");
  });

  it("includes the financial_access column when the caller has access", async () => {
    mockListAccess({ role: "admin", financialAccess: true });
    const { csv, error } = await exportStaffCsv(["s1"]);
    expect(error).toBeNull();
    expect(csv).not.toBeNull();
    const header = csv!.split("\n")[0];
    expect(header).toContain("financial_access");
    expect(csv!.split("\n")[1]).toContain("yes");
  });

  it("rejects empty selection", async () => {
    const result = await exportStaffCsv([]);
    expect(result).toEqual({ csv: null, error: "No staff selected." });
  });

  it("rejects coach callers", async () => {
    mockListAccess({ role: "coach", financialAccess: false });
    const result = await exportStaffCsv(["s1"]);
    expect(result.csv).toBeNull();
    expect(result.error).toBe("Not authorised.");
  });
});
