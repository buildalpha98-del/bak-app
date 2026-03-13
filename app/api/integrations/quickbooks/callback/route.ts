import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/quickbooks/client";

export async function GET(req: NextRequest) {
  try {
    // 1. Validate CSRF state
    const cookieStore = await cookies();
    const storedState = cookieStore.get("qb_oauth_state")?.value;
    const receivedState = req.nextUrl.searchParams.get("state");

    if (!storedState || storedState !== receivedState) {
      return NextResponse.redirect(
        new URL(
          "/admin/settings/integrations?error=invalid_state",
          req.nextUrl.origin
        )
      );
    }

    // Clear the state cookie
    cookieStore.delete("qb_oauth_state");

    // 2. Verify user is authenticated admin
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/login", req.nextUrl.origin)
      );
    }

    // 3. Exchange code for tokens
    const callbackUrl = req.nextUrl.toString();
    const { realmId, companyName } = await exchangeCodeForTokens(
      callbackUrl,
      user.id
    );

    // 4. Log activity
    const admin = createSupabaseAdmin();
    await admin.from("activity_log").insert({
      user_id: user.id,
      action: "qb_connected",
      entity_type: "integration",
      metadata: {
        provider: "quickbooks",
        company_name: companyName,
        realm_id: realmId,
      },
    });

    // 5. Redirect back to settings
    return NextResponse.redirect(
      new URL(
        "/admin/settings/integrations?connected=true",
        req.nextUrl.origin
      )
    );
  } catch (err) {
    console.error("QuickBooks OAuth callback error:", err);
    return NextResponse.redirect(
      new URL(
        "/admin/settings/integrations?error=callback_failed",
        req.nextUrl.origin
      )
    );
  }
}
