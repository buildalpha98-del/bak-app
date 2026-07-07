"use server";

// ============================================================
// requireClientCentreAccess — the portal's authorization gate
// ============================================================
//
// EVERY client-portal server action that takes a centreId MUST call
// this before touching data. Server actions are directly invokable
// HTTP endpoints — the page/layout auth check does NOT protect them,
// so an action that trusts its centreId argument lets any signed-in
// user read another centre's data by swapping the ID.
//
// Grants access when the caller either:
//   1. has a client_users row for the centre (single-centre director),
//   2. is linked via client_user_centres (multi-centre director), or
//   3. is an active admin/ops staff member (support & previews).

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClientAccessResult {
  authorised: boolean;
  userId: string | null;
  /** Set when authorised via a client_users row (not staff). */
  clientUserId: string | null;
  isStaff: boolean;
}

const DENIED: ClientAccessResult = {
  authorised: false,
  userId: null,
  clientUserId: null,
  isStaff: false,
};

export async function requireClientCentreAccess(
  centreId: string
): Promise<ClientAccessResult> {
  try {
    if (!centreId) return DENIED;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DENIED;

    // Direct client_users row for this centre
    const { data: direct } = await supabase
      .from("client_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("centre_id", centreId)
      .maybeSingle();

    if (direct) {
      return {
        authorised: true,
        userId: user.id,
        clientUserId: direct.id,
        isStaff: false,
      };
    }

    // Multi-centre link (migration 053): any of the caller's
    // client_users rows joined to this centre.
    const { data: ownRows } = await supabase
      .from("client_users")
      .select("id")
      .eq("user_id", user.id);

    const ownIds = (ownRows ?? []).map((r) => r.id);
    if (ownIds.length > 0) {
      const { data: linked } = await supabase
        .from("client_user_centres")
        .select("client_user_id")
        .eq("centre_id", centreId)
        .in("client_user_id", ownIds)
        .limit(1);

      if (linked && linked.length > 0) {
        return {
          authorised: true,
          userId: user.id,
          clientUserId: linked[0].client_user_id,
          isStaff: false,
        };
      }
    }

    // Staff bypass — admin/ops legitimately view any centre's portal
    // data (support, previews, the staff Centre Inbox).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profile &&
      profile.status === "active" &&
      (profile.role === "admin" || profile.role === "ops")
    ) {
      return {
        authorised: true,
        userId: user.id,
        clientUserId: null,
        isStaff: true,
      };
    }

    return DENIED;
  } catch (err) {
    console.error("requireClientCentreAccess error:", err);
    return DENIED;
  }
}
