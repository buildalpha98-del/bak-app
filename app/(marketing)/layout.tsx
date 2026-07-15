import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { JsonLd } from "@/components/marketing/json-ld";
import { localBusinessJsonLd } from "@/lib/marketing/jsonld";
import { getMarketingUrl } from "@/lib/utils/base-url";
import { HOMEPAGE, OG_IMAGE, SITE } from "@/lib/marketing/content";

/**
 * Metadata defaults for every marketing page.
 *
 * `metadataBase` is getMarketingUrl() — the PUBLIC origin
 * (buildalphakids.com.au), never getBaseUrl() (the app domain,
 * buildalphakids.app). Both hosts serve every route in this group, so
 * this base is what resolves each page's relative `alternates.canonical`
 * into the single absolute URL that settles the duplicate-content
 * question. Get this wrong and the canonicals point search engines at
 * the duplicate.
 *
 * `title.template` appends the brand to each page's own title, so pages
 * below set a BARE title ("Contact", not "Contact — Build Alpha Kids")
 * or the brand lands twice. `default` covers the homepage, which wants
 * the brand first and so opts out via the template not applying.
 */
export const metadata: Metadata = {
  metadataBase: new URL(getMarketingUrl()),
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
