// ============================================================
// parentSafeNext — parent-scoped open-redirect guard
// ============================================================
//
// The auth callback (`app/auth/callback/route.ts`) already rejects
// non-relative `next` values with its own safeNext(). This module
// layers a STRICTER parent-scope guard on the login side: only
// `/parent` or `/parent/...` destinations (query string allowed) may
// override the default post-login target. Everything else (external
// URLs, protocol-relative `//evil`, other portals like `/admin`,
// prefix look-alikes like `/parents-hack`, dot-segment escapes)
// returns null — "no usable next".
//
// Imported by middleware.ts (edge runtime) — keep this module pure
// and dependency-light.

import { getAuthCallbackUrl } from "@/lib/utils/base-url";

// Dot-segments (`..` / `.`) normalise at the redirect sinks, so
// `/parent/../admin` would escape the parent scope while passing a
// plain prefix check. Reject any PATH segment that is `.` or `..` —
// literally or percent-encoded (`%2e`/`%2E`), since a literal encoded
// form decodes to a dot-segment at the sink. Only the path part is
// segment-checked; query content is opaque and never re-parsed as a
// path.
function hasDotSegment(path: string): boolean {
  return path.split("/").some((segment) => {
    const normalised = segment.toLowerCase().split("%2e").join(".");
    return normalised === "." || normalised === "..";
  });
}

export function parentSafeNext(raw?: string | null): string | null {
  if (!raw) return null;
  const queryIndex = raw.indexOf("?");
  const pathPart = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  if (pathPart !== "/parent" && !pathPart.startsWith("/parent/")) return null;
  if (hasDotSegment(pathPart)) return null;
  return raw;
}

/**
 * Where should an already-authenticated parent landing on
 * /parent-login go? The validated `next` if there is one, else the
 * portal home.
 */
export function resolveParentLoginTarget(raw: string | null): string {
  return parentSafeNext(raw) ?? "/parent";
}

/**
 * Build the `emailRedirectTo` URL for a parent magic link: the
 * sanitised destination, routed through /auth/callback so the auth
 * code can be exchanged before the user lands on it. With no usable
 * `next` the link falls back to /parent-login, whose middleware then
 * routes registered parents onward.
 *
 * `origin` is the host the parent is actually on, already validated
 * against the allowlist by resolveAuthOrigin() — the site and the app
 * are different TLDs, so the link must come back to the domain the
 * parent started on or their session cookie lands on the wrong one.
 * Omitting it keeps the app domain (getBaseUrl()); this function never
 * validates the origin itself, so callers must pass a resolved one.
 */
export function buildParentMagicLinkRedirect(
  next?: string | null,
  origin?: string
): string {
  return getAuthCallbackUrl(parentSafeNext(next) ?? "/parent-login", origin);
}
