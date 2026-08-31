import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_VIEWER_EMAIL } from "@/lib/demo";

// ============================================================
// /demo/school — the shareable demo-portal link for proposals
// ============================================================
//
// Magic links are single-use and expire within the hour, so a link
// pasted into a proposal PDF is dead before a principal clicks it.
// This route mints a FRESH session per visit for one fixed, view-only
// demo account and drops the visitor straight into the demo school's
// portal — the same URL works for every principal, forever.
//
// Containment, in order:
//   * The account is hardcoded — no parameter chooses who to sign in as.
//   * It must be a NON-primary client user (no colleague management,
//     no shared-link minting, no settings powers), and its centre name
//     must contain "(Demo)". If either check fails — e.g. someone
//     promotes the account or points it at a real school — the route
//     refuses and falls back to the normal login page.
//   * Worst case is a stranger browsing fictional students at a
//     fictional school and messaging our ops inbox — which, for a
//     prospect, is the point.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const fallback = NextResponse.redirect(new URL("/client-login", request.url));
  try {
    const admin = createSupabaseAdmin();

    const { data: cu } = await admin
      .from("client_users")
      .select("centre_id, is_primary")
      .eq("email", DEMO_VIEWER_EMAIL)
      .maybeSingle();
    if (!cu || cu.is_primary) {
      console.error("/demo/school: viewer account missing or primary — refusing");
      return fallback;
    }
    const { data: centre } = await admin
      .from("centres")
      .select("name")
      .eq("id", cu.centre_id)
      .maybeSingle();
    if (!centre?.name?.includes("(Demo)")) {
      console.error("/demo/school: viewer centre is not a demo centre — refusing");
      return fallback;
    }

    // Mint a session: admin-generated link → verify the OTP server-side.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_VIEWER_EMAIL,
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
    const response = NextResponse.redirect(
      new URL(`/client/${cu.centre_id}`, request.url)
    );
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            ),
        },
      }
    );
    await supabase.auth.setSession({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
    });

    return response;
  } catch (err) {
    console.error("/demo/school error:", err);
    return fallback;
  }
}
