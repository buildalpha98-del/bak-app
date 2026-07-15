import { describe, it, expect, vi, afterEach } from "vitest";
import { localBusinessJsonLd, eventJsonLd, articleJsonLd } from "../jsonld";
import { SITE } from "../content";
import type { PublicClinic } from "../clinics-shared";
import type { PublicBlogPost } from "../blog";

/**
 * A distinct origin, deliberately NOT the production default: a test
 * that asserted "https://buildalphakids.com.au" would pass against code
 * that hardcoded the string, or that called getBaseUrl() on a machine
 * with no env set. Stubbing something else is what makes the assertion
 * bite.
 */
const ORIGIN = "https://marketing.test";

function stubOrigin() {
  vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", ORIGIN);
  // The app domain. If a builder reaches for getBaseUrl() instead of
  // getMarketingUrl(), these tests fail with a visible wrong host
  // rather than both resolving to the same default.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.test");
}

function clinic(overrides: Partial<PublicClinic> = {}): PublicClinic {
  return {
    id: "clinic-1",
    title: "Multi-Sport Holiday Clinic",
    sport: "Basketball",
    date: "2026-07-21",
    start_time: "09:00:00",
    end_time: "15:00:00",
    location_name: "Liverpool Community Centre",
    suburb: "Liverpool",
    age_group_min: 5,
    age_group_max: 12,
    price_cents: 4500,
    max_capacity: 20,
    current_bookings: 4,
    booking_opens_at: null,
    booking_closes_at: null,
    ...overrides,
  };
}

function post(overrides: Partial<PublicBlogPost> = {}): PublicBlogPost {
  return {
    id: "post-1",
    slug: "why-multi-sport-works",
    title: "Why multi-sport works",
    excerpt: "Kids who play many sports stay in sport for longer.",
    cover_image_url: null,
    published_at: "2026-07-01T23:00:00.000Z",
    author_name: "Jayden Kowaider",
    tags: [],
    ...overrides,
  } as PublicBlogPost;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// ------------------------------------------------------------
// eventJsonLd — DST
// ------------------------------------------------------------
//
// The reason this file exists. Sydney is AEST (+10:00) in winter and
// AEDT (+11:00) from the first Sunday in October to the first Sunday in
// April — which covers the October and December–January clinic seasons,
// i.e. MOST of the year's clinics. A hardcoded +10:00 passes the July
// test below and silently reports every summer clinic an hour early.

describe("eventJsonLd — Sydney DST offsets", () => {
  it("uses AEST +10:00 for a July (winter) clinic", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ date: "2026-07-21" }));
    expect(result.startDate).toBe("2026-07-21T09:00:00+10:00");
    expect(result.endDate).toBe("2026-07-21T15:00:00+10:00");
  });

  it("uses AEDT +11:00 for a January (summer holiday season) clinic", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ date: "2026-01-15" }));
    expect(result.startDate).toBe("2026-01-15T09:00:00+11:00");
    expect(result.endDate).toBe("2026-01-15T15:00:00+11:00");
  });

  it("uses AEDT +11:00 for an October school-holiday clinic", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ date: "2026-10-06" }));
    expect(result.startDate).toBe("2026-10-06T09:00:00+11:00");
  });

  it("switches offset across the April DST boundary", () => {
    stubOrigin();
    // 2026-04-05 is the first Sunday in April — DST ends at 03:00.
    // A daytime clinic that day is already back on AEST.
    expect(eventJsonLd(clinic({ date: "2026-04-04" })).startDate).toContain(
      "+11:00"
    );
    expect(eventJsonLd(clinic({ date: "2026-04-05" })).startDate).toContain(
      "+10:00"
    );
  });

  it("emits a startDate a Date can parse back to the right instant", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ date: "2026-01-15" }));
    // 09:00 AEDT === 22:00 UTC the previous day.
    expect(new Date(result.startDate).toISOString()).toBe(
      "2026-01-14T22:00:00.000Z"
    );
  });
});

// ------------------------------------------------------------
// eventJsonLd — shape
// ------------------------------------------------------------

describe("eventJsonLd", () => {
  it("carries the schema.org context and Event type", () => {
    stubOrigin();
    const result = eventJsonLd(clinic());
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Event");
    expect(result.name).toBe("Multi-Sport Holiday Clinic");
  });

  it("formats price as a plain decimal string in AUD, not display currency", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ price_cents: 4500 }));
    expect(result.offers.price).toBe("45.00");
    expect(result.offers.priceCurrency).toBe("AUD");
    // The human-facing "$45.00" would be invalid here.
    expect(result.offers.price).not.toContain("$");
  });

  it("formats a non-round price without floating point drift", () => {
    stubOrigin();
    expect(eventJsonLd(clinic({ price_cents: 3333 })).offers.price).toBe(
      "33.33"
    );
  });

  it("reports InStock while spots remain", () => {
    stubOrigin();
    const result = eventJsonLd(
      clinic({ max_capacity: 20, current_bookings: 19 })
    );
    expect(result.offers.availability).toBe("https://schema.org/InStock");
  });

  it("reports SoldOut when the clinic is full", () => {
    stubOrigin();
    const result = eventJsonLd(
      clinic({ max_capacity: 20, current_bookings: 20 })
    );
    expect(result.offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("reports SoldOut when bookings have overrun capacity", () => {
    stubOrigin();
    const result = eventJsonLd(
      clinic({ max_capacity: 20, current_bookings: 23 })
    );
    expect(result.offers.availability).toBe("https://schema.org/SoldOut");
  });

  it("builds a PostalAddress from the venue and suburb", () => {
    stubOrigin();
    const result = eventJsonLd(clinic());
    expect(result.location.name).toBe("Liverpool Community Centre");
    expect(result.location.address).toEqual({
      "@type": "PostalAddress",
      addressLocality: "Liverpool",
      addressRegion: "NSW",
      addressCountry: "AU",
    });
  });

  it("falls back to the suburb when the venue has no name", () => {
    stubOrigin();
    const result = eventJsonLd(clinic({ location_name: null }));
    expect(result.location.name).toBe("Liverpool");
  });

  it("points url at the marketing origin, not the app domain", () => {
    stubOrigin();
    const result = eventJsonLd(clinic());
    expect(result.url).toBe(`${ORIGIN}/holiday-clinics`);
    expect(result.offers.url).toBe(`${ORIGIN}/holiday-clinics`);
    expect(result.url).not.toContain("app.test");
  });
});

// ------------------------------------------------------------
// localBusinessJsonLd
// ------------------------------------------------------------

describe("localBusinessJsonLd", () => {
  it("carries the schema.org context and LocalBusiness type", () => {
    stubOrigin();
    const result = localBusinessJsonLd();
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("LocalBusiness");
    expect(result.name).toBe("Build Alpha Kids");
  });

  it("uses the marketing origin, not the app domain", () => {
    stubOrigin();
    expect(localBusinessJsonLd().url).toBe(ORIGIN);
  });

  it("honours a changed NEXT_PUBLIC_MARKETING_URL at call time", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://other.test");
    expect(localBusinessJsonLd().url).toBe("https://other.test");
  });

  it("states the service area as a Place", () => {
    stubOrigin();
    expect(localBusinessJsonLd().areaServed).toEqual({
      "@type": "Place",
      name: "South-West Sydney",
    });
  });

  it("excludes TODO-CONFIRM socials rather than publishing placeholders", () => {
    stubOrigin();
    // Guard the premise: if the real handles land, this test must be
    // revisited rather than quietly passing for the wrong reason.
    expect(SITE.socials.instagram.startsWith("TODO-CONFIRM")).toBe(true);
    const result = localBusinessJsonLd();
    expect(result).not.toHaveProperty("sameAs");
  });

  it("omits telephone while SITE.phone is a placeholder", () => {
    stubOrigin();
    expect(SITE.phone.startsWith("TODO-CONFIRM")).toBe(true);
    const result = localBusinessJsonLd();
    // A placeholder number in structured data is machine-read as fact.
    // Absent beats wrong — telephone is optional.
    expect(result).not.toHaveProperty("telephone");
    expect(JSON.stringify(result)).not.toContain("TODO-CONFIRM");
  });

  it("emits no TODO-CONFIRM value anywhere in the record", () => {
    stubOrigin();
    expect(JSON.stringify(localBusinessJsonLd())).not.toContain("TODO-CONFIRM");
  });

  it("still publishes the contact email, which is real", () => {
    stubOrigin();
    expect(localBusinessJsonLd().email).toBe("info@buildalphakids.com.au");
  });
});

// ------------------------------------------------------------
// articleJsonLd
// ------------------------------------------------------------

describe("articleJsonLd", () => {
  it("carries the schema.org context and Article type", () => {
    stubOrigin();
    const result = articleJsonLd(post());
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Article");
    expect(result.headline).toBe("Why multi-sport works");
  });

  it("passes datePublished through as the stored instant", () => {
    stubOrigin();
    expect(articleJsonLd(post()).datePublished).toBe(
      "2026-07-01T23:00:00.000Z"
    );
  });

  it("names the author as a Person", () => {
    stubOrigin();
    expect(articleJsonLd(post()).author).toEqual({
      "@type": "Person",
      name: "Jayden Kowaider",
    });
  });

  it("includes image when the post has a cover", () => {
    stubOrigin();
    const result = articleJsonLd(
      post({ cover_image_url: "https://cdn.test/cover.jpg" })
    );
    expect(result.image).toBe("https://cdn.test/cover.jpg");
  });

  it("omits image entirely when there is no cover (the WP-import case)", () => {
    stubOrigin();
    const result = articleJsonLd(post({ cover_image_url: null }));
    expect(result).not.toHaveProperty("image");
  });

  it("omits description when the post has no excerpt", () => {
    stubOrigin();
    expect(articleJsonLd(post({ excerpt: null }))).not.toHaveProperty(
      "description"
    );
  });

  it("builds url and @id from the marketing origin and slug", () => {
    stubOrigin();
    const result = articleJsonLd(post({ slug: "why-multi-sport-works" }));
    expect(result.url).toBe(`${ORIGIN}/blog/why-multi-sport-works`);
    expect(result.mainEntityOfPage["@id"]).toBe(
      `${ORIGIN}/blog/why-multi-sport-works`
    );
    expect(result.url).not.toContain("app.test");
  });
});
