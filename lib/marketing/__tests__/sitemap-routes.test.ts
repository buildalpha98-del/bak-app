import { describe, it, expect } from "vitest";
import {
  STATIC_MARKETING_ROUTES,
  buildSitemapEntries,
  isPortalPath,
  toAbsoluteUrl,
} from "../sitemap-routes";

const ORIGIN = "https://buildalphakids.com.au";
const NOW = new Date("2026-07-15T00:00:00.000Z");

describe("isPortalPath", () => {
  it.each([
    "/admin",
    "/admin/bookings",
    "/ops",
    "/ops/roster",
    "/coach/schedule",
    "/parent",
    "/parent/book",
    "/parent-login",
    "/client/abc",
    "/client-login",
    "/login",
    "/api/enquiry",
    "/auth/callback",
  ])("gates %s", (p) => expect(isPortalPath(p)).toBe(true));

  it.each(["/", "/about", "/blog", "/blog/a-post", "/programs", "/programs/childcare"])(
    "allows %s",
    (p) => expect(isPortalPath(p)).toBe(false)
  );

  it("does not let a prefix bleed into a longer segment", () => {
    // "/apiary" must not be gated by the "/api" prefix.
    expect(isPortalPath("/apiary")).toBe(false);
    expect(isPortalPath("/administrators-guide")).toBe(false);
  });
});

describe("toAbsoluteUrl", () => {
  it("emits the bare origin for the homepage, with no trailing slash", () => {
    // Must agree with the canonical tag from Task 6.1, or the homepage
    // is indexed under two spellings.
    expect(toAbsoluteUrl(ORIGIN, "/")).toBe("https://buildalphakids.com.au");
  });

  it("joins a path to the origin", () => {
    expect(toAbsoluteUrl(ORIGIN, "/about")).toBe("https://buildalphakids.com.au/about");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(toAbsoluteUrl("https://buildalphakids.com.au/", "/about")).toBe(
      "https://buildalphakids.com.au/about"
    );
  });
});

describe("STATIC_MARKETING_ROUTES", () => {
  it("contains no portal route", () => {
    for (const route of STATIC_MARKETING_ROUTES) {
      expect(isPortalPath(route.path), `${route.path} is a portal path`).toBe(false);
    }
  });

  it("covers every public marketing page", () => {
    const paths = STATIC_MARKETING_ROUTES.map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/about",
        "/contact",
        "/enquire",
        "/programs",
        "/programs/childcare",
        "/programs/primary-school",
        "/programs/high-school",
        "/programs/after-school",
        "/programs/holiday-programs",
        "/holiday-clinics",
        "/blog",
      ])
    );
  });

  it("has no duplicate paths and sane priorities", () => {
    const paths = STATIC_MARKETING_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const r of STATIC_MARKETING_ROUTES) {
      expect(r.priority).toBeGreaterThan(0);
      expect(r.priority).toBeLessThanOrEqual(1);
    }
  });
});

describe("buildSitemapEntries", () => {
  const posts = [
    { slug: "build-alpha-kids-approach", published_at: "2024-06-01T10:00:00.000Z" },
    {
      slug: "key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
      published_at: "2024-07-17T03:40:28.000Z",
    },
  ];

  it("emits absolute URLs on the marketing origin only", () => {
    for (const entry of buildSitemapEntries(ORIGIN, posts, NOW)) {
      expect(entry.url.startsWith("https://buildalphakids.com.au")).toBe(true);
      // The app domain must never appear: it would compete with the
      // canonical .com.au URLs as duplicate content.
      expect(entry.url).not.toContain("buildalphakids.app");
    }
  });

  it("excludes every portal path", () => {
    const urls = buildSitemapEntries(ORIGIN, posts, NOW).map((e) => e.url);
    for (const prefix of ["/admin", "/ops", "/coach", "/parent", "/client", "/login", "/api"]) {
      expect(urls.some((u) => u.startsWith(ORIGIN + prefix))).toBe(false);
    }
  });

  it("includes published blog posts under /blog/<slug>", () => {
    const urls = buildSitemapEntries(ORIGIN, posts, NOW).map((e) => e.url);
    expect(urls).toContain(`${ORIGIN}/blog/build-alpha-kids-approach`);
    expect(urls).toContain(
      `${ORIGIN}/blog/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2`
    );
  });

  it("dates a post from its published_at", () => {
    const entry = buildSitemapEntries(ORIGIN, posts, NOW).find((e) =>
      e.url.endsWith("/blog/build-alpha-kids-approach")
    );
    expect(entry!.lastModified).toEqual(new Date("2024-06-01T10:00:00.000Z"));
  });

  it("falls back to now for a null published_at rather than an invalid date", () => {
    const entry = buildSitemapEntries(ORIGIN, [{ slug: "x", published_at: null }], NOW).find(
      (e) => e.url.endsWith("/blog/x")
    );
    expect(entry!.lastModified).toEqual(NOW);
    expect(Number.isNaN(entry!.lastModified.getTime())).toBe(false);
  });

  // The blog table is unapplied at build time, so getPublishedPosts()
  // yields [] via safeFetch. The static routes must still all render.
  it("still emits every static route when there are no posts", () => {
    const entries = buildSitemapEntries(ORIGIN, [], NOW);
    expect(entries).toHaveLength(STATIC_MARKETING_ROUTES.length);
    expect(entries.some((e) => e.url.includes("/blog/"))).toBe(false);
    expect(entries.map((e) => e.url)).toContain(`${ORIGIN}/blog`);
  });

  it("emits no duplicate URLs", () => {
    const urls = buildSitemapEntries(ORIGIN, posts, NOW).map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
