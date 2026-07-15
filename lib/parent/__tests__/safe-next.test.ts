import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parentSafeNext,
  resolveParentLoginTarget,
  buildParentMagicLinkRedirect,
} from "@/lib/parent/safe-next";

describe("parentSafeNext", () => {
  it("passes through parent sub-paths", () => {
    expect(parentSafeNext("/parent/book/abc")).toBe("/parent/book/abc");
  });

  it("passes through the bare /parent root", () => {
    expect(parentSafeNext("/parent")).toBe("/parent");
  });

  it("accepts a trailing slash (/parent/)", () => {
    expect(parentSafeNext("/parent/")).toBe("/parent/");
  });

  it("passes through a parent path with its query string intact", () => {
    expect(parentSafeNext("/parent/book/abc?x=1")).toBe("/parent/book/abc?x=1");
  });

  it("treats query content as opaque (dot-segments in query are fine)", () => {
    expect(parentSafeNext("/parent/book/abc?redirect=/../x")).toBe(
      "/parent/book/abc?redirect=/../x"
    );
  });

  it("returns null for undefined", () => {
    expect(parentSafeNext(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(parentSafeNext(null)).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(parentSafeNext("")).toBeNull();
  });

  it("returns null for /parent-login itself", () => {
    expect(parentSafeNext("/parent-login")).toBeNull();
  });

  it("rejects absolute external URLs", () => {
    expect(parentSafeNext("https://evil.com")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(parentSafeNext("//evil")).toBeNull();
  });

  it("rejects non-parent internal paths", () => {
    expect(parentSafeNext("/admin")).toBeNull();
  });

  it("rejects prefix look-alikes like /parents-hack", () => {
    expect(parentSafeNext("/parents-hack")).toBeNull();
  });

  it("rejects dot-segment escapes like /parent/../admin", () => {
    expect(parentSafeNext("/parent/../admin")).toBeNull();
  });

  it("rejects dot-segment escapes even with a query string", () => {
    expect(parentSafeNext("/parent/../x?ok=1")).toBeNull();
  });

  it("rejects percent-encoded dot-segments (/parent/%2e%2e/admin)", () => {
    expect(parentSafeNext("/parent/%2e%2e/admin")).toBeNull();
  });

  it("rejects uppercase percent-encoded dot-segments (/parent/%2E%2E/admin)", () => {
    expect(parentSafeNext("/parent/%2E%2E/admin")).toBeNull();
  });

  it("rejects single-dot segments (/parent/./x)", () => {
    expect(parentSafeNext("/parent/./x")).toBeNull();
  });

  it("rejects a trailing dot-dot segment (/parent/..)", () => {
    expect(parentSafeNext("/parent/..")).toBeNull();
  });

  it("rejects mixed literal/encoded dot-segments (/parent/.%2e/admin)", () => {
    expect(parentSafeNext("/parent/.%2e/admin")).toBeNull();
  });

  it("still allows dotted but non-dot-segment paths", () => {
    expect(parentSafeNext("/parent/book/v1.2")).toBe("/parent/book/v1.2");
  });
});

describe("resolveParentLoginTarget", () => {
  it("returns a validated next", () => {
    expect(resolveParentLoginTarget("/parent/book/abc?waitlist=e1")).toBe(
      "/parent/book/abc?waitlist=e1"
    );
  });

  it("falls back to /parent when next is missing", () => {
    expect(resolveParentLoginTarget(null)).toBe("/parent");
  });

  it("falls back to /parent when next is invalid", () => {
    expect(resolveParentLoginTarget("https://evil.com")).toBe("/parent");
    expect(resolveParentLoginTarget("/parent/../admin")).toBe("/parent");
    expect(resolveParentLoginTarget("/parent-login")).toBe("/parent");
  });
});

describe("buildParentMagicLinkRedirect", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://buildalphakids.app");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("routes a valid parent next through /auth/callback", () => {
    expect(buildParentMagicLinkRedirect("/parent/book/abc")).toBe(
      "https://buildalphakids.app/auth/callback?next=%2Fparent%2Fbook%2Fabc"
    );
  });

  it("round-trips a query-stringed next through the callback URL", () => {
    const url = buildParentMagicLinkRedirect("/parent/book/abc?waitlist=e1");
    expect(url).toBe(
      "https://buildalphakids.app/auth/callback?next=%2Fparent%2Fbook%2Fabc%3Fwaitlist%3De1"
    );
    // What the callback route will read back out via searchParams.get:
    expect(new URL(url).searchParams.get("next")).toBe(
      "/parent/book/abc?waitlist=e1"
    );
  });

  it("defaults to /parent-login when next is omitted", () => {
    expect(buildParentMagicLinkRedirect()).toBe(
      "https://buildalphakids.app/auth/callback?next=%2Fparent-login"
    );
  });

  it("sanitises hostile next values to /parent-login", () => {
    expect(buildParentMagicLinkRedirect("https://evil.com")).toBe(
      "https://buildalphakids.app/auth/callback?next=%2Fparent-login"
    );
  });
});
