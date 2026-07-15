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
// The public site has TWO origin helpers. Pick deliberately.
// ============================================================
//
// The dashboard and the public marketing site are the same Next app on
// the same Vercel project, answering on two different domains:
//
//   https://buildalphakids.app     (the APP — live today)
//   https://buildalphakids.com.au  (the SITE — still WordPress until
//                                   the DNS cutover)
//
// That "until" is the whole reason there are two helpers rather than
// one. Until DNS moves, `.com.au` does not serve this app at all, so a
// URL naming it is a URL nobody can follow. After DNS moves, both hosts
// serve every marketing route, so anything Google reads must name
// exactly one of them or they compete as duplicate content.
//
// Those two facts pull in OPPOSITE directions, so they get one helper
// each. Both read NEXT_PUBLIC_MARKETING_URL first — they differ ONLY in
// what they fall back to when it is unset:
//
//   getMarketingUrl()     → falls back to getBaseUrl()
//                           "where can a human reach us RIGHT NOW"
//   getCanonicalSiteUrl() → falls back to the .com.au literal
//                           "what is the one true public origin, FOREVER"
//
// ============================================================
// getMarketingUrl — reachable origin for links humans follow
// ============================================================
//
// Parent magic links, invite links, booking emails, referral share
// links and embed snippets. Every one of these is a URL somebody clicks,
// so it must point at a host that serves this app AT THE MOMENT IT IS
// SENT — not at the host we intend to use later.
//
// This is why the fallback is getBaseUrl() and not a `.com.au` literal.
// There is a window — merge and deploy are steps 6 of the cutover
// runbook, DNS is step 8 — where this code is live in production but
// `.com.au` is still WordPress. A hard default would send parent invites
// to WordPress during that window, and would do it SILENTLY: Supabase
// substitutes its project Site URL for any `emailRedirectTo` that is not
// on the redirect allowlist, so the link would quietly land somewhere
// else instead of erroring. With the getBaseUrl() fallback the
// pre-cutover behaviour is identical to main's today (`.app`, which
// works), and setting NEXT_PUBLIC_MARKETING_URL at cutover moves every
// caller at once — a config change, not a rewrite.

export function getMarketingUrl(): string {
  const marketing = process.env.NEXT_PUBLIC_MARKETING_URL;
  if (marketing) return marketing.replace(/\/+$/, "");
  return getBaseUrl();
}

// ============================================================
// getCanonicalSiteUrl — the one origin Google is told about
// ============================================================
//
// Canonical tags, metadataBase, sitemap entries, robots' Sitemap line,
// JSON-LD @id/url. NOT interchangeable with getMarketingUrl(), even
// though they return the same string once NEXT_PUBLIC_MARKETING_URL is
// set. The difference is what happens when it is UNSET.
//
// A canonical URL is an ASSERTION ABOUT IDENTITY, not a route: it says
// "of the several hosts serving this byte-identical page, THIS is the
// real one." That answer must be the same on every host and must not
// drift with deploy-time env — which is exactly what a getBaseUrl()
// fallback would do. Falling back to `.app` here would make each `.app`
// copy self-canonicalising, so the two domains would compete as
// duplicates: precisely the failure the split into two helpers exists to
// prevent, and the failure robots.ts explicitly delegates to canonical
// tags (it allows the `.app` crawl on purpose, because a canonical only
// works if the duplicate is crawlable).
//
// The sitemap makes the asymmetry concrete. With a getBaseUrl()
// fallback, an un-flipped deploy would serve a robots.txt advertising
// `https://buildalphakids.app/sitemap.xml`, listing `.app` URLs, all
// crawlable and all self-canonical — an indexable duplicate of the whole
// site, offered to Googlebot at the worst possible moment. `.app` is not
// obscure enough to rely on: it is HSTS-preloaded and its certificates
// are in the public CT logs, so it gets discovered without anyone
// submitting anything. Nothing is indexed yet, so the literal costs us
// nothing pre-cutover and prevents a mess post-cutover.
//
// It also fails safe: if step 7 of the runbook (the env flip) is missed,
// links degrade to `.app` — which still works, since both hosts serve
// every route — instead of the index quietly splitting in two.
//
// The env override is honoured so preview deploys and local dev can
// point canonicals at themselves rather than at production.

export function getCanonicalSiteUrl(): string {
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
