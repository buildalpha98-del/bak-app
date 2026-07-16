import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ============================================================
// middleware — the revoked-session block
// ============================================================
//
// This block wipes sb-* cookies and redirects to /login. It has taken
// down production login once already (bd1f871): it originally fired on
// authError alone, and AuthSessionMissingError — the NORMAL state of
// every signed-out visitor — carries status 400, so signed-out users
// were redirected to /login from /login, forever.
//
// The stakes went UP with the marketing site: the same block now sits in
// front of a public homepage, so a false positive doesn't just loop a
// login page, it bounces an anonymous stranger who has never heard of
// our login page off the front door.
//
// These tests pin the guard from the outside — via real NextRequests,
// asserting on real responses — rather than unit-testing
// isRevokedSessionError() (already covered in lib/auth/__tests__), so
// they keep holding if the block is refactored again.

const getUser = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
  createSupabaseMiddlewareClient: (request: NextRequest) => ({
    // Mirrors the real client: a pass-through response the middleware
    // may attach cookies to.
    response: NextResponse.next({ request }),
    supabase: {
      auth: { getUser },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null }),
            single: () => Promise.resolve({ data: null }),
          }),
        }),
      }),
    },
  }),
}));

const { middleware } = await import("@/middleware");

/** A signed-out visitor: auth fails, but the browser has no sb-* cookies. */
const ANON_AUTH_RESULT = {
  data: { user: null },
  error: {
    name: "AuthSessionMissingError",
    status: 400,
    code: undefined,
  },
};

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "https://buildalphakids.app"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

/** Where a response sends the browser, or null if it renders in place. */
function redirectTarget(res: Response): string | null {
  const location = res.headers.get("location");
  return location ? new URL(location).pathname : null;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  getUser.mockReset();
});

describe("middleware — anonymous visitors are never treated as revoked", () => {
  it("does NOT redirect an anon request with no sb-* cookies off the public homepage", async () => {
    getUser.mockResolvedValue(ANON_AUTH_RESULT);

    const res = await middleware(request("/"));

    expect(redirectTarget(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it.each([
    ["a 400 with an unrecognised name (gateway/misconfig)", "AuthApiError"],
    ["a 400 with no name at all", undefined],
    ["a malformed-anon-key 400", "AuthUnknownError"],
  ])(
    "does NOT redirect an anon homepage request on %s — the name check alone would",
    async (_label, name) => {
      // The regression the structural guard exists to stop. Each of these
      // gets past isRevokedSessionError() (any status 400 is "revoked"
      // unless it is named AuthSessionMissingError), so ONLY the
      // sb-*-cookie check keeps an anonymous visitor on the homepage.
      getUser.mockResolvedValue({
        data: { user: null },
        error: { name, status: 400, code: undefined },
      });

      const res = await middleware(request("/"));

      expect(redirectTarget(res)).toBeNull();
      expect(res.status).toBe(200);
    }
  );

  it.each(["/", "/holiday-clinics", "/blog", "/privacy", "/sitemap.xml"])(
    "leaves an anon visitor on the public route %s",
    async (path) => {
      getUser.mockResolvedValue(ANON_AUTH_RESULT);

      const res = await middleware(request(path));

      expect(redirectTarget(res)).toBeNull();
    }
  );

  it("does not clear cookies on an anon request — there are none to clear", async () => {
    getUser.mockResolvedValue(ANON_AUTH_RESULT);

    const res = await middleware(request("/"));

    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("middleware — a genuinely revoked session is still wiped", () => {
  it("redirects to /login and clears the sb-* cookies for a banned user", async () => {
    // The case the block exists for: cookies present AND a revoking
    // error. Both guards satisfied.
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", code: "user_banned", status: 403 },
    });

    const res = await middleware(
      request("/admin", { "sb-access-token": "stale", "bak-role": "u:admin:active" })
    );

    expect(redirectTarget(res)).toBe("/login");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-access-token=");
    expect(setCookie).toContain("bak-role=");
  });

  it("clears cookies WITHOUT redirecting when already on a login route", async () => {
    // The LOGIN_ROUTES guard: redirecting /login to /login points the
    // page at itself.
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", code: "refresh_token_not_found", status: 400 },
    });

    const res = await middleware(
      request("/login", { "sb-refresh-token": "rotated-away" })
    );

    expect(redirectTarget(res)).toBeNull();
    expect(res.headers.get("set-cookie") ?? "").toContain("sb-refresh-token=");
  });

  it.each(["/login", "/client-login", "/parent-login"])(
    "does not redirect %s to itself while wiping a revoked session",
    async (path) => {
      getUser.mockResolvedValue({
        data: { user: null },
        error: { name: "AuthApiError", status: 400 },
      });

      const res = await middleware(request(path, { "sb-access-token": "stale" }));

      expect(redirectTarget(res)).toBeNull();
    }
  );
});

describe("middleware — unauthenticated route gating still applies", () => {
  it("redirects an anon visitor off /admin to /login", async () => {
    // Proves the structural guard did not accidentally open protected
    // routes: the revoked block is skipped (no cookies), and the normal
    // !user && !publicRoute path still gates.
    getUser.mockResolvedValue(ANON_AUTH_RESULT);

    const res = await middleware(request("/admin"));

    expect(redirectTarget(res)).toBe("/login");
  });

  it("sends an anon visitor on a parent booking link to /parent-login with next", async () => {
    getUser.mockResolvedValue(ANON_AUTH_RESULT);

    const res = await middleware(request("/parent/book/x?waitlist=y"));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/parent-login");
    expect(location.searchParams.get("next")).toBe("/parent/book/x?waitlist=y");
  });

  it("redirects an anon visitor off a client portal to /client-login", async () => {
    getUser.mockResolvedValue(ANON_AUTH_RESULT);

    const res = await middleware(request("/client/centre-1"));

    expect(redirectTarget(res)).toBe("/client-login");
  });
});
