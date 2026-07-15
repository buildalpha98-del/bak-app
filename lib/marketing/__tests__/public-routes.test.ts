import { describe, it, expect } from "vitest";
import { isPublicRoute } from "../public-routes";

describe("isPublicRoute", () => {
  it.each([
    "/", "/programs", "/programs/childcare", "/holiday-clinics",
    "/about", "/blog", "/blog/some-post", "/enquire", "/contact",
    "/login", "/parent-login", "/refer/abc",
    // Crawler endpoints: gating these hides the sitemap from Google.
    "/sitemap.xml", "/robots.txt",
  ])("allows %s", (p) => expect(isPublicRoute(p)).toBe(true));

  it.each([
    "/admin", "/parent", "/parent/book", "/ops", "/coach",
    "/client/some-centre", "/programsfoo", // prefix must not bleed
    "//admin", "/admin/", // "/" must not act as a wildcard prefix
  ])("gates %s", (p) => expect(isPublicRoute(p)).toBe(false));
});
