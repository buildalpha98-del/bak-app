import type { MetadataRoute } from "next";
import { getMarketingUrl } from "@/lib/utils/base-url";

// ============================================================
// robots.txt
// ============================================================
//
// On the two-domain problem (buildalphakids.com.au AND
// buildalphakids.app both serve every marketing route — see Task 6.0):
// this file CANNOT solve it, and deliberately does not try.
//
// robots.ts is evaluated once at build time and emits one static
// robots.txt served byte-identically on both hosts. There is no request
// host to branch on — reading headers() here would opt the route into
// dynamic rendering on every crawl just to vary one line, and getting
// it wrong (e.g. a cached "Disallow: /" from the .app render served on
// .com.au) would deindex the real site. Not a trade worth making.
//
// So duplicate content is left to the canonical tags from Task 6.1,
// which is the right tool: every marketing page already declares
// https://buildalphakids.com.au/... as its canonical regardless of the
// host it was served from, so Google consolidates the .app copies onto
// the .com.au originals. Crucially, canonicals only work if the
// duplicate is CRAWLABLE — a robots "Disallow" on .app would block the
// crawl and leave the canonical unread, which is strictly worse.
//
// The `sitemap` line always names the .com.au origin via
// getMarketingUrl(), so even the .app copy of this file points crawlers
// back at the canonical host.
//
// If the .app duplicates ever do show up in the index, the correct fix
// is an `X-Robots-Tag: noindex` response header emitted from middleware
// for marketing paths when the request host is buildalphakids.app —
// header-level, host-aware, and it still allows the crawl. That is a
// deliberate follow-up, not this task.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Portal and auth surfaces. These all redirect to /login when
      // signed out, so they are worthless to a crawler and would burn
      // crawl budget that belongs to the marketing pages.
      disallow: [
        "/admin",
        "/ops",
        "/coach",
        "/parent",
        "/client",
        "/api/",
      ],
    },
    sitemap: `${getMarketingUrl()}/sitemap.xml`,
  };
}
