import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// The request-scoped client's getUser memo
// ============================================================
//
// The memo is what turns ~6 auth round-trips per page render into 1.
// The invalidation is what stops that becoming a login bug: signIn()
// calls signInWithPassword() and then getUser() to choose the redirect,
// so a memo held across the sign-in would replay the pre-login answer.

const { getUserSpy, signInSpy, signOutSpy, createServerClientMock } = vi.hoisted(
  () => {
    const getUserSpy = vi.fn(async () => ({
      data: { user: { id: "u1" } },
      error: null,
    }));
    const signInSpy = vi.fn(async () => ({ data: {}, error: null }));
    const signOutSpy = vi.fn(async () => ({ error: null }));
    return {
      getUserSpy,
      signInSpy,
      signOutSpy,
      createServerClientMock: vi.fn(() => ({
        auth: {
          getUser: getUserSpy,
          signInWithPassword: signInSpy,
          signInWithOtp: vi.fn(),
          signUp: vi.fn(),
          signOut: signOutSpy,
          verifyOtp: vi.fn(),
          exchangeCodeForSession: vi.fn(),
          setSession: vi.fn(),
          refreshSession: vi.fn(),
        },
      })),
    };
  }
);

// tests/setup.ts mocks @/lib/supabase/server globally for every other
// suite. This is the one file that needs the real thing.
vi.unmock("@/lib/supabase/server");

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
// React's cache() is a no-op outside a request scope; the memo under
// test lives inside the factory, so per-call construction is what we
// want here — each createSupabaseServerClient() stands for one request.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import { createSupabaseServerClient } from "../server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUser memo", () => {
  it("makes one auth round-trip for repeated reads in a request", async () => {
    const supabase = await createSupabaseServerClient();

    await supabase.auth.getUser();
    await supabase.auth.getUser();
    await supabase.auth.getUser();

    expect(getUserSpy).toHaveBeenCalledTimes(1);
  });

  it("shares one round-trip between concurrent callers", async () => {
    const supabase = await createSupabaseServerClient();

    // The shape of a page: four actions awaited together, each calling
    // getUser. They must not race four separate requests.
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUser(),
      supabase.auth.getUser(),
      supabase.auth.getUser(),
    ]);

    expect(getUserSpy).toHaveBeenCalledTimes(1);
  });

  it("returns the same user to every caller", async () => {
    const supabase = await createSupabaseServerClient();
    const a = await supabase.auth.getUser();
    const b = await supabase.auth.getUser();
    expect(a.data.user).toEqual({ id: "u1" });
    expect(b.data.user).toEqual({ id: "u1" });
  });

  it("does not memoise an explicit-token check", async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.getUser("jwt-a");
    await supabase.auth.getUser("jwt-b");
    expect(getUserSpy).toHaveBeenCalledTimes(2);
    expect(getUserSpy).toHaveBeenNthCalledWith(1, "jwt-a");
  });

  it("keeps requests isolated from each other", async () => {
    const first = await createSupabaseServerClient();
    await first.auth.getUser();
    const second = await createSupabaseServerClient();
    await second.auth.getUser();
    // One per request, never shared across them.
    expect(getUserSpy).toHaveBeenCalledTimes(2);
  });
});

describe("memo invalidation on session change", () => {
  // The exact order in lib/auth/actions.ts signIn().
  it("re-reads the user after signInWithPassword", async () => {
    const supabase = await createSupabaseServerClient();

    await supabase.auth.getUser(); // pre-login read (would be the stale answer)
    await supabase.auth.signInWithPassword({
      email: "a@b.c",
      password: "x",
    });
    await supabase.auth.getUser(); // must NOT be served from the memo

    expect(getUserSpy).toHaveBeenCalledTimes(2);
    expect(signInSpy).toHaveBeenCalledTimes(1);
  });

  it("re-reads the user after signOut", async () => {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.getUser();
    await supabase.auth.signOut();
    await supabase.auth.getUser();
    expect(getUserSpy).toHaveBeenCalledTimes(2);
  });

  it("still invalidates when the mutation throws", async () => {
    const supabase = await createSupabaseServerClient();
    signInSpy.mockRejectedValueOnce(new Error("nope"));

    await supabase.auth.getUser();
    await expect(
      supabase.auth.signInWithPassword({ email: "a@b.c", password: "x" })
    ).rejects.toThrow("nope");
    await supabase.auth.getUser();

    // A failed sign-in must not leave a stale memo behind either.
    expect(getUserSpy).toHaveBeenCalledTimes(2);
  });
});
