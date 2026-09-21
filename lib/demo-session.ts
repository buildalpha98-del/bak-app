import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// ============================================================
// Shareable demo sign-in — the mechanism behind /demo/school and
// /demo/teacher
// ============================================================
//
// Magic links are single-use and expire within the hour, so a link
// pasted into a proposal or a teacher's email is dead before they click
// it. These routes mint a FRESH session per visit for one fixed demo
// account and drop the visitor straight into the demo school's portal —
// the same URL works for everyone, forever.
//
// Containment, in order:
//   * The account is hardcoded by the route — no parameter chooses who
//     to sign in as.
//   * It must be a NON-primary client user (no colleague management, no
//     shared-link minting, no settings powers), and its centre name must
//     contain "(Demo)". A teacher account must also carry the teacher
//     role with at least one class. If any check fails — e.g. someone
//     promotes the account or points it at a real school — the route
//     refuses and falls back to the normal login page.
//   * Worst case is a stranger browsing fictional students at a
//     fictional school and messaging our ops inbox — which, for a
//     prospect, is the point.

export async function signInDemoAccount(
  request: NextRequest,
  opts: { email: string; role: "viewer" | "teacher"; label: string }
): Promise<NextResponse> {
  const fallback = NextResponse.redirect(new URL("/client-login", request.url));
  try {
    const admin = createSupabaseAdmin();

    const { data: cu } = await admin
      .from("client_users")
      .select("centre_id, is_primary, role, class_ids")
      .eq("email", opts.email)
      .maybeSingle();
    if (!cu || cu.is_primary) {
      console.error(`${opts.label}: account missing or primary — refusing`);
      return fallback;
    }
    if (opts.role === "teacher" && (cu.role !== "teacher" || !(cu.class_ids ?? []).length)) {
      console.error(`${opts.label}: account is not a class-scoped teacher — refusing`);
      return fallback;
    }
    const { data: centre } = await admin
      .from("centres")
      .select("name")
      .eq("id", cu.centre_id)
      .maybeSingle();
    if (!centre?.name?.includes("(Demo)")) {
      console.error(`${opts.label}: centre is not a demo centre — refusing`);
      return fallback;
    }

    // Mint a session: admin-generated link → verify the OTP server-side.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: opts.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) return fallback;

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (verifyErr || !verified?.session) return fallback;

    // Write the auth cookies through @supabase/ssr itself so the
    // format always matches what the middleware and server read.
    const response = NextResponse.redirect(new URL(`/client/${cu.centre_id}`, request.url));
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
        },
      }
    );
    await supabase.auth.setSession({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    });
    return response;
  } catch (err) {
    console.error(`${opts.label} error:`, err);
    return fallback;
  }
}
