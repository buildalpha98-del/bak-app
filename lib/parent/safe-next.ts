// ============================================================
// parentSafeNext — parent-scoped open-redirect guard
// ============================================================
//
// The auth callback (`app/auth/callback/route.ts`) already rejects
// non-relative `next` values with its own safeNext(). This module
// layers a STRICTER parent-scope guard on the login side: only
// `/parent` or `/parent/...` destinations may override the default
// post-login target. Everything else (external URLs, protocol-
// relative `//evil`, other portals like `/admin`, prefix look-alikes
// like `/parents-hack`) falls back to `/parent-login`.
//
// Imported by middleware.ts (edge runtime) — keep this module pure
// and dependency-light.

import { getAuthCallbackUrl } from "@/lib/utils/base-url";

export function parentSafeNext(raw?: string | null): string {
  if (raw && (raw === "/parent" || raw.startsWith("/parent/"))) {
    return raw;
  }
  return "/parent-login";
}

/**
 * Build the `emailRedirectTo` URL for a parent magic link: the
 * sanitised destination, routed through /auth/callback so the auth
 * code can be exchanged before the user lands on it.
 */
export function buildParentMagicLinkRedirect(next?: string | null): string {
  return getAuthCallbackUrl(parentSafeNext(next));
}
