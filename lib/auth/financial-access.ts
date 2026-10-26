import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { canSeeFinancials } from "@/lib/auth/financial-rule";
/**
 * Server-side guard for financial routes (/admin|ops/invoicing,
 * /admin/payroll, /admin/analytics, /admin/grants, /admin/intelligence,
 * and the Financial tab of any compound dashboard).
 *
 * Admin accounts with `profiles.financial_access` only — see
 * lib/auth/financial-rule.ts (ops never, even with the flag). When the current user
 * is denied, redirects to the role's portal root with a `denied=financial`
 * query param so the destination can surface a toast — keeping the
 * 404-vs-403 ambiguity light so we don't leak that the route exists.
 *
 * Use in `layout.tsx` of any financial section so the gate applies to
 * every nested page without per-page wiring. Also used by the nav
 * component to hide menu items the user can't reach.
 */
export async function requireFinancialAccess(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, financial_access")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  if (!canSeeFinancials(profile)) {
    const root =
      profile.role === "admin"
        ? "/admin"
        : profile.role === "ops"
          ? "/ops"
          : "/coach";
    redirect(`${root}?denied=financial`);
  }
}

/**
 * Soft variant of `requireFinancialAccess()` — returns the current
 * viewer's financial-access flag without redirecting. Use inside pages
 * (e.g. /admin home) that need to conditionally render revenue cards
 * for admins-with-grant while still rendering the rest of the layout
 * for those without. Returns `false` when the viewer is unauthenticated
 * or has no profile, so the caller can default to "hide" safely.
 */
export async function getFinancialAccess(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, financial_access")
    .eq("id", user.id)
    .single();

  return canSeeFinancials(profile);
}
