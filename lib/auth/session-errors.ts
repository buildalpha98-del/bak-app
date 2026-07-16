/**
 * Classifies a Supabase auth error as a *revoked/broken* session —
 * one whose sb-* cookies must be wiped so the browser stops
 * re-sending them (banned user, rotated-away refresh token,
 * malformed token).
 *
 * Critically, AuthSessionMissingError (status 400, no code) is the
 * NORMAL anonymous state — every logged-out visitor produces it —
 * and must return false. Treating it as broken redirect-looped
 * /login and bounced anonymous visitors off every public page.
 */
export function isRevokedSessionError(error: {
  name?: string;
  code?: string;
  status?: number;
}): boolean {
  if (error.name === "AuthSessionMissingError") return false;
  return (
    error.code === "user_banned" ||
    error.code === "refresh_token_not_found" ||
    error.status === 400
  );
}
