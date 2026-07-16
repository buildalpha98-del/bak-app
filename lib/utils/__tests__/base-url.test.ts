import { describe, it, expect, afterEach, vi } from "vitest";
import {
  getBaseUrl,
  getMarketingUrl,
  getCanonicalSiteUrl,
  getAuthCallbackUrl,
  resolveAuthOrigin,
} from "@/lib/utils/base-url";

// The app domain every fallback is expected to land on.
const APP_ORIGIN = "https://buildalphakids.app";

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Production-shaped env: the app domain pinned via NEXT_PUBLIC_SITE_URL,
 * no VERCEL_URL. Individual tests stub over this as needed.
 */
function stubProdEnv() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", APP_ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
}

// ------------------------------------------------------------
// getMarketingUrl
// ------------------------------------------------------------

describe("getMarketingUrl", () => {
  it("uses NEXT_PUBLIC_MARKETING_URL when set — the cutover arms it", () => {
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au");
    expect(getMarketingUrl()).toBe("https://buildalphakids.com.au");
  });

  it("an explicit env value wins over the getBaseUrl() fallback", () => {
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://staging.example.com");
    expect(getMarketingUrl()).toBe("https://staging.example.com");
    expect(getMarketingUrl()).not.toBe(getBaseUrl());
  });

  it("falls back to getBaseUrl() when unset — NOT the .com.au literal", () => {
    // The deploy-before-cutover window: this code is live but .com.au is
    // still WordPress. A parent invite naming it goes nowhere, and
    // Supabase swaps a non-allowlisted emailRedirectTo for its own Site
    // URL without erroring, so the failure would be silent.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    expect(getMarketingUrl()).toBe(APP_ORIGIN);
    expect(getMarketingUrl()).toBe(getBaseUrl());
    expect(getMarketingUrl()).not.toBe("https://buildalphakids.com.au");
  });

  it("tracks getBaseUrl() through every one of its own fallbacks", () => {
    // The fallback delegates rather than duplicating — a preview deploy
    // resolves to itself, and local dev to localhost, with no extra env.
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    vi.stubEnv("VERCEL_URL", "bak-app-abc123.vercel.app");
    expect(getMarketingUrl()).toBe("https://bak-app-abc123.vercel.app");

    vi.stubEnv("VERCEL_URL", "");
    expect(getMarketingUrl()).toBe("http://localhost:3000");
  });

  it("strips trailing slashes so callers can concatenate paths", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au///");
    expect(getMarketingUrl()).toBe("https://buildalphakids.com.au");
  });
});

// ------------------------------------------------------------
// getCanonicalSiteUrl
// ------------------------------------------------------------

describe("getCanonicalSiteUrl", () => {
  it("defaults to the public .com.au domain even before the cutover", () => {
    // Diverges from getMarketingUrl() on purpose. A canonical is an
    // identity claim, not a route: it must name the one public origin
    // regardless of which host served the page or whether DNS has moved.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    expect(getCanonicalSiteUrl()).toBe("https://buildalphakids.com.au");
  });

  it("does NOT fall back to the app domain the way getMarketingUrl() does", () => {
    // The regression this guards: a .app fallback here would make every
    // .app page self-canonical and the sitemap advertise .app URLs, so
    // the two domains would compete as duplicate content.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    expect(getCanonicalSiteUrl()).not.toBe(APP_ORIGIN);
    expect(getCanonicalSiteUrl()).not.toBe(getBaseUrl());
    expect(getCanonicalSiteUrl()).not.toBe(getMarketingUrl());
  });

  it("uses NEXT_PUBLIC_MARKETING_URL when set, so previews self-canonicalise", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://staging.example.com");
    expect(getCanonicalSiteUrl()).toBe("https://staging.example.com");
  });

  it("agrees with getMarketingUrl() once the cutover env is set", () => {
    // Post-cutover the two helpers converge — the split only exists to
    // cover the window before NEXT_PUBLIC_MARKETING_URL is set.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au");
    expect(getCanonicalSiteUrl()).toBe(getMarketingUrl());
  });

  it("strips trailing slashes so callers can concatenate paths", () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au///");
    expect(getCanonicalSiteUrl()).toBe("https://buildalphakids.com.au");
  });
});

// ------------------------------------------------------------
// resolveAuthOrigin
// ------------------------------------------------------------

describe("resolveAuthOrigin", () => {
  it("resolves the bare public site host to its own origin", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("buildalphakids.com.au")).toBe(
      "https://buildalphakids.com.au"
    );
  });

  it("resolves the www public site host to its own origin", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("www.buildalphakids.com.au")).toBe(
      "https://www.buildalphakids.com.au"
    );
  });

  it("resolves the app host to the app origin", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("buildalphakids.app")).toBe(APP_ORIGIN);
  });

  it("resolves localhost:3000 over http for local dev", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("localhost:3000")).toBe("http://localhost:3000");
  });

  it("resolves the current VERCEL_URL host when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", APP_ORIGIN);
    vi.stubEnv("VERCEL_URL", "bak-app-abc123.vercel.app");
    expect(resolveAuthOrigin("bak-app-abc123.vercel.app")).toBe(
      "https://bak-app-abc123.vercel.app"
    );
  });

  it("falls back for a preview host once VERCEL_URL no longer matches", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("bak-app-abc123.vercel.app")).toBe(APP_ORIGIN);
  });

  it("is case-insensitive (Host headers may be mixed case)", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("BuildAlphaKids.COM.AU")).toBe(
      "https://buildalphakids.com.au"
    );
  });

  it("tolerates surrounding whitespace", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("  buildalphakids.com.au  ")).toBe(
      "https://buildalphakids.com.au"
    );
  });

  // --- security: the Host header is client-controlled ---

  it("falls back for an outright hostile host", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("evil.com")).toBe(APP_ORIGIN);
  });

  it("falls back for a SUFFIX look-alike (match must be exact, not endsWith)", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("buildalphakids.com.au.evil.com")).toBe(
      APP_ORIGIN
    );
  });

  it("falls back for a PREFIX look-alike (match must be exact, not startsWith)", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("evil-buildalphakids.com.au")).toBe(APP_ORIGIN);
  });

  it("falls back for a substring look-alike (match must be exact, not includes)", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("evil.com/buildalphakids.com.au")).toBe(
      APP_ORIGIN
    );
  });

  it("falls back for an allowlisted host on an unexpected port", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("buildalphakids.com.au:8080")).toBe(APP_ORIGIN);
  });

  it("falls back for a comma-joined x-forwarded-host chain", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("buildalphakids.com.au,evil.com")).toBe(
      APP_ORIGIN
    );
  });

  it("falls back for a null host", () => {
    stubProdEnv();
    expect(resolveAuthOrigin(null)).toBe(APP_ORIGIN);
  });

  it("falls back for an undefined host", () => {
    stubProdEnv();
    expect(resolveAuthOrigin(undefined)).toBe(APP_ORIGIN);
  });

  it("falls back for an empty host", () => {
    stubProdEnv();
    expect(resolveAuthOrigin("")).toBe(APP_ORIGIN);
  });

  it("never returns an origin outside the allowlist", () => {
    stubProdEnv();
    const allowed = [
      "https://buildalphakids.com.au",
      "https://www.buildalphakids.com.au",
      APP_ORIGIN,
      "http://localhost:3000",
    ];
    const hostile = [
      "evil.com",
      "buildalphakids.com.au.evil.com",
      "buildalphakids.app.evil.com",
      "xn--buildalphakids-evil.com",
      "buildalphakids.com.au.",
      "user@evil.com",
      "[::1]",
    ];
    for (const host of hostile) {
      expect(allowed).toContain(resolveAuthOrigin(host));
      expect(resolveAuthOrigin(host)).toBe(APP_ORIGIN);
    }
  });
});

// ------------------------------------------------------------
// getAuthCallbackUrl — origin override
// ------------------------------------------------------------

describe("getAuthCallbackUrl", () => {
  it("defaults to the app domain when no origin is passed (staff flows)", () => {
    stubProdEnv();
    expect(getAuthCallbackUrl("/update-password")).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fupdate-password`
    );
  });

  it("uses an explicit origin when given one (parent flows)", () => {
    stubProdEnv();
    expect(
      getAuthCallbackUrl("/parent-login", "https://buildalphakids.com.au")
    ).toBe("https://buildalphakids.com.au/auth/callback?next=%2Fparent-login");
  });

  // The two tests below pin the exact call importParents() makes
  // (lib/parent/actions.ts) and that invitation-actions.ts mirrors: the
  // emailRedirectTo of a real parent magic link. They are the reason
  // getMarketingUrl() falls back rather than hard-defaulting.

  it("accepts getMarketingUrl() as the origin, resolving to the app domain pre-cutover", () => {
    // Env unset = merged and deployed, DNS not yet moved. The link must
    // name a host that serves this app TODAY, which is .app — .com.au is
    // still WordPress, and Supabase would silently swap a
    // non-allowlisted redirect for its own Site URL rather than error.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "");
    expect(getAuthCallbackUrl("/parent-login", getMarketingUrl())).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fparent-login`
    );
  });

  it("follows getMarketingUrl() onto the public site once the cutover env is set", () => {
    // Step 7 of the runbook. One env flip moves every parent link.
    stubProdEnv();
    vi.stubEnv("NEXT_PUBLIC_MARKETING_URL", "https://buildalphakids.com.au");
    expect(getAuthCallbackUrl("/parent-login", getMarketingUrl())).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
  });
});
