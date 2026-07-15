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
    (route) =>
      pathname === route ||
      (route !== "/" && pathname.startsWith(route + "/"))
  );
}
