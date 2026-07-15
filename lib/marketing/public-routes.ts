// Single source of truth for unauthenticated-accessible paths.
// Matching: exact, or prefix + "/" — so "/" matches only the homepage.
export const PUBLIC_ROUTES = [
  "/",
  "/programs",
  "/holiday-clinics",
  "/about",
  "/blog",
  "/enquire",
  "/contact",
  "/login",
  "/client-login",
  "/parent-login",
  "/reset-password",
  "/update-password",
  "/auth/callback",
  "/feedback",
  "/refer",
  "/client/shared",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}
