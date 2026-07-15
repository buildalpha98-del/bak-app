// Single source of truth for unauthenticated-accessible paths.
// Matching: exact, or prefix + "/". The "/" entry is explicitly
// guarded so it matches only the homepage — without the guard, a raw
// "//admin" request would satisfy startsWith("/" + "/").
export const PUBLIC_ROUTES = [
  "/",
  "/programs",
  "/holiday-clinics",
  "/about",
  "/blog",
  "/enquire",
  "/contact",
  // Legal pages must be reachable signed-out: the footer links them from
  // every page, and the old WP URLs 301 here for anonymous crawlers.
  "/privacy",
  "/terms",
  "/login",
  "/client-login",
  "/parent-login",
  "/reset-password",
  "/update-password",
  "/auth/callback",
  "/feedback",
  "/refer",
  "/client/shared",
  // Crawler endpoints. The middleware matcher only excludes _next,
  // static assets and a file-extension list that these two do not
  // match, so without an entry here an anonymous GET /sitemap.xml is
  // redirected to /login — i.e. Google would never read the sitemap
  // or the robots rules at all.
  "/sitemap.xml",
  "/robots.txt",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) =>
      pathname === route ||
      (route !== "/" && pathname.startsWith(route + "/"))
  );
}
