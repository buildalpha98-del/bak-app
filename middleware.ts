import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/client-login",
  "/reset-password",
  "/update-password",
  "/feedback",
  "/client/shared", // shared read-only links (token-based, no auth)
];

// Role → allowed route prefixes (staff roles only)
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ["/admin", "/ops", "/coach"], // admin can access all portals
  ops: ["/ops"],
  coach: ["/coach"],
};

// Role → default portal
const ROLE_PORTAL: Record<string, string> = {
  admin: "/admin",
  ops: "/ops",
  coach: "/coach",
};

export async function middleware(request: NextRequest) {
  // Skip auth refresh if Supabase is not configured yet
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  const { response, supabase } = createSupabaseMiddlewareClient(request);
  const { pathname } = request.nextUrl;

  // Refresh the auth session
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

    // Check if user is a client user and extract their centre ID
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("centre_id")
      .eq("user_id", user.id)
      .single();

    if (!clientUser) {
      // Not a client user — check if they're staff
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

      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/client-login";
      return NextResponse.redirect(loginUrl);
    }

    // Client users can only access their own centre's portal
    const centreIdMatch = pathname.match(/^\/client\/([^/]+)/);
    if (centreIdMatch && centreIdMatch[1] !== clientUser.centre_id) {
      const correctUrl = request.nextUrl.clone();
      correctUrl.pathname = `/client/${clientUser.centre_id}`;
      return NextResponse.redirect(correctUrl);
    }

    return response;
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();

      if (!profile) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        return NextResponse.redirect(loginUrl);
      }

      if (profile.status === "onboarding") {
        const setPasswordUrl = request.nextUrl.clone();
        setPasswordUrl.pathname = "/set-password";
        return NextResponse.redirect(setPasswordUrl);
      }

      const allowedPrefixes = ROLE_ROUTES[profile.role] || [];
      const hasAccess = allowedPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + "/")
      );

      if (!hasAccess) {
        const portalUrl = request.nextUrl.clone();
        portalUrl.pathname = ROLE_PORTAL[profile.role] || "/login";
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
