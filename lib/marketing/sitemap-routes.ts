// ============================================================
import { SPORT_PAGES } from "./deep-content";
// Sitemap route table + entry builder (pure)
// ============================================================
//
// Split out of app/sitemap.ts so the URL construction and the
// portal-exclusion guard are unit-testable without booting Next or
// touching Supabase.

export type ChangeFrequency =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export type MarketingRoute = {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
};

export type SitemapEntry = {
  url: string;
  lastModified: Date;
  changeFrequency: ChangeFrequency;
  priority: number;
};

/**
 * Every PUBLIC marketing route, and only those.
 *
 * Priorities are relative to each other, not absolute quality scores:
 * the homepage and the programs hub are what we want ranked, the
 * legal-ish and conversion pages sit below them.
 */
export const STATIC_MARKETING_ROUTES: MarketingRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/programs", changeFrequency: "monthly", priority: 0.9 },
  // The flagship B2B landing page — schools are a primary audience.
  { path: "/schools", changeFrequency: "monthly", priority: 0.9 },
  // Clinic availability turns over each school-holiday cycle, so this
  // page genuinely changes more often than the evergreen program pages.
  { path: "/holiday-clinics", changeFrequency: "weekly", priority: 0.9 },
  // The flagship ELC landing page — childcare is the volume audience
  // (50+ centres). Replaced /programs/childcare, which now 308s here.
  { path: "/childcare", changeFrequency: "monthly", priority: 0.9 },
  { path: "/programs/primary-school", changeFrequency: "monthly", priority: 0.8 },
  { path: "/programs/high-school", changeFrequency: "monthly", priority: 0.8 },
  { path: "/programs/after-school", changeFrequency: "monthly", priority: 0.8 },
  { path: "/programs/holiday-programs", changeFrequency: "monthly", priority: 0.8 },
  // Sport-specific school pages (SEO pack Cluster D) — generated from
  // SPORT_PAGES so new tranches appear here without hand-editing.
  ...SPORT_PAGES.map((p): MarketingRoute => ({
    path: `/programs/${p.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  })),
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/enquire", changeFrequency: "yearly", priority: 0.7 },
  { path: "/about", changeFrequency: "yearly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
  // Legal pages: indexed (they're linked site-wide and the old WP URLs
  // 301 here, so Google will fetch them regardless) but at the bottom of
  // the priority range — nobody should reach us via a policy page.
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * Path prefixes that must NEVER reach the sitemap. Handing Google a
 * signed-out portal route wastes crawl budget on a login redirect and
 * advertises the app's internal surface.
 *
 * This is a belt-and-braces guard over STATIC_MARKETING_ROUTES (which
 * is hand-maintained and could drift) — not the primary defence.
 */
export const PORTAL_PATH_PREFIXES = [
  "/admin",
  "/ops",
  "/coach",
  "/parent",
  "/parent-login",
  "/client",
  "/client-login",
  "/login",
  "/reset-password",
  "/update-password",
  "/set-password",
  "/auth",
  "/api",
  "/offline",
  "/feedback",
  "/refer",
];

/** True when `path` is a portal/auth route rather than a public page. */
export function isPortalPath(path: string): boolean {
  return PORTAL_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}

/**
 * Join the canonical origin to a route path.
 *
 * The homepage is the special case: `${origin}/` would emit a trailing
 * slash that disagrees with the canonical tag Task 6.1 renders, and two
 * spellings of the homepage in Google's index is exactly the duplicate
 * we are trying to avoid.
 */
export function toAbsoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  return path === "/" ? base : `${base}${path}`;
}

export type SitemapPost = {
  slug: string;
  published_at: string | null;
};

/**
 * Build the full sitemap: static marketing routes + published posts.
 *
 * `now` is injected rather than read from the clock so tests are
 * deterministic. Posts fall back to `now` when `published_at` is null —
 * getPublishedPosts() already excludes those, but the sitemap must not
 * emit an "Invalid Date" if that ever changes.
 */
export function buildSitemapEntries(
  origin: string,
  posts: SitemapPost[],
  now: Date
): SitemapEntry[] {
  const staticEntries: SitemapEntry[] = STATIC_MARKETING_ROUTES.filter(
    (route) => !isPortalPath(route.path)
  ).map((route) => ({
    url: toAbsoluteUrl(origin, route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const postEntries: SitemapEntry[] = posts.map((post) => ({
    url: toAbsoluteUrl(origin, `/blog/${post.slug}`),
    lastModified: post.published_at ? new Date(post.published_at) : now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticEntries, ...postEntries];
}
