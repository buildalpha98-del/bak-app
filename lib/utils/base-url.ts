// ============================================================
// getBaseUrl — single source of truth for outbound URLs
// ============================================================
//
// Magic links, password resets and any email that links back into
// our app go through this. The order matters:
//
//   1. NEXT_PUBLIC_SITE_URL — explicit canonical domain. Set this
//      on production so links always point at buildalphakids.app,
//      not a per-deployment Vercel subdomain.
//   2. NEXT_PUBLIC_APP_URL — legacy alias kept for backwards
//      compat with existing env vars in some deploys.
//   3. VERCEL_URL — per-deployment URL (preview branches, CI). Only
//      used as a fallback so previews aren't totally broken.
//   4. localhost — final fallback for local dev.
//
// VERCEL_URL is intentionally NOT preferred — on production it's
// the deployment-specific subdomain (bak-app-abc123.vercel.app),
// which Supabase rejects unless explicitly allow-listed. The
// canonical buildalphakids.app must be configured via
// NEXT_PUBLIC_SITE_URL.

export function getBaseUrl(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (site) return site.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Build a callback URL for a Supabase auth flow (magic link, password
 * reset, recovery). Routes through /auth/callback so the auth code
 * can be exchanged for a session before the user is sent to `next`.
 */
export function getAuthCallbackUrl(next: string): string {
  const base = getBaseUrl();
  const safeNext = next.startsWith("/") ? next : `/${next}`;
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
