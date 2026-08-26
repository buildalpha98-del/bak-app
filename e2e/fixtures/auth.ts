import type { Page } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

// ============================================================
// E2E auth — sign in without ever typing a password
// ============================================================
//
// Mints a REAL session for an existing user via the Supabase admin
// API, then writes it into the browser exactly the way @supabase/ssr
// writes it server-side (base64url value, same chunking, same cookie
// name). Everything downstream of auth — middleware, RLS, queries,
// rendering — is therefore exercised for real.
//
// Why not drive the login form? Magic links redirect through Supabase,
// which rewrites redirect_to to the Site URL unless localhost is on the
// project's redirect allowlist. Injecting the session keeps the suite
// self-contained and runnable in CI.
//
// SCOPE: this covers everything AFTER sign-in. The magic-link callback
// itself (/auth/callback) is not exercised — add localhost:3000/** to
// the Supabase redirect allowlist if you want that covered too.
//
// generateLink() only RETURNS a link; it sends no email, so running
// these never spams a real coach.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `E2E needs ${name}. Run: vercel env pull .env.production.local --environment=production`
    );
  }
  return v;
}

export function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

/** First active profile with the given role — no hardcoded emails. */
export async function findUserEmail(
  role: "admin" | "ops" | "coach"
): Promise<string | null> {
  const { data } = await adminClient()
    .from("profiles")
    .select("email")
    .eq("role", role)
    .eq("status", "active")
    .not("email", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data?.email as string) ?? null;
}

/**
 * First active staff member who is DENIED financial access — the shape
 * of Abdul's account (role=admin, financial_access=false). Looked up at
 * runtime rather than hardcoded, so the suite survives someone's flag
 * being flipped or the account being renamed.
 */
export async function findUserWithoutFinancialAccess(): Promise<string | null> {
  const { data } = await adminClient()
    .from("profiles")
    .select("email")
    .in("role", ["admin", "ops"])
    .eq("status", "active")
    .eq("financial_access", false)
    .not("email", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data?.email as string) ?? null;
}

/** A client-portal director plus the centre they belong to. */
export async function findClientUser(): Promise<{
  email: string;
  centreId: string;
} | null> {
  const admin = adminClient();
  const { data: rows } = await admin
    .from("client_users")
    .select("user_id, centre_id")
    .limit(5);
  for (const row of rows ?? []) {
    const { data } = await admin.auth.admin.getUserById(row.user_id as string);
    if (data?.user?.email) {
      return { email: data.user.email, centreId: row.centre_id as string };
    }
  }
  return null;
}

/**
 * Mint a real session for an existing user (generateLink sends no
 * email). Returned as-is for specs that need the access token to make
 * direct role-scoped Supabase calls; signInAs wraps it into cookies.
 */
export async function mintSession(email: string): Promise<Session> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");

  const { data: link, error: linkErr } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(
      `Could not mint a link for ${email}: ${linkErr?.message ?? "no hashed_token"}`
    );
  }

  const anon = createClient(url, requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyErr || !verified?.session) {
    throw new Error(
      `Could not verify the OTP for ${email}: ${verifyErr?.message ?? "no session"}`
    );
  }
  return verified.session;
}

export async function signInAs(
  page: Page,
  email: string,
  baseURL: string
): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const session = await mintSession(email);

  // Mirror @supabase/ssr's storage format exactly (see cookies.ts:
  // BASE64_PREFIX + stringToBase64URL, then createChunks).
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const encoded = "base64-" + stringToBase64URL(JSON.stringify(session));
  const chunks = createChunks(storageKey, encoded);
  const { hostname, protocol } = new URL(baseURL);

  await page.context().addCookies(
    chunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      domain: hostname,
      path: "/",
      httpOnly: false,
      secure: protocol === "https:",
      sameSite: "Lax" as const,
    }))
  );
}
