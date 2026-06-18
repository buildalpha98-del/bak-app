import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ============================================================
// /auth/callback — Supabase auth code exchange
// ============================================================
//
// Every magic link, password reset email, and OAuth flow routes
// through here. Supabase appends `?code=<authCode>` when the user
// clicks the link in their email; we exchange it for a session
// cookie via `exchangeCodeForSession`, then redirect to the `next`
// param (the actual destination the caller wanted).
//
// Without this route the click does nothing — the user lands on a
// login page with `?code=...` that nobody reads, no session is set,
// and they get bounced back to the form. That was the production
// bug before this route existed.

const SAFE_NEXT_DEFAULT = "/";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return SAFE_NEXT_DEFAULT;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  // Supabase can also surface errors via query string when the link
  // is expired or already used — surface them to the user instead of
  // silently bouncing.
  const errorDescription = searchParams.get("error_description");
  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}${next.includes("?") ? `${next}&` : `${next}?`}auth_error=${encodeURIComponent(errorDescription)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${next}?auth_error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}${next.includes("?") ? `${next}&` : `${next}?`}auth_error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
