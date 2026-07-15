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

// ============================================================
// getMarketingUrl — canonical origin of the PUBLIC site
// ============================================================
//
// Why this exists separately from getBaseUrl(): the dashboard and the
// public marketing site are the same Next app on the same Vercel
// project, but they answer on two different domains —
//
//   getBaseUrl()      → https://buildalphakids.app     (the APP)
//   getMarketingUrl() → https://buildalphakids.com.au  (the SITE)
//
// getBaseUrl() is what staff emails link back to (magic links, password
// resets, crons, invoice PDFs) and must stay pinned to the app domain.
// getMarketingUrl() is the SEO canonical: because every marketing page
// is reachable on both hosts, canonical tags / OG URLs / sitemap entries
// must all name the one public origin or the two domains compete as
// duplicate content. Never build those from getBaseUrl().
//
// Overridable via NEXT_PUBLIC_MARKETING_URL so previews and local dev
// can point elsewhere; the default is the production public domain.

export function getMarketingUrl(): string {
  const marketing = process.env.NEXT_PUBLIC_MARKETING_URL;
  if (marketing) return marketing.replace(/\/+$/, "");
  return "https://buildalphakids.com.au";
}

// ============================================================
// resolveAuthOrigin — host-aware origin for PARENT auth links
// ============================================================
//
// A parent can arrive on either domain, and `.app` and `.com.au` are
// different TLDs — a session cookie set on one is invisible to the
// other. So a magic link must return the parent to the host they
// STARTED on, not to a hardcoded origin.
//
// SECURITY: the Host / X-Forwarded-Host header is client-controlled.
// It is only ever compared against this exact allowlist, and an
// unrecognised value falls back to getBaseUrl() — a spoofed host is
// never echoed into a redirect URL, which would make this an open
// redirect and hand an attacker the auth code.
//
// Matching is exact (a Map lookup, not a prefix/suffix test), so
// look-alikes such as `buildalphakids.com.au.evil.com` do not match.

function authOriginsByHost(): Map<string, string> {
  const entries: Array<[string, string]> = [
    ["buildalphakids.com.au", "https://buildalphakids.com.au"],
    ["www.buildalphakids.com.au", "https://www.buildalphakids.com.au"],
    ["buildalphakids.app", "https://buildalphakids.app"],
    ["localhost:3000", "http://localhost:3000"],
  ];
  // Read at call time, not module load, so preview deployments (and
  // tests) see the current value.
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    entries.push([vercelUrl.toLowerCase(), `https://${vercelUrl}`]);
  }
  return new Map(entries);
}

export function resolveAuthOrigin(host: string | null | undefined): string {
  if (!host) return getBaseUrl();
  const normalised = host.trim().toLowerCase();
  return authOriginsByHost().get(normalised) ?? getBaseUrl();
}

/**
 * Build a callback URL for a Supabase auth flow (magic link, password
 * reset, recovery). Routes through /auth/callback so the auth code
 * can be exchanged for a session before the user is sent to `next`.
 *
 * `origin` defaults to getBaseUrl() (the app domain) — that is correct
 * for every staff flow. Only parent magic links pass an explicit,
 * allowlist-validated origin from resolveAuthOrigin().
 */
export function getAuthCallbackUrl(next: string, origin?: string): string {
  const base = origin ?? getBaseUrl();
  const safeNext = next.startsWith("/") ? next : `/${next}`;
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}
