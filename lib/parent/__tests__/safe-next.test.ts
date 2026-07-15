import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parentSafeNext,
  buildParentMagicLinkRedirect,
} from "@/lib/parent/safe-next";

describe("parentSafeNext", () => {
  it("passes through parent sub-paths", () => {
    expect(parentSafeNext("/parent/book/abc")).toBe("/parent/book/abc");
  });

  it("passes through the bare /parent root", () => {
    expect(parentSafeNext("/parent")).toBe("/parent");
  });

  it("falls back to /parent-login for undefined", () => {
    expect(parentSafeNext(undefined)).toBe("/parent-login");
  });

  it("falls back to /parent-login for null", () => {
    expect(parentSafeNext(null)).toBe("/parent-login");
  });

  it("rejects absolute external URLs", () => {
    expect(parentSafeNext("https://evil.com")).toBe("/parent-login");
  });

  it("rejects protocol-relative URLs", () => {
    expect(parentSafeNext("//evil")).toBe("/parent-login");
  });

  it("rejects non-parent internal paths", () => {
    expect(parentSafeNext("/admin")).toBe("/parent-login");
  });

  it("rejects prefix look-alikes like /parents-hack", () => {
    expect(parentSafeNext("/parents-hack")).toBe("/parent-login");
  });

  it("rejects the empty string", () => {
    expect(parentSafeNext("")).toBe("/parent-login");
  });

  it("rejects dot-segment escapes like /parent/../admin", () => {
    expect(parentSafeNext("/parent/../admin")).toBe("/parent-login");
  });

  it("rejects percent-encoded dot-segments (/parent/%2e%2e/admin)", () => {
    expect(parentSafeNext("/parent/%2e%2e/admin")).toBe("/parent-login");
  });

  it("rejects uppercase percent-encoded dot-segments (/parent/%2E%2E/admin)", () => {
    expect(parentSafeNext("/parent/%2E%2E/admin")).toBe("/parent-login");
  });

  it("rejects single-dot segments (/parent/./x)", () => {
    expect(parentSafeNext("/parent/./x")).toBe("/parent-login");
  });

  it("rejects a trailing dot-dot segment (/parent/..)", () => {
    expect(parentSafeNext("/parent/..")).toBe("/parent-login");
  });

  it("rejects mixed literal/encoded dot-segments (/parent/.%2e/admin)", () => {
    expect(parentSafeNext("/parent/.%2e/admin")).toBe("/parent-login");
  });

  it("still allows dotted but non-dot-segment paths", () => {
    expect(parentSafeNext("/parent/book/v1.2")).toBe("/parent/book/v1.2");
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
