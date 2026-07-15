import { describe, it, expect } from "vitest";
import { isPublicRoute } from "../public-routes";

describe("isPublicRoute", () => {
  it.each([
    "/", "/programs", "/programs/childcare", "/holiday-clinics",
    "/about", "/blog", "/blog/some-post", "/enquire", "/contact",
    "/login", "/parent-login", "/refer/abc",
  ])("allows %s", (p) => expect(isPublicRoute(p)).toBe(true));

  it.each([
    "/admin", "/parent", "/parent/book", "/ops", "/coach",
    "/client/some-centre", "/programsfoo", // prefix must not bleed
  ])("gates %s", (p) => expect(isPublicRoute(p)).toBe(false));
});
