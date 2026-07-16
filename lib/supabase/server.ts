import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// ============================================================
// Request-scoped Supabase server client
// ============================================================
//
// `cache()` is React's per-request memo: every caller within one render
// — the page, each server action it awaits, the status pulses — now
// shares ONE client instead of building its own.
//
// That matters because of `auth.getUser()`. It is not a local JWT
// verify; it is an HTTP round-trip to the auth server, every time.
// Rendering /admin/tasks made six of them: middleware, the page, and one
// per action. The codebase has ~350 such call sites across ~90 files,
// all following the same "make client, getUser, then query" shape, and
// each was paying that latency in full and in series.
//
// So rather than edit 90 files, memoise getUser on the shared instance.
// The first caller in a request pays for it and the rest await the same
// promise, so every existing `supabase.auth.getUser()` keeps working
// untouched and is deduped for free.
//
// Scope is one request: a fresh render or a server-action POST builds a
// new client and re-checks auth. Nothing is cached across users or
// requests.

export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — can't set cookies
          }
        },
      },
    }
  );

  type GetUser = typeof client.auth.getUser;
  const originalGetUser = client.auth.getUser.bind(client.auth) as GetUser;
  let inFlight: ReturnType<GetUser> | null = null;

  client.auth.getUser = ((jwt?: string) => {
    // An explicit token means "validate THIS one" — never serve the memo.
    if (jwt !== undefined) return originalGetUser(jwt);
    // Memoise the promise rather than the result, so the four actions a
    // page awaits in Promise.all share one round-trip instead of racing
    // four of their own.
    inFlight ??= originalGetUser();
    return inFlight;
  }) as GetUser;

  // Anything that changes the session makes the memo a lie, and the
  // request may well read the user straight afterwards — signIn() does
  // exactly that: signInWithPassword(), then getUser() to pick the
  // redirect. Without this, a getUser() earlier in the same request
  // (returning null, because nobody was signed in yet) would be replayed
  // to the caller and sign-in would fail.
  // Clears the memo around a call. The cast preserves the method's own
  // (overloaded) signature — the wrapper is transparent, it only drops
  // the cached read either side.
  function invalidating<T extends (...args: never[]) => Promise<unknown>>(
    fn: T
  ): T {
    return (async (...args: Parameters<T>) => {
      // Before: a read already in flight is about to be wrong.
      inFlight = null;
      try {
        return await fn(...(args as never[]));
      } finally {
        // After: the next read must see the new session.
        inFlight = null;
      }
    }) as T;
  }

  const a = client.auth;
  a.signInWithPassword = invalidating(a.signInWithPassword.bind(a));
  a.signInWithOtp = invalidating(a.signInWithOtp.bind(a));
  a.signUp = invalidating(a.signUp.bind(a));
  a.signOut = invalidating(a.signOut.bind(a));
  a.verifyOtp = invalidating(a.verifyOtp.bind(a));
  a.exchangeCodeForSession = invalidating(a.exchangeCodeForSession.bind(a));
  a.setSession = invalidating(a.setSession.bind(a));
  a.refreshSession = invalidating(a.refreshSession.bind(a));

  return client;
});
