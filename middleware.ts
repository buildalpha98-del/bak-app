import { type NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";
import { isPublicRoute } from "@/lib/marketing/public-routes";
import { isRevokedSessionError } from "@/lib/auth/session-errors";
import { resolveParentLoginTarget } from "@/lib/parent/safe-next";
import {
  isFinancialRoute,
  isStaffDomainRoot,
  parseRoleHint,
  serializeRoleHint,
  ROLE_HINT_COOKIE,
  ROLE_HINT_MAX_AGE,
  type RoleHint,
} from "@/lib/auth/route-access";

// Hard-down tripwire. A redirect whose destination is the path we are
// already on is an infinite loop — which is exactly how production login
// went down (a signed-out visitor to /login redirected to /login). It
// returns 307s, never an exception, so nothing else would ever page on
// it. If we are ever about to do it again, tell Sentry at fatal level
// and break the loop by rendering the page instead of bouncing.
//
// Inert without a DSN, like the rest of Sentry here.
function safeRedirect(request: NextRequest, url: URL): NextResponse {
  if (url.pathname === request.nextUrl.pathname) {
    Sentry.captureMessage(
      `Middleware redirect loop averted at ${url.pathname}`,
      { level: "fatal", tags: { tripwire: "redirect-loop" } }
    );
    return NextResponse.next({ request });
  }
  return NextResponse.redirect(url);
}

// The sign-in pages themselves. Redirecting one of these to /login is
// always a loop, never a fix.
//
// Kept separate from PUBLIC_ROUTES in lib/marketing/public-routes: that
// list answers "may an anonymous visitor see this?", which is true of
// every marketing page too. This one answers "is /login already the
// destination?", and only these three qualify.
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

  // Staff-domain root → dashboard. buildalphakids.app is the staff front
  // door; parents live on buildalphakids.com.au (the audience split). Its
  // root must open the dashboard, not the public marketing homepage —
  // otherwise a bare visit AND the installed PWA (manifest start_url "/")
  // both land on marketing, which is what staff hit after the site launched.
  //
  // Only the exact app host is rewritten. buildalphakids.com.au, preview
  // *.vercel.app URLs and localhost keep serving marketing at / — so the
  // public site, and QA on a deploy URL, are untouched. Done before the auth
  // round-trip: the redirect needs no user, and /login re-enters middleware
  // where an already-signed-in staff member is bounced on to their portal.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (isStaffDomainRoot(host, pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return safeRedirect(request, loginUrl);
  }

  // Refresh the auth session. On auth errors (banned user, refresh
  // token revoked/rotated away) the stale sb-* cookies MUST be
  // cleared — otherwise the browser re-sends them on every request
  // and the user loops on an error forever (observed 30+ times in
  // production for a single banned user).
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Two independent guards, belt AND braces. Each has already broken
  // production on its own, and they fail in different ways:
  //
  // 1. STRUCTURAL — does the browser actually carry sb-* cookies? Only a
  //    request carrying some can be carrying STALE ones, so this is what
  //    makes a wipe meaningful at all. Acting on authError alone took
  //    down login (fixed in bd1f871): with no session, getUser() fails
  //    with AuthSessionMissingError, whose status IS 400, so every
  //    signed-out visitor to /login was redirected to /login forever.
  //
  // 2. NOMINAL — isRevokedSessionError() names AuthSessionMissingError
  //    and returns false for it.
  //
  // Guard 2 alone is NARROWER than it looks: it still treats ANY
  // status-400 auth error as revoked, and only that one error NAME
  // escapes. A malformed anon key, a gateway 400, or any future
  // 400-shaped error carrying a different name would bounce an
  // ANONYMOUS visitor off the public homepage to /login — reintroducing
  // bd1f871's bug through a side door, and now on the marketing site
  // where the visitor has never heard of our login page. Guard 1 is the
  // one that holds in those cases, because an anonymous visitor has no
  // sb-* cookies no matter what the auth server said.
  const staleAuthCookies = request.cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith("sb-"));

  if (
    authError &&
    staleAuthCookies.length > 0 &&
    isRevokedSessionError(authError)
  ) {
    // Already on a login page: clear the cookies and let it render. A
    // redirect here would just point the page at itself. Self-terminating
    // either way (the wipe means the retry has no cookies and misses this
    // block), and safeRedirect is the belt to LOGIN_ROUTES' braces — if
    // this ever tries to bounce /login to /login again, it trips Sentry
    // at fatal level instead of looping.
    const revoked = LOGIN_ROUTES.includes(pathname)
      ? NextResponse.next({ request })
      : safeRedirect(request, new URL("/login", request.url));
    for (const cookie of staleAuthCookies) {
      revoked.cookies.delete(cookie.name);
    }
    revoked.cookies.delete(ROLE_HINT_COOKIE);
    return revoked;
  }

  // Check if current route is public
  const publicRoute = isPublicRoute(pathname);

  // ---- Client portal route handling ----
  const isClientRoute =
    pathname.startsWith("/client/") || pathname === "/client";
  const isSharedLink = pathname.startsWith("/client/shared/");

  // Shared links are public — skip auth
  if (isSharedLink) {
    return response;
  }

  // Client portal routes require auth but use client_users table
  if (isClientRoute && !publicRoute) {
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/client-login";
      return safeRedirect(request, loginUrl);
    }

    // Check if user is a client user and extract their centre ID.
    // Cached in the role hint as `client:<centreId>` so repeat
    // navigations skip the database round trip.
    const hint = readRoleHint(request, user.id);
    let centreId: string | null = hint?.role === "client" ? hint.status : null;

    if (!centreId) {
      // limit(1), not maybeSingle: an invite to a second centre can
      // legally create a second client_users row for the same auth
      // user, and maybeSingle() would error and lock them out.
      const { data: clientUserRows } = await supabase
        .from("client_users")
        .select("centre_id")
        .eq("user_id", user.id)
        .limit(1);
      const clientUser = clientUserRows?.[0] ?? null;

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
        return safeRedirect(request, loginUrl);
      }

      centreId = clientUser.centre_id;
      // Client and parent hints reuse this cookie but never reach a
      // financial route, so the flag is always false for them.
      setRoleHint(response, user.id, "client", centreId!, false);
    }

    // Multi-campus: do NOT pin /client/[centreId] to the default
    // centre here. The edge only knows the default (the role hint is a
    // single value), so an equality check bounced every authorised
    // non-default centre and made the CentreSwitcher inert. Real
    // enforcement lives in app/client/[centreId]/layout.tsx (which
    // checks the client_user_centres join via getCurrentClientUser)
    // with RLS as the backstop — an unauthorised centreId renders
    // nothing and redirects there.
    return response;
  }

  // ---- Parent portal route handling ----
  const isParentRoute =
    pathname.startsWith("/parent/") || pathname === "/parent";

  if (isParentRoute) {
    if (!user) {
      // Carry the destination — path AND query — so the magic-link
      // flow can return the parent here after login (e.g.
      // /parent/book/<id>?waitlist=<entry> from a waitlist email or a
      // marketing-site Book now button). clone() preserves the
      // ORIGINAL query string on the login URL itself — clear it,
      // then pack the full destination into `next`.
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/parent-login";
      loginUrl.search = "";
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return safeRedirect(request, loginUrl);
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
      // Honour a valid parent-scoped `next` (set by the anon redirect
      // above) so /parent-login?next=/parent/book/x?waitlist=y lands
      // on the booking page, not the bare portal. Invalid/missing
      // next → /parent. The target may carry its own query string —
      // assign pathname and search separately, or the `?` would be
      // percent-encoded into the path.
      const target = resolveParentLoginTarget(
        request.nextUrl.searchParams.get("next")
      );
      const queryIndex = target.indexOf("?");
      const parentUrl = request.nextUrl.clone();
      parentUrl.pathname =
        queryIndex === -1 ? target : target.slice(0, queryIndex);
      parentUrl.search = queryIndex === -1 ? "" : target.slice(queryIndex);
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
  if (!user && !publicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return safeRedirect(request, loginUrl);
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

    // Maybe it's a client user on the staff login page. limit(1), not
    // single(): multi-centre invites can create a second row.
    const { data: clientUserRows } = await supabase
      .from("client_users")
      .select("centre_id")
      .eq("user_id", user.id)
      .limit(1);
    const clientUser = clientUserRows?.[0] ?? null;

    if (clientUser) {
      const clientUrl = request.nextUrl.clone();
      clientUrl.pathname = `/client/${clientUser.centre_id}`;
      return NextResponse.redirect(clientUrl);
    }
  }

  // Authenticated user on client-login page → redirect
  if (user && pathname === "/client-login") {
    const { data: clientUserRows } = await supabase
      .from("client_users")
      .select("centre_id")
      .eq("user_id", user.id)
      .limit(1);
    const clientUser = clientUserRows?.[0] ?? null;

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
  if (user && !publicRoute && pathname !== "/set-password") {
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
          return safeRedirect(request, loginUrl);
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
