import type { Metadata, Viewport } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { JsonLd } from "@/components/marketing/json-ld";
import { localBusinessJsonLd } from "@/lib/marketing/jsonld";
import { getCanonicalSiteUrl } from "@/lib/utils/base-url";
import { HOMEPAGE, OG_IMAGE, SITE } from "@/lib/marketing/content";

/**
 * Metadata defaults for every marketing page.
 *
 * `metadataBase` is getCanonicalSiteUrl() — the PUBLIC origin
 * (buildalphakids.com.au), never getBaseUrl() (the app domain,
 * buildalphakids.app). Both hosts serve every route in this group, so
 * this base is what resolves each page's relative `alternates.canonical`
 * into the single absolute URL that settles the duplicate-content
 * question. Get this wrong and the canonicals point search engines at
 * the duplicate.
 *
 * Specifically NOT getMarketingUrl(): that helper falls back to the app
 * domain until the DNS cutover so parent invite links stay clickable in
 * the deploy-before-cutover window. Using it here would make every .app
 * page self-canonical during that window and the two domains would
 * compete — the exact thing this base exists to prevent.
 *
 * `title.template` appends the brand to each page's own title, so pages
 * below set a BARE title ("Contact", not "Contact — Build Alpha Kids")
 * or the brand lands twice. `default` covers the homepage, which wants
 * the brand first and so opts out via the template not applying.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: {
    template: `%s | ${SITE.name}`,
    default: `${SITE.name} — ${SITE.tagline}`,
  },
  description: HOMEPAGE.heroSub,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_AU",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    images: [OG_IMAGE.url],
  },
};

/**
 * Marketing pages must be pinch-zoomable.
 *
 * The root layout sets `maximumScale: 1`, which suppresses iOS Safari's
 * zoom-on-input-focus in the installed PWA. That trade-off is defensible
 * for the operator/parent portals — they are data-entry surfaces used by
 * signed-in people on their own device. It is NOT defensible on public
 * pages: locking the scale is a WCAG 1.4.4 (Resize Text) failure, and a
 * parent reading a program page on a phone must be able to zoom.
 *
 * Overriding `viewport` here rather than in the root layout confines the
 * change to this route group, so no portal behaviour moves.
 *
 * `maximumScale: 5` (not the `undefined`/omitted default) is deliberate:
 * Lighthouse's meta-viewport audit requires maximum-scale >= 5, and
 * stating it keeps the intent explicit for the next reader.
 *
 * viewportFit is re-declared because a nested `viewport` export REPLACES
 * the root's rather than merging into it — dropping it here would remove
 * viewport-fit=cover from every marketing page.
 */
export const viewport: Viewport = {
  themeColor: "#E8712A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#1A1A1A]">
      {/*
        LocalBusiness, once, site-wide. It belongs in the layout rather
        than on the homepage because parents arrive from search onto
        /holiday-clinics and /blog/<post> far more often than onto / —
        the record has to be on the page they actually land on.
      */}
      <JsonLd data={localBusinessJsonLd()} />
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
