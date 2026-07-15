import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import {
  isFinancialRoute,
  parseRoleHint,
  serializeRoleHint,
  ROLE_HINT_COOKIE,
  ROLE_HINT_MAX_AGE,
  type RoleHint,
} from "@/lib/auth/route-access";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/client-login",
  "/parent-login",
  "/reset-password",
  "/update-password",
  "/auth/callback", // Supabase code-exchange — sets the session; must never be gated
  "/feedback",
  "/refer", // public referral landing pages
  "/client/shared", // shared read-only links (token-based, no auth)
];

// The sign-in pages themselves. Redirecting one of these to /login is
// always a loop, never a fix.
const LOGIN_ROUTES = ["/login", "/client-login", "/parent-login"];

// Financial route list + role-hint parsing live in lib/auth/route-access
// (pure, testable, no next/* imports).

// Role → allowed route prefixes (staff roles only — parent handled separately)
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ["/admin", "/ops", "/coach"], // admin can access all portals
  ops: ["/ops"],
  coach: ["/coach"],
  parent: ["/parent"],
};

// Role → default portal
const ROLE_PORTAL: Record<string, string> = {
  admin: "/admin",
  ops: "/ops",
  coach: "/coach",
  parent: "/parent",
};

// Role-hint cookie: middleware route-gating needs the user's role on
// every request, but querying `profiles` from the edge adds a full
// round trip to the database region per navigation. The hint caches
// `${userId}:${role}:${status}` for 10 minutes. It is a ROUTING hint
// only — every page and server action still authenticates itself and
// RLS enforces data access — so a stale hint can at worst route a
// just-demoted user to a portal whose pages immediately reject them.
function readRoleHint(request: NextRequest, userId: string): RoleHint | null {
  return parseRoleHint(request.cookies.get(ROLE_HINT_COOKIE)?.value, userId);
}

function setRoleHint(
  response: NextResponse,
  userId: string,
  role: string,
  status: string,
  financialAccess: boolean
) {
  response.cookies.set(
    ROLE_HINT_COOKIE,
    serializeRoleHint(userId, role, status, financialAccess),
    {
      maxAge: ROLE_HINT_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    }
  );
}

export async function middleware(request: NextRequest) {
  // Skip auth refresh if Supabase is not configured yet
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  // Prefetch requests (sidebar hover, viewport Links) don't need auth
  // work — the real navigation that follows is fully checked. Without
  // this, hovering the 30-item sidebar fired dozens of concurrent
  // auth round-trips from the edge to the auth server.
  if (
    request.headers.get("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch"
  ) {
    return NextResponse.next({ request });
  }

  // Server-action POSTs authenticate inside the action handler; the
  // middleware adds nothing but latency (the sidebar badge polls an
  // action every 60s from every open tab).
  if (request.method === "POST") {
    return NextResponse.next({ request });
  }

  const { response, supabase } = createSupabaseMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  // Refresh the auth session. On auth errors (banned user, refresh
  // token revoked/rotated away) the stale sb-* cookies MUST be
  // cleared — otherwise the browser re-sends them on every request
  // and the user loops on an error forever (observed 30+ times in
  // production for a single banned user).
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Only STALE cookies need clearing — and only a request that actually
  // carries some can be carrying stale ones. Acting on authError alone
  // took down production login: with no session at all, getUser() fails
  // with AuthSessionMissingError, whose status IS 400, so every signed-out
  // visitor to /login was redirected to /login, forever.
  const staleAuthCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-"));

  if (
    authError &&
    staleAuthCookies.length > 0 &&
    (authError.code === "user_banned" ||
      authError.code === "refresh_token_not_found" ||
      authError.status === 400)
  ) {
    // Already on a login page: clear the cookies and let it render. A
    // redirect here would just point the page at itself.
    const response = LOGIN_ROUTES.includes(pathname)
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of staleAuthCookies) {
      response.cookies.delete(cookie.name);
    }
    response.cookies.delete(ROLE_HINT_COOKIE);
    return response;
  }

  // Check if current route is public
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // ---- Client portal route handling ----
  const isClientRoute =
    pathname.startsWith("/client/") || pathname === "/client";
  const isSharedLink = pathname.startsWith("/client/shared/");

  // Shared links are public — skip auth
  if (isSharedLink) {
    return response;
  }

  // Client portal routes require auth but use client_users table
  if (isClientRoute && !isPublicRoute) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/client-login";
      return NextResponse.redirect(loginUrl);
    }

    // Check if user is a client user and extract their centre ID.
    // Cached in the role hint as `client:<centreId>` so repeat
    // navigations skip the database round trip.
    const hint = readRoleHint(request, user.id);
    let centreId: string | null = hint?.role === "client" ? hint.status : null;

    if (!centreId) {
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("centre_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!clientUser) {
        // Not a client user — check if they're staff
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, status, financial_access")
          .eq("id", user.id)
          .maybeSingle();

        if (profile) {
          setRoleHint(
            response,
            user.id,
            profile.role,
            profile.status,
            !!profile.financial_access
          );
          const portalUrl = request.nextUrl.clone();
          portalUrl.pathname = ROLE_PORTAL[profile.role] || "/login";
          return NextResponse.redirect(portalUrl);
        }

        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/client-login";
        return NextResponse.redirect(loginUrl);
      }

      centreId = clientUser.centre_id;
      // Client and parent hints reuse this cookie but never reach a
      // financial route, so the flag is always false for them.
      setRoleHint(response, user.id, "client", centreId!, false);
    }

    // Client users can only access their own centre's portal
    const centreIdMatch = pathname.match(/^\/client\/([^/]+)/);
    if (centreIdMatch && centreIdMatch[1] !== centreId) {
      const correctUrl = request.nextUrl.clone();
      correctUrl.pathname = `/client/${centreId}`;
      return NextResponse.redirect(correctUrl);
    }

    return response;
  }

  // ---- Parent portal route handling ----
  const isParentRoute =
    pathname.startsWith("/parent/") || pathname === "/parent";

  if (isParentRoute) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/parent-login";
      return NextResponse.redirect(loginUrl);
    }

    // Check if parent has completed registration (hint-cached — a
    // registered parent stays registered, so 10 minutes of caching
    // only ever skips the redundant lookup).
    const hint = readRoleHint(request, user.id);
    let registered = hint?.role === "parent";

    if (!registered) {
      const { data: parentProfile } = await supabase
        .from("parent_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      registered = !!parentProfile;
      if (registered) {
        setRoleHint(response, user.id, "parent", "registered", false);
      }
    }

    if (!registered && !pathname.startsWith("/parent/register")) {
      const registerUrl = request.nextUrl.clone();
      registerUrl.pathname = "/parent/register";
      return NextResponse.redirect(registerUrl);
    }

    return response;
  }

  // Authenticated user on parent-login page → redirect to portal
  if (user && pathname === "/parent-login") {
    const { data: parentProfile } = await supabase
      .from("parent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (parentProfile) {
      const parentUrl = request.nextUrl.clone();
      parentUrl.pathname = "/parent";
      return NextResponse.redirect(parentUrl);
    }

    // Check if they're actually staff
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile && profile.role !== "parent") {
      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = ROLE_PORTAL[profile.role] || "/login";
      return NextResponse.redirect(portalUrl);
    }
  }

  // ---- Standard staff auth flow ----

  // Unauthenticated user on protected route → redirect to login
  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login page → redirect to their portal
  if (user && pathname === "/login") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (profile) {
      if (profile.status === "onboarding") {
        const setPasswordUrl = request.nextUrl.clone();
        setPasswordUrl.pathname = "/set-password";
        return NextResponse.redirect(setPasswordUrl);
      }

      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = ROLE_PORTAL[profile.role] || "/login";
      return NextResponse.redirect(portalUrl);
    }

    // Maybe it's a client user on the staff login page
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("centre_id")
      .eq("user_id", user.id)
      .single();

    if (clientUser) {
      const clientUrl = request.nextUrl.clone();
      clientUrl.pathname = `/client/${clientUser.centre_id}`;
      return NextResponse.redirect(clientUrl);
    }
  }

  // Authenticated user on client-login page → redirect
  if (user && pathname === "/client-login") {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("centre_id")
      .eq("user_id", user.id)
      .single();

    if (clientUser) {
      const clientUrl = request.nextUrl.clone();
      clientUrl.pathname = `/client/${clientUser.centre_id}`;
      return NextResponse.redirect(clientUrl);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile) {
      const portalUrl = request.nextUrl.clone();
      portalUrl.pathname = ROLE_PORTAL[profile.role] || "/login";
      return NextResponse.redirect(portalUrl);
    }
  }

  // Role-based route protection for dashboard routes
  if (user && !isPublicRoute && pathname !== "/set-password") {
    const isDashboardRoute = ["/admin", "/ops", "/coach"].some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
    );

    if (isDashboardRoute) {
      let hint = readRoleHint(request, user.id);
      if (!hint) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, status, financial_access")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile) {
          const loginUrl = request.nextUrl.clone();
          loginUrl.pathname = "/login";
          return NextResponse.redirect(loginUrl);
        }
        hint = {
          role: profile.role,
          status: profile.status,
          financialAccess: !!profile.financial_access,
        };
        setRoleHint(
          response,
          user.id,
          profile.role,
          profile.status,
          hint.financialAccess
        );
      }

      if (hint.status === "onboarding") {
        const setPasswordUrl = request.nextUrl.clone();
        setPasswordUrl.pathname = "/set-password";
        return NextResponse.redirect(setPasswordUrl);
      }

      const allowedPrefixes = ROLE_ROUTES[hint.role] || [];
      const hasAccess = allowedPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
      );

      if (!hasAccess) {
        const portalUrl = request.nextUrl.clone();
        portalUrl.pathname = ROLE_PORTAL[hint.role] || "/login";
        return NextResponse.redirect(portalUrl);
      }

      // Redirect from the edge rather than letting the section layout's
      // requireFinancialAccess() throw a redirect mid-render: an RSC
      // redirect trips React #310 inside Next's own AppRouter. The
      // layout guard stays as the actual enforcement.
      if (isFinancialRoute(pathname) && !hint.financialAccess) {
        const portalUrl = request.nextUrl.clone();
        portalUrl.pathname = ROLE_PORTAL[hint.role] || "/login";
        portalUrl.searchParams.set("denied", "financial");
        return NextResponse.redirect(portalUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|api/|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.ico$|.*\\.ttf$|.*\\.woff2?$|fonts/).*)",
  ],
};
