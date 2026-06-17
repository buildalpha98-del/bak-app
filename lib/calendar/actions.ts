"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateCalendarToken,
  type CalendarEntityType,
} from "./token";

/**
 * Issue a calendar feed token for the requesting user.
 *
 * Authorisation rules:
 *  - `coach`:  only the coach themselves (matches the authenticated user's
 *    profile id) — admin/ops are routed through their own dashboards.
 *  - `parent`: only the authenticated parent's own parent_profile id.
 *  - `centre`: any signed-in client_user whose `centre_id` matches, OR an
 *    admin/ops staff profile (the latter is allowed so we can hand a feed to
 *    a centre director without dragging them through `/client-login` first).
 *
 * The token itself is HMAC-signed and not persisted — see `lib/calendar/token.ts`.
 */
export async function getCalendarToken(
  entityType: CalendarEntityType,
  entityId: string,
): Promise<{ token: string | null; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { token: null, error: "Not signed in." };
  }

  if (entityType === "coach") {
    // Coach feed is keyed by the user's auth id — which is the same id used
    // throughout `session_coaches.user_id`.
    if (user.id !== entityId) {
      return { token: null, error: "Not authorised." };
    }
  } else if (entityType === "parent") {
    const { data: parent } = await supabase
      .from("parent_profiles")
      .select("id, user_id")
      .eq("id", entityId)
      .single();
    if (!parent || parent.user_id !== user.id) {
      return { token: null, error: "Not authorised." };
    }
  } else if (entityType === "centre") {
    // Staff (admin/ops) can mint for any centre; client_users only for their own.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    const isStaff =
      profile?.role === "admin" || profile?.role === "operations";
    if (!isStaff) {
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("centre_id")
        .eq("user_id", user.id)
        .single();
      if (!clientUser || clientUser.centre_id !== entityId) {
        return { token: null, error: "Not authorised." };
      }
    }
  }

  return { token: generateCalendarToken(entityType, entityId), error: null };
}
