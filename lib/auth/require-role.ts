import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isDemoTeacherEmail, isDemoViewerEmail } from "@/lib/demo";

export class AuthorisationError extends Error {
  constructor(public readonly status: 401 | 403, message = "Not authorised.") {
    super(message);
    this.name = "AuthorisationError";
  }
}

// Audit §2.1–2.13: never use the routing hint cookie as authority.
export async function requireRole(roles: readonly string[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new AuthorisationError(401, "Not authenticated.");
  if (isDemoViewerEmail(user.email) || isDemoTeacherEmail(user.email)) {
    throw new AuthorisationError(403);
  }
  const { data: profile, error } = await supabase.from("profiles")
    .select("role, status, also_coaches, financial_access").eq("id", user.id).single();
  if (error || !profile || profile.status !== "active" || !roles.includes(profile.role)) {
    throw new AuthorisationError(403);
  }
  return { supabase, user, profile, error: null };
}

// Staff here means operational staff, matching the existing decision queue.
export const requireStaff = () => requireRole(["admin", "ops"]);
export const requireAdminOrOps = requireStaff;
export const requireAdmin = () => requireRole(["admin"]);
