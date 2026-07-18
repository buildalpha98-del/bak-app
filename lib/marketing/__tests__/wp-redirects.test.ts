import { describe, it, expect } from "vitest";
import { WP_REDIRECTS } from "../wp-redirects";
import { isPortalPath } from "../sitemap-routes";

describe("WP_REDIRECTS", () => {
  it("is non-empty and every entry is a permanent 308", () => {
    expect(WP_REDIRECTS.length).toBeGreaterThan(0);
    for (const r of WP_REDIRECTS) {
      expect(r.permanent).toBe(true);
    }
  });

  // The loop guard. A rule whose source equals its destination makes
  // the new site redirect to itself forever — the whole page is lost,
  // not just its ranking.
  it("never redirects a path to itself", () => {
    for (const r of WP_REDIRECTS) {
      expect(r.source).not.toBe(r.destination);
    }
  });

  // Subtler loop: a wildcard source such as /blog/:path* whose
  // destination (/blog/x) still matches that same source pattern would
  // re-enter the rule on the next request.
  it("no wildcard source matches its own destination", () => {
    for (const r of WP_REDIRECTS) {
      if (!r.source.includes(":")) continue;
      const pattern = new RegExp(
        "^" + r.source.replace(/\/:[A-Za-z]+\*/g, "(?:/.*)?").replace(/\/:[A-Za-z]+/g, "/[^/]+") + "$"
      );
      expect(pattern.test(r.destination)).toBe(false);
    }
  });

  it("has no duplicate sources", () => {
    const sources = WP_REDIRECTS.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("uses absolute, non-trailing-slash paths on both sides", () => {
    for (const r of WP_REDIRECTS) {
      expect(r.source.startsWith("/")).toBe(true);
      expect(r.destination.startsWith("/")).toBe(true);
      expect(r.source).not.toMatch(/.\/$/);
      expect(r.destination).not.toMatch(/.\/$/);
    }
  });

  // A redirect INTO a portal route would hand a crawler an auth wall.
  it("never sends an old public URL into a portal route", () => {
    for (const r of WP_REDIRECTS) {
      expect(isPortalPath(r.destination)).toBe(false);
    }
  });

  // No source may shadow an earlier rule: Next matches top-to-bottom,
  // so a wildcard listed above a literal would swallow it.
  it("no earlier wildcard rule shadows a later source", () => {
    WP_REDIRECTS.forEach((later, i) => {
      const earlier = WP_REDIRECTS.slice(0, i).filter((r) => r.source.includes(":"));
      for (const e of earlier) {
        const pattern = new RegExp(
          "^" + e.source.replace(/\/:[A-Za-z]+\*/g, "(?:/.*)?").replace(/\/:[A-Za-z]+/g, "/[^/]+") + "$"
        );
        expect(pattern.test(later.source)).toBe(false);
      }
    });
  });

  it.each([
    // Blog posts moved from the WP root to /blog/<same slug>.
    ["/the-importance-of-fun-activities-for-schools", "/blog/the-importance-of-fun-activities-for-schools"],
    ["/build-alpha-kids-approach", "/blog/build-alpha-kids-approach"],
    // The "-2" suffix is load-bearing: it is the slug WordPress serves
    // and Google indexed. Tidying it to the bare slug would 404.
    [
      "/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
      "/blog/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
    ],
    // Pages.
    ["/about-us", "/about"],
    ["/contact-us", "/contact"],
    ["/blogs", "/blog"],
    ["/our-services", "/programs"],
    ["/our-services/childcare", "/programs/childcare"],
    ["/our-services/primary-school", "/programs/primary-school"],
    ["/our-services/high-school", "/programs/high-school"],
    ["/our-services/after-school-clinic", "/programs/after-school"],
    // Covers primary AND secondary, so it maps to the hub, not either leaf.
    ["/our-services/school-1", "/schools"],
    ["/sample-page", "/"],
    ["/coming-soon", "/"],
    // The lorem-ipsum CPT entry routes to the real post of the same title.
    [
      "/blogs/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs",
      "/blog/key-skills-for-kids-what-they-learn-in-build-alpha-kids-programs-2",
    ],
  ])("maps %s → %s", (source, destination) => {
    const rule = WP_REDIRECTS.find((r) => r.source === source);
    expect(rule, `no rule for ${source}`).toBeDefined();
    expect(rule!.destination).toBe(destination);
  });

  it("maps all 11 live WordPress posts", () => {
    const postRules = WP_REDIRECTS.filter((r) => r.destination.startsWith("/blog/"));
    // 11 root-level posts + 2 blogs-CPT entries.
    expect(postRules).toHaveLength(13);
  });

  // Legal pages. Task 6.2 deliberately left these UNMAPPED — the new site
  // had no privacy or terms page, and a 301 to "/" would have been a soft
  // 404. Task 3.3 built the real pages, so the reason for the gap is gone
  // and the assertion inverts: they must now be mapped, and mapped to the
  // real page rather than back to "/".
  it.each([
    ["/privacy-policy", "/privacy"],
    ["/terms-of-use", "/terms"],
  ])("maps %s to its real page at %s", (source, destination) => {
    const rule = WP_REDIRECTS.find((r) => r.source === source);
    expect(rule).toBeDefined();
    expect(rule?.destination).toBe(destination);
    expect(rule?.permanent).toBe(true);
  });

  // A blanket catch-all would match portal routes and silently turn
  // every 404 into a homepage redirect.
  it("has no blanket catch-all source", () => {
    for (const r of WP_REDIRECTS) {
      expect(r.source).not.toBe("/:path*");
    }
  });
});
