import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted so these exist before the hoisted vi.mock factories run.
const { signInWithOtpMock, headersMock } = vi.hoisted(() => ({
  signInWithOtpMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ auth: { signInWithOtp: signInWithOtpMock } }),
}));
vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import { sendParentMagicLink } from "@/lib/parent/actions";

const APP_ORIGIN = "https://buildalphakids.app";

/**
 * Input-based routing on the header name — never mockResolvedValueOnce
 * chains, which leak ordering assumptions between tests. An unmocked
 * header returns null, exactly as a real Headers would.
 */
function stubHost(headerValues: Record<string, string | null>) {
  headersMock.mockImplementation(() =>
    Promise.resolve({
      get: (name: string) => headerValues[name.toLowerCase()] ?? null,
    })
  );
}

/** The emailRedirectTo the action handed to Supabase. */
function capturedRedirect(): string {
  expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
  return signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo;
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithOtpMock.mockResolvedValue({ error: null });
  // Production shape: app domain pinned, no preview URL.
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", APP_ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendParentMagicLink — host-aware callback", () => {
  it("sends a parent on the public site back to the PUBLIC site", async () => {
    // The bug this guards: a .com.au parent getting a .app link would
    // have their session cookie set on the wrong TLD and appear
    // logged-out when they returned to the site.
    stubHost({ "x-forwarded-host": "buildalphakids.com.au" });

    await sendParentMagicLink("parent@example.com", "/parent/book/abc");

    expect(capturedRedirect()).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent%2Fbook%2Fabc"
    );
  });

  it("keeps a parent on the www public site host", async () => {
    stubHost({ "x-forwarded-host": "www.buildalphakids.com.au" });

    await sendParentMagicLink("parent@example.com");

    expect(capturedRedirect()).toBe(
      "https://www.buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
  });

  it("sends a parent on the app domain back to the app", async () => {
    stubHost({ "x-forwarded-host": "buildalphakids.app" });

    await sendParentMagicLink("parent@example.com", "/parent");

    expect(capturedRedirect()).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fparent`
    );
  });

  it("prefers x-forwarded-host over host (Vercel sets both)", async () => {
    stubHost({
      "x-forwarded-host": "buildalphakids.com.au",
      host: "buildalphakids.app",
    });

    await sendParentMagicLink("parent@example.com");

    expect(capturedRedirect()).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
  });

  it("falls back to host when x-forwarded-host is absent", async () => {
    stubHost({ host: "buildalphakids.com.au" });

    await sendParentMagicLink("parent@example.com");

    expect(capturedRedirect()).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
  });

  it("falls back to the app domain for a spoofed host (no open redirect)", async () => {
    stubHost({ "x-forwarded-host": "evil.com" });

    await sendParentMagicLink("parent@example.com", "/parent");

    expect(capturedRedirect()).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fparent`
    );
  });

  it("falls back to the app domain for a look-alike host", async () => {
    stubHost({ "x-forwarded-host": "buildalphakids.com.au.evil.com" });

    await sendParentMagicLink("parent@example.com");

    expect(capturedRedirect()).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fparent-login`
    );
  });

  it("falls back to the app domain when no host header is present", async () => {
    stubHost({});

    await sendParentMagicLink("parent@example.com");

    expect(capturedRedirect()).toBe(
      `${APP_ORIGIN}/auth/callback?next=%2Fparent-login`
    );
  });

  it("still sanitises a hostile next on an allowlisted host", async () => {
    stubHost({ "x-forwarded-host": "buildalphakids.com.au" });

    await sendParentMagicLink("parent@example.com", "https://evil.com");

    expect(capturedRedirect()).toBe(
      "https://buildalphakids.com.au/auth/callback?next=%2Fparent-login"
    );
  });

  it("surfaces a Supabase error unchanged", async () => {
    stubHost({ "x-forwarded-host": "buildalphakids.com.au" });
    signInWithOtpMock.mockResolvedValue({ error: { message: "rate limited" } });

    const result = await sendParentMagicLink("parent@example.com");

    expect(result).toEqual({ error: "rate limited" });
  });
});
