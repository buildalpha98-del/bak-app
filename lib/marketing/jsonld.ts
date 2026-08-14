// ============================================================
// Structured data (schema.org JSON-LD) builders
// ============================================================
//
// Pure builders — each returns a plain object that a page serialises
// into <script type="application/ld+json">. No server-only imports, so
// these are safe to call from any marketing surface.
//
// ORIGIN: every absolute URL here comes from getCanonicalSiteUrl()
// (https://buildalphakids.com.au), NEVER getBaseUrl() — that is the
// app domain (buildalphakids.app). Both hosts serve every marketing
// route, so structured data naming the wrong origin would point search
// engines at the duplicate rather than the canonical.
//
// Not getMarketingUrl() either: it falls back to the app domain until
// the DNS cutover, which is correct for links a parent clicks and wrong
// for an @id. These @id/url values are schema.org IDENTITY claims that
// have to agree with the canonical tag on the same page — if they drift
// apart, the structured data names one entity and the canonical another.
//
// PLACEHOLDERS: SITE carries TODO-CONFIRM values (phone, socials, ABN)
// that are not sourceable yet. The rule, matching what the footer
// already does with socials: a TODO-CONFIRM value is never emitted as
// if it were real. Socials are dropped from sameAs; the phone is
// handled below.

import { getCanonicalSiteUrl } from "@/lib/utils/base-url";
import { sydneyIsoDateTime } from "@/lib/utils/sydney-time";
import { SITE } from "@/lib/marketing/content";
import {
  clinicAvailability,
  type PublicClinic,
} from "@/lib/marketing/clinics-shared";
import type { PublicBlogPost } from "@/lib/marketing/blog";

const SCHEMA_CONTEXT = "https://schema.org";

/** A TODO-CONFIRM value is a placeholder, not data. */
function isPlaceholder(value: string): boolean {
  return value.startsWith("TODO-CONFIRM");
}

/**
 * LocalBusiness — rendered once, site-wide, from the marketing layout.
 *
 * `telephone` is OMITTED while SITE.phone is the TODO-CONFIRM
 * placeholder, and this is a deliberate departure from how the footer
 * and /contact treat the same value. The reasoning: on a rendered page
 * a placeholder is a visible flag that a human reads and fixes before
 * launch. In structured data it is the opposite — machine-readable,
 * invisible to us, and consumed as fact. A wrong phone number in a
 * LocalBusiness record is what Google may surface in a knowledge panel
 * or a "call" button, which is strictly worse than no number at all:
 * telephone is an optional property, so omitting it costs nothing,
 * while publishing "TODO-CONFIRM 0400 000 000" would either be
 * ingested as a real number or invalidate the record.
 *
 * The omission is not silent: it is guarded by a test, and the field
 * appears the moment SITE.phone holds a real number — no further code
 * change needed.
 */
export function localBusinessJsonLd() {
  const sameAs = Object.values(SITE.socials).filter(
    (url) => !isPlaceholder(url)
  );

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "LocalBusiness",
    name: SITE.name,
    description: SITE.tagline,
    url: getCanonicalSiteUrl(),
    email: SITE.email,
    ...(isPlaceholder(SITE.phone) ? {} : { telephone: SITE.phone }),
    areaServed: {
      "@type": "Place",
      name: SITE.serviceArea,
    },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Event — one per open clinic on /holiday-clinics.
 *
 * DST: startDate/endDate combine the clinic's Sydney calendar date with
 * its Sydney wall-clock times. The offset MUST be derived per-date, not
 * hardcoded — see sydneyUtcOffset() in lib/utils/sydney-time.ts. The
 * October and December–January clinic seasons are both AEDT (+11:00),
 * so a hardcoded +10:00 would misreport most of the year's clinics by
 * an hour.
 */
export function eventJsonLd(clinic: PublicClinic) {
  const { soldOut } = clinicAvailability(clinic);
  const origin = getCanonicalSiteUrl();

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Event",
    name: clinic.title,
    // Clinics are run in person at a venue; the default is
    // "OfflineEventAttendanceMode" but stating it is what stops a
    // consumer guessing.
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    startDate: sydneyIsoDateTime(clinic.date, clinic.start_time),
    endDate: sydneyIsoDateTime(clinic.date, clinic.end_time),
    url: `${origin}/holiday-clinics`,
    location: {
      "@type": "Place",
      name: clinic.location_name ?? clinic.suburb,
      address: {
        "@type": "PostalAddress",
        addressLocality: clinic.suburb,
        addressRegion: "NSW",
        addressCountry: "AU",
      },
    },
    organizer: {
      "@type": "Organization",
      name: SITE.name,
      url: origin,
    },
    offers: {
      "@type": "Offer",
      // schema.org price is a plain decimal string — no currency
      // symbol, no thousands separator. formatClinicPrice() renders
      // "$45.00" for humans and is deliberately NOT used here.
      price: (clinic.price_cents / 100).toFixed(2),
      priceCurrency: "AUD",
      availability: soldOut
        ? "https://schema.org/SoldOut"
        : "https://schema.org/InStock",
      url: `${origin}/holiday-clinics`,
    },
  };
}

/**
 * Article — rendered on /blog/[slug].
 *
 * `image` is omitted when the post has no cover: the WordPress import
 * deliberately left cover_image_url null on every migrated post, so
 * absence is the normal case here, not an edge one. Emitting an empty
 * or invented image would be worse than the property being absent —
 * image is optional on Article.
 */
export function articleJsonLd(post: PublicBlogPost) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BlogPosting",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.published_at ? { datePublished: post.published_at } : {}),
    ...(post.cover_image_url ? { image: post.cover_image_url } : {}),
    author: {
      "@type": "Person",
      name: post.author_name,
    },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: getCanonicalSiteUrl(),
    },
    url: `${getCanonicalSiteUrl()}/blog/${post.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${getCanonicalSiteUrl()}/blog/${post.slug}`,
    },
  };
}

/**
 * FAQPage schema for pages that render a visible FAQ accordion —
 * /schools, /childcare and every sport page. Google shows FAQ rich
 * results only when the same Q&A text is visible on the page, so
 * callers must pass exactly the rendered list, never a superset.
 */
export function faqPageJsonLd(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
