import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ============================================================
// Hoisted mocks — supabaseMock is reused across every test so
// each spec installs its own table fixture via mockImplementation.
// ============================================================

const { supabaseMock, adminMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  adminMock: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/client/email-templates", () => ({
  clientInvitationEmail: () => ({ subject: "", html: "" }),
}));

import {
  getCurrentClientUserCentres,
  setDefaultClientCentre,
  linkClientUserToCentre,
  unlinkClientUserFromCentre,
  getClientUserCentresSummary,
  getCurrentClientUser,
} from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.from.mockReset();
  adminMock.from.mockReset();
});

// ============================================================
// Helpers
// ============================================================

function authAs(opts: { userId?: string; role?: "admin" | "ops" | "coach" } = {}) {
  const userId = opts.userId ?? "user-1";
  const role = opts.role ?? "admin";

  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: userId } },
  });

  return { userId, role };
}

// Builder that terminates — every test installs fixture rows for the
// tables actually touched; unknown tables get a noop terminating chain.
// Typed as `any` because the test harness routes by table name, not by
// the precise Supabase builder shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function noopChain(): any {
  const ok = { data: null, error: null, count: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const make = () => chain;
  for (const k of [
    "select",
    "eq",
    "in",
    "gte",
    "lte",
    "order",
    "limit",
    "single",
    "maybeSingle",
    "insert",
    "update",
    "upsert",
    "delete",
  ]) {
    chain[k] = make;
  }
  chain.then = (resolve: (v: typeof ok) => unknown) => resolve(ok);
  return chain;
}

// ============================================================
// 1. getCurrentClientUserCentres returns all linked centres ordered
// ============================================================

describe("getCurrentClientUserCentres", () => {
  it("returns linked centres ordered by is_default then name", async () => {
    authAs();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "cu-1", centre_id: "centre-a" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    centre_id: "centre-b",
                    is_default: false,
                    centres: { id: "centre-b", name: "Aardvark OSHC", logo_url: null },
                  },
                  {
                    centre_id: "centre-a",
                    is_default: true,
                    centres: { id: "centre-a", name: "Zebra OSHC", logo_url: null },
                  },
                  {
                    centre_id: "centre-c",
                    is_default: false,
                    centres: { id: "centre-c", name: "Mango OSHC", logo_url: null },
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      return noopChain();
    });

    const { data, error } = await getCurrentClientUserCentres();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // is_default first, then alphabetical.
    expect(data!.map((c) => c.id)).toEqual(["centre-a", "centre-b", "centre-c"]);
    expect(data![0].is_default).toBe(true);
  });
});

// ============================================================
// 2. setDefaultClientCentre enforces exactly-one-default
// ============================================================

describe("setDefaultClientCentre", () => {
  it("clears the existing default before flipping the new one", async () => {
    authAs();

    const updateCalls: Array<{ value: boolean; centre?: string }> = [];

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { id: "cu-1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { centre_id: "centre-b" },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return noopChain();
    });

    adminMock.from.mockImplementation((table: string) => {
      if (table === "client_user_centres") {
        return {
          update: (v: { is_default: boolean }) => ({
            eq: (_: string, val: unknown) => {
              if (val === true) {
                // .eq("client_user_id", id).eq("is_default", true) — clear step
                updateCalls.push({ value: false });
                return Promise.resolve({ error: null });
              }
              return {
                eq: (_k: string, centreId: string) => {
                  updateCalls.push({ value: v.is_default, centre: centreId });
                  return Promise.resolve({ error: null });
                },
              };
            },
          }),
        };
      }
      if (table === "client_users") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      return noopChain();
    });

    const { error } = await setDefaultClientCentre("centre-b");
    expect(error).toBeNull();

    // The clear must precede the set — partial unique index would
    // reject otherwise. We only assert ordering + the final centre.
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].value).toBe(false);
    expect(updateCalls[1].value).toBe(true);
    expect(updateCalls[1].centre).toBe("centre-b");
  });
});

// ============================================================
// 3. linkClientUserToCentre rejects coach role
// ============================================================

describe("linkClientUserToCentre", () => {
  it("rejects when caller is a coach", async () => {
    authAs({ role: "coach" });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { role: "coach" }, error: null }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { error } = await linkClientUserToCentre("cu-1", "centre-x");
    expect(error).toBe("Not authorised.");
  });

  // ============================================================
  // 4. linkClientUserToCentre writes an activity_log entry
  // ============================================================
  it("writes an activity_log entry on success", async () => {
    authAs({ role: "admin" });
    const logInserts: Array<Record<string, unknown>> = [];

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { role: "admin" }, error: null }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          upsert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === "activity_log") {
        return {
          insert: (row: Record<string, unknown>) => {
            logInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      return noopChain();
    });

    const { error } = await linkClientUserToCentre("cu-1", "centre-b", false);
    expect(error).toBeNull();
    expect(logInserts).toHaveLength(1);
    expect(logInserts[0]).toMatchObject({
      action: "client_user_linked_to_centre",
      entity_type: "client_user",
      entity_id: "cu-1",
    });
  });
});

// ============================================================
// 5. unlinkClientUserFromCentre rejects the default centre
// ============================================================

describe("unlinkClientUserFromCentre", () => {
  it("refuses to unlink the default centre", async () => {
    authAs({ role: "admin" });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { role: "admin" }, error: null }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: { is_default: true }, error: null }),
              }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { error } = await unlinkClientUserFromCentre("cu-1", "centre-a");
    expect(error).toMatch(/default centre/i);
  });
});

// ============================================================
// 6. getClientUserCentresSummary returns per-centre numbers
// ============================================================

describe("getClientUserCentresSummary", () => {
  it("returns next_session_date + unpaid_invoice_count + unread_report_count per centre", async () => {
    authAs();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "cu-1", centre_id: "centre-a" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    centre_id: "centre-a",
                    is_default: true,
                    centres: { id: "centre-a", name: "Alpha", logo_url: null },
                  },
                ],
                error: null,
              }),
          }),
        };
      }
      if (table === "sessions") {
        // upcoming session lookup chain
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                in: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: () =>
                          Promise.resolve({
                            data: { date: "2026-06-20" },
                            error: null,
                          }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "outbound_invoices") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ count: 3, data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "centre_reports") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => Promise.resolve({ count: 2, data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { data, error } = await getClientUserCentresSummary();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      id: "centre-a",
      next_session_date: "2026-06-20",
      unpaid_invoice_count: 3,
      unread_report_count: 2,
    });
  });
});

// ============================================================
// 7. getCurrentClientUser(currentCentreId) validates access
// ============================================================

describe("getCurrentClientUser(currentCentreId)", () => {
  it("flags is_authorised_for_current=true when the join row exists", async () => {
    authAs();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        // Multi-row tolerant read: select().eq().order() resolves a LIST.
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "cu-1",
                      centre_id: "centre-a",
                      name: "Trish",
                      email: "trish@example.com",
                      is_primary: true,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { centre_id: "centre-b" },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "centres") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { name: "Centre B" },
                  error: null,
                }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { data, error } = await getCurrentClientUser("centre-b");
    expect(error).toBeNull();
    expect(data?.is_authorised_for_current).toBe(true);
    expect(data?.centre_id).toBe("centre-b");
    expect(data?.centre_name).toBe("Centre B");
  });
});

// ============================================================
// 8. Backwards-compat — legacy client_users.centre_id still respected
// ============================================================

describe("getCurrentClientUser backwards compat", () => {
  it("legacy single-centre mapping still grants access when no join row exists", async () => {
    authAs();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "cu-legacy",
                      centre_id: "legacy-centre",
                      name: "Legacy",
                      email: "legacy@example.com",
                      is_primary: true,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "client_user_centres") {
        // No join row.
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "centres") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { name: "Legacy Centre" }, error: null }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { data, error } = await getCurrentClientUser("legacy-centre");
    expect(error).toBeNull();
    // is_authorised_for_current should still be true via the
    // cu.centre_id === currentCentreId fallback.
    expect(data?.is_authorised_for_current).toBe(true);
    expect(data?.centre_id).toBe("legacy-centre");
  });

  it("tolerates two client_users rows for one auth user (multi-centre invite)", async () => {
    // Inviting the same person to a second centre used to create a
    // second client_users row, and .single() readers then locked the
    // account out entirely. The reader must pick the row matching the
    // requested centre.
    authAs();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "client_users") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "cu-a",
                      centre_id: "centre-a",
                      name: "Dual",
                      email: "dual@example.com",
                      is_primary: true,
                    },
                    {
                      id: "cu-b",
                      centre_id: "centre-b",
                      name: "Dual",
                      email: "dual@example.com",
                      is_primary: false,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "centres") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { name: "Centre B" }, error: null }),
            }),
          }),
        };
      }
      return noopChain();
    });

    const { data, error } = await getCurrentClientUser("centre-b");
    expect(error).toBeNull();
    expect(data?.centre_id).toBe("centre-b");
    expect(data?.is_authorised_for_current).toBe(true);
  });
});
