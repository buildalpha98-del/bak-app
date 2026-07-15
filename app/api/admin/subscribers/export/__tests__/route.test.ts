import { describe, it, expect, vi, beforeEach } from "vitest";

// This route hands out every subscriber email we hold, and middleware
// does NOT cover `api/` (see the matcher in middleware.ts), so the
// in-route guard is the only thing standing in front of the list.
// These tests exist to keep it that way.

const { serverMock, adminMock } = vi.hoisted(() => ({
  serverMock: { auth: { getUser: vi.fn() }, from: vi.fn() },
  adminMock: { from: vi.fn() },
}));

// Overrides the global mocks in tests/setup.ts for this file.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => serverMock,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => adminMock,
}));

import { GET } from "@/app/api/admin/subscribers/export/route";

interface Row {
  id: string;
  email: string;
  status: string;
  source_page: string | null;
  created_at: string;
}

/**
 * Input-based routing on the table name — never mockResolvedValueOnce
 * chains, which leak ordering assumptions between tests.
 */
function setup(state: {
  user?: { id: string } | null;
  role?: string | null;
  rows?: Row[];
  selectError?: { message: string };
}) {
  serverMock.auth.getUser.mockResolvedValue({
    data: { user: state.user ?? null },
    error: null,
  });

  serverMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: state.role ? { role: state.role } : null,
                error: null,
              }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table on server client: ${table}`);
  });

  adminMock.from.mockImplementation((table: string) => {
    if (table === "newsletter_subscribers") {
      return {
        select: () => ({
          order: () =>
            Promise.resolve({
              data: state.selectError ? null : (state.rows ?? []),
              error: state.selectError ?? null,
            }),
        }),
      };
    }
    throw new Error(`Unexpected table on admin client: ${table}`);
  });
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: "1",
    email: "alice@example.com",
    status: "subscribed",
    source_page: "/",
    created_at: "2026-07-15T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/subscribers/export — auth guard", () => {
  it("rejects an unauthenticated request with 401 and no data", async () => {
    setup({ user: null, rows: [row()] });
    const res = await GET();

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorised" });
    // The list must never be queried for an anonymous caller.
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user with no staff profile with 403", async () => {
    setup({ user: { id: "u1" }, role: null, rows: [row()] });
    const res = await GET();

    expect(res.status).toBe(403);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  // ops can't reach /admin at all per middleware's ROLE_ROUTES, so the
  // download must not be a side door around that.
  it.each(["ops", "coach", "parent"])(
    "rejects role %s with 403",
    async (role) => {
      setup({ user: { id: "u1" }, role, rows: [row()] });
      const res = await GET();

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: "Forbidden" });
      expect(adminMock.from).not.toHaveBeenCalled();
    }
  );

  it("allows an admin", async () => {
    setup({ user: { id: "u1" }, role: "admin", rows: [row()] });
    const res = await GET();

    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/subscribers/export — CSV response", () => {
  it("streams the expected headers and filename", async () => {
    setup({ user: { id: "u1" }, role: "admin", rows: [row()] });
    const res = await GET();

    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="newsletter-subscribers-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    // Personal data must not be cached by the browser or a proxy.
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("emits the header row and one line per subscriber", async () => {
    setup({
      user: { id: "u1" },
      role: "admin",
      rows: [
        row(),
        row({
          id: "2",
          email: "bob@example.com",
          status: "unsubscribed",
          source_page: null,
          created_at: "2026-07-14T00:00:00.000Z",
        }),
      ],
    });
    const res = await GET();

    expect(await res.text()).toBe(
      "email,status,source_page,created_at\r\n" +
        "alice@example.com,subscribed,/,2026-07-15T00:00:00.000Z\r\n" +
        "bob@example.com,unsubscribed,,2026-07-14T00:00:00.000Z\r\n"
    );
  });

  it("returns a header-only CSV when there are no subscribers", async () => {
    setup({ user: { id: "u1" }, role: "admin", rows: [] });
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("email,status,source_page,created_at\r\n");
  });

  // End-to-end proof that the escaping is actually wired in, not just
  // unit-tested in isolation.
  it("neutralises a formula-injection payload in a live export", async () => {
    setup({
      user: { id: "u1" },
      role: "admin",
      rows: [row({ email: '=cmd|\'/C calc\'!A1@x.co', source_page: "/a,b" })],
    });
    const res = await GET();
    const body = await res.text();

    expect(body).toContain("'=cmd|'/C calc'!A1@x.co");
    expect(body).toContain('"/a,b"');
    // Exactly two lines: the payload didn't spawn a record.
    expect(body.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("returns 500 when the query fails, without leaking the driver error", async () => {
    setup({
      user: { id: "u1" },
      role: "admin",
      selectError: { message: 'relation "newsletter_subscribers" does not exist' },
    });
    const res = await GET();

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Could not load newsletter subscribers.",
    });
  });
});
