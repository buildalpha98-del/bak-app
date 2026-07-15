import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/utils/base-url";
import { getPublishedPosts } from "@/lib/marketing/blog";
import { safeFetch } from "@/lib/marketing/safe-fetch";
import { buildSitemapEntries } from "@/lib/marketing/sitemap-routes";

// Absolute URLs are built from getCanonicalSiteUrl() — the public
// .com.au origin — never getBaseUrl(), which is the app domain
// (buildalphakids.app). Both hosts serve this file, so a sitemap
// built from the request host would list the .app copy of every
// marketing page and compete with our own canonical tags.
//
// Nor getMarketingUrl(), whose whole point is that it falls back to the
// app domain before the DNS cutover so parent links stay clickable. That
// is right for links a human follows and wrong here: a sitemap is what
// we ASK Google to index, and one listing .app URLs — each of which
// self-canonicalises — is an invitation to index the duplicate site.
// This file is deliberately pinned to the canonical origin even while
// that origin still serves WordPress; nothing is indexed yet, so naming
// it early costs nothing.
//
// Revalidate hourly: the static routes never move, but a post
// published from the admin editor should surface without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The blog_posts table is UNAPPLIED at time of writing (migration 070
  // has not been run), so getPublishedPosts() throws here at build time.
  // safeFetch degrades that to [] — the sitemap must still render every
  // static marketing route rather than failing the build. Blog URLs
  // start appearing once the migration lands and the hourly revalidate
  // (or a redeploy) picks them up.
  const posts = await safeFetch(() => getPublishedPosts(), []);

  return buildSitemapEntries(getCanonicalSiteUrl(), posts, new Date());
}
