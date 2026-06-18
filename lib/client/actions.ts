"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { clientInvitationEmail } from "@/lib/client/email-templates";
import { getBaseUrl, getAuthCallbackUrl } from "@/lib/utils/base-url";
import type { ClientUser, SharedLink } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface ClientUserWithCentre extends ClientUser {
  centre_name: string;
  /** Set by getCurrentClientUser(centreId) when the user has access to the requested centre. */
  is_authorised_for_current?: boolean;
}

export interface SharedLinkWithCreator extends SharedLink {
  creator_name: string;
  creator_email: string;
}

export interface ClientUserCentre {
  id: string;
  name: string;
  logo_url: string | null;
  is_default: boolean;
}

export interface ClientUserCentreSummary extends ClientUserCentre {
  next_session_date: string | null;
  unpaid_invoice_count: number;
  unread_report_count: number;
}

// ============================================================
// Send magic link for client login
// ============================================================

export async function sendClientMagicLink(
  email: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthCallbackUrl("/client-login"),
      },
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("sendClientMagicLink error:", err);
    return { error: "Failed to send magic link." };
  }
}

// ============================================================
// Invite a centre contact to the client portal
// ============================================================

export async function inviteClientUser(input: {
  centreId: string;
  email: string;
  name: string;
  isPrimary?: boolean;
}): Promise<{ data: ClientUser | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const adminClient = createSupabaseAdmin();

    // Check for existing client user with this email + centre
    const { data: existing } = await supabase
      .from("client_users")
      .select("id")
      .eq("centre_id", input.centreId)
      .eq("email", input.email)
      .single();

    if (existing) {
      return { data: null, error: "This email already has portal access for this centre." };
    }

    // If marking as primary, unset existing primary users
    if (input.isPrimary !== false) {
      await supabase
        .from("client_users")
        .update({ is_primary: false })
        .eq("centre_id", input.centreId)
        .eq("is_primary", true);
    }

    // Create or find Supabase auth user
    // First check if auth user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(
      (u) => u.email === input.email
    );

    let authUserId: string;

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
    } else {
      // Create new auth user with a random password (they'll use magic link)
      const { data: newUser, error: createError } =
        await adminClient.auth.admin.createUser({
          email: input.email,
          email_confirm: true,
        });

      if (createError || !newUser?.user) {
        return { data: null, error: createError?.message ?? "Failed to create user." };
      }
      authUserId = newUser.user.id;
    }

    // Create client_users record
    const { data: clientUser, error: insertError } = await supabase
      .from("client_users")
      .insert({
        user_id: authUserId,
        centre_id: input.centreId,
        name: input.name,
        email: input.email,
        is_primary: input.isPrimary !== false,
      })
      .select()
      .single();

    if (insertError) {
      return { data: null, error: insertError.message };
    }

    // Get centre name for the email
    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", input.centreId)
      .single();

    // Send invitation email with magic link
    const callbackUrl = getAuthCallbackUrl("/client-login");
    const { subject, html } = clientInvitationEmail(
      input.name,
      centre?.name ?? "your centre",
      `${getBaseUrl()}/client-login`
    );

    await sendEmail(input.email, subject, html);

    // Also send magic link via Supabase Auth (routes through SMTP
    // configured in Supabase dashboard — needs Resend SMTP set up).
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      options: {
        redirectTo: callbackUrl,
      },
    });

    return { data: clientUser, error: null };
  } catch (err) {
    console.error("inviteClientUser error:", err);
    return { data: null, error: "Failed to invite user." };
  }
}

// ============================================================
// Get client users for a centre
// ============================================================

export async function getCentreClientUsers(
  centreId: string
): Promise<{ data: ClientUser[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("client_users")
      .select("*")
      .eq("centre_id", centreId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCentreClientUsers error:", err);
    return { data: [], error: "Failed to load client users." };
  }
}

// ============================================================
// Revoke client portal access
// ============================================================

export async function revokeClientAccess(
  clientUserId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("client_users")
      .delete()
      .eq("id", clientUserId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("revokeClientAccess error:", err);
    return { error: "Failed to revoke access." };
  }
}

// ============================================================
// Get current client user (for authenticated client)
// ============================================================
//
// When `currentCentreId` is provided we treat it as the "active"
// centre — used by /client/[centreId] surfaces to scope reads.
// The returned `centre_id` is overridden to the active centre so
// downstream callers don't need to know multi-centre exists.
// `is_authorised_for_current` reports whether the user actually
// has access to that centre via the join (legacy single-centre
// access falls through `client_users.centre_id`).

export async function getCurrentClientUser(
  currentCentreId?: string,
): Promise<{
  data: ClientUserWithCentre | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    // Pull the client_users row — legacy single mapping.
    const { data: cu, error: cuErr } = await supabase
      .from("client_users")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (cuErr || !cu) {
      return { data: null, error: cuErr?.message ?? "Not found." };
    }

    // Determine which centre to "use" for this request.
    let activeCentreId = currentCentreId ?? cu.centre_id;
    let isAuthorised = false;

    if (currentCentreId) {
      const { data: joinRow } = await supabase
        .from("client_user_centres")
        .select("centre_id")
        .eq("client_user_id", cu.id)
        .eq("centre_id", currentCentreId)
        .maybeSingle();

      // Fallback: legacy single-centre mapping still counts.
      isAuthorised = !!joinRow || cu.centre_id === currentCentreId;
      if (!isAuthorised) {
        // Caller will redirect to the default centre instead of
        // returning a hard error; surface the user with the legacy
        // centre but a clear `is_authorised_for_current=false` flag.
        activeCentreId = cu.centre_id;
      }
    } else {
      isAuthorised = true;
    }

    const { data: centre } = await supabase
      .from("centres")
      .select("name")
      .eq("id", activeCentreId)
      .maybeSingle();

    return {
      data: {
        ...cu,
        centre_id: activeCentreId,
        centre_name: centre?.name ?? "Your centre",
        is_authorised_for_current: isAuthorised,
      } as ClientUserWithCentre,
      error: null,
    };
  } catch (err) {
    console.error("getCurrentClientUser error:", err);
    return { data: null, error: "Failed to load user." };
  }
}

// ============================================================
// Multi-centre: list all centres a client user can access
// ============================================================

export async function getCurrentClientUserCentres(): Promise<{
  data: ClientUserCentre[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: cu, error: cuErr } = await supabase
      .from("client_users")
      .select("id, centre_id")
      .eq("user_id", user.id)
      .single();
    if (cuErr || !cu) return { data: null, error: cuErr?.message ?? "Not found." };

    const { data: rows, error: joinErr } = await supabase
      .from("client_user_centres")
      .select("centre_id, is_default, centres!inner(id, name, logo_url)")
      .eq("client_user_id", cu.id);
    if (joinErr) return { data: null, error: joinErr.message };

    let centres: ClientUserCentre[] = (rows ?? []).map((r) => {
      const c = r.centres as unknown as {
        id: string;
        name: string;
        logo_url: string | null;
      };
      return {
        id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        is_default: r.is_default,
      };
    });

    // Legacy fallback — if the user has no join rows yet but does
    // have a centre_id on client_users, surface that as the default
    // so existing single-centre users never see an empty switcher.
    if (centres.length === 0 && cu.centre_id) {
      const { data: legacy } = await supabase
        .from("centres")
        .select("id, name, logo_url")
        .eq("id", cu.centre_id)
        .maybeSingle();
      if (legacy) {
        centres = [
          { id: legacy.id, name: legacy.name, logo_url: legacy.logo_url, is_default: true },
        ];
      }
    }

    // ORDER BY is_default DESC, name
    centres.sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { data: centres, error: null };
  } catch (err) {
    console.error("getCurrentClientUserCentres error:", err);
    return { data: null, error: "Failed to load centres." };
  }
}

// ============================================================
// Multi-centre: move the `is_default` flag
// ============================================================

export async function setDefaultClientCentre(
  centreId: string,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: cu } = await supabase
      .from("client_users")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!cu) return { error: "Portal account not found." };

    // Verify they have access to the target centre.
    const { data: target } = await supabase
      .from("client_user_centres")
      .select("centre_id")
      .eq("client_user_id", cu.id)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!target) return { error: "You don't have access to that centre." };

    // Two-step: clear any existing default first, then set the new
    // one. The partial unique index would reject a second `true`
    // row so the clear must land first.
    const admin = createSupabaseAdmin();
    const { error: clearErr } = await admin
      .from("client_user_centres")
      .update({ is_default: false })
      .eq("client_user_id", cu.id)
      .eq("is_default", true);
    if (clearErr) return { error: clearErr.message };

    const { error: setErr } = await admin
      .from("client_user_centres")
      .update({ is_default: true })
      .eq("client_user_id", cu.id)
      .eq("centre_id", centreId);
    if (setErr) return { error: setErr.message };

    // Best-effort: keep the legacy single-centre column in sync so
    // existing portal-actions reads still work.
    await admin.from("client_users").update({ centre_id: centreId }).eq("id", cu.id);

    return { error: null };
  } catch (err) {
    console.error("setDefaultClientCentre error:", err);
    return { error: "Failed to update default centre." };
  }
}

// ============================================================
// Admin-only: link a director to an extra centre
// ============================================================

export async function linkClientUserToCentre(
  clientUserId: string,
  centreId: string,
  makeDefault: boolean = false,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Not authorised." };
    }

    // If marking default, clear the existing default first so the
    // partial unique index doesn't reject the insert.
    if (makeDefault) {
      await supabase
        .from("client_user_centres")
        .update({ is_default: false })
        .eq("client_user_id", clientUserId)
        .eq("is_default", true);
    }

    const { error: insErr } = await supabase
      .from("client_user_centres")
      .upsert(
        { client_user_id: clientUserId, centre_id: centreId, is_default: makeDefault },
        { onConflict: "client_user_id,centre_id" },
      );
    if (insErr) return { error: insErr.message };

    // Activity log — best effort.
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "client_user_linked_to_centre",
      entity_type: "client_user",
      entity_id: clientUserId,
      metadata: { centre_id: centreId, is_default: makeDefault },
    });

    return { error: null };
  } catch (err) {
    console.error("linkClientUserToCentre error:", err);
    return { error: "Failed to link centre." };
  }
}

// ============================================================
// Admin-only: unlink — refuses if the row is the default
// ============================================================

export async function unlinkClientUserFromCentre(
  clientUserId: string,
  centreId: string,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Not authorised." };
    }

    const { data: row } = await supabase
      .from("client_user_centres")
      .select("is_default")
      .eq("client_user_id", clientUserId)
      .eq("centre_id", centreId)
      .maybeSingle();
    if (!row) return { error: "Link not found." };
    if (row.is_default) {
      return {
        error: "Cannot remove the default centre. Set a different default first.",
      };
    }

    const { error: delErr } = await supabase
      .from("client_user_centres")
      .delete()
      .eq("client_user_id", clientUserId)
      .eq("centre_id", centreId);
    if (delErr) return { error: delErr.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "client_user_unlinked_from_centre",
      entity_type: "client_user",
      entity_id: clientUserId,
      metadata: { centre_id: centreId },
    });

    return { error: null };
  } catch (err) {
    console.error("unlinkClientUserFromCentre error:", err);
    return { error: "Failed to unlink centre." };
  }
}

// ============================================================
// Admin-side: list centres linked to a specific client_user
// ============================================================

export async function getCentresForClientUser(
  clientUserId: string,
): Promise<{ data: ClientUserCentre[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("client_user_centres")
      .select("centre_id, is_default, centres!inner(id, name, logo_url)")
      .eq("client_user_id", clientUserId);
    if (error) return { data: [], error: error.message };
    const centres = (rows ?? [])
      .map((r) => {
        const c = r.centres as unknown as {
          id: string;
          name: string;
          logo_url: string | null;
        };
        return {
          id: c.id,
          name: c.name,
          logo_url: c.logo_url,
          is_default: r.is_default,
        };
      })
      .sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { data: centres, error: null };
  } catch (err) {
    console.error("getCentresForClientUser error:", err);
    return { data: [], error: "Failed to load linked centres." };
  }
}

// ============================================================
// Multi-centre: per-centre roll-up for the optional home card
// ============================================================

export async function getClientUserCentresSummary(): Promise<{
  data: ClientUserCentreSummary[] | null;
  error: string | null;
}> {
  try {
    const { data: centres, error: centresErr } = await getCurrentClientUserCentres();
    if (centresErr || !centres) return { data: null, error: centresErr };

    // Cap at 10 — large multi-site chains would otherwise blow out
    // the home page; the rest stay accessible via the switcher.
    const capped = centres.slice(0, 10);

    const supabase = await createSupabaseServerClient();
    const today = new Date().toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const summaries = await Promise.all(
      capped.map(async (c): Promise<ClientUserCentreSummary> => {
        const [nextRes, invoicesRes, reportsRes] = await Promise.all([
          supabase
            .from("sessions")
            .select("date")
            .eq("centre_id", c.id)
            .gte("date", today)
            .in("status", ["published", "pending_confirmation", "confirmed"])
            .order("date", { ascending: true })
            .order("time", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("outbound_invoices")
            .select("id", { count: "exact", head: true })
            .eq("centre_id", c.id)
            .in("status", ["sent", "partially_paid", "overdue"]),
          supabase
            .from("centre_reports")
            .select("id", { count: "exact", head: true })
            .eq("centre_id", c.id)
            .eq("status", "sent")
            .gte("sent_at", fourteenDaysAgo),
        ]);

        return {
          ...c,
          next_session_date: (nextRes.data as { date: string } | null)?.date ?? null,
          unpaid_invoice_count: invoicesRes.count ?? 0,
          unread_report_count: reportsRes.count ?? 0,
        };
      }),
    );

    return { data: summaries, error: null };
  } catch (err) {
    console.error("getClientUserCentresSummary error:", err);
    return { data: null, error: "Failed to load centres summary." };
  }
}

// ============================================================
// Shared link management
// ============================================================

export async function createSharedLink(
  centreId: string,
  expiryDays: number = 30
): Promise<{ data: SharedLink | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    // Get client_user ID
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("id, is_primary")
      .eq("user_id", user.id)
      .eq("centre_id", centreId)
      .single();

    if (!clientUser) return { data: null, error: "Not a portal user." };
    if (!clientUser.is_primary) return { data: null, error: "Only primary users can create shared links." };

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const { data, error } = await supabase
      .from("shared_links")
      .insert({
        centre_id: centreId,
        created_by: clientUser.id,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (err) {
    console.error("createSharedLink error:", err);
    return { data: null, error: "Failed to create link." };
  }
}

export async function getActiveSharedLinks(
  centreId: string
): Promise<{ data: SharedLink[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("shared_links")
      .select("*")
      .eq("centre_id", centreId)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: error.message };
    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getActiveSharedLinks error:", err);
    return { data: [], error: "Failed to load links." };
  }
}

export async function revokeSharedLink(
  linkId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase
      .from("shared_links")
      .update({ is_active: false })
      .eq("id", linkId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err) {
    console.error("revokeSharedLink error:", err);
    return { error: "Failed to revoke link." };
  }
}

// ============================================================
// Validate shared link (for public access)
// ============================================================

export async function validateSharedLink(
  token: string
): Promise<{
  data: { centreId: string; centreName: string; primaryUserName: string } | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from("shared_links")
      .select("centre_id, is_active, expires_at, created_by, centres!inner(name)")
      .eq("token", token)
      .single();

    if (error || !data) return { data: null, error: "Invalid link." };

    if (!data.is_active) return { data: null, error: "This link has been revoked." };

    if (new Date(data.expires_at) < new Date()) {
      return { data: null, error: "This link has expired." };
    }

    const centre = data.centres as unknown as { name: string };

    // Get primary user name
    const { data: creator } = await supabase
      .from("client_users")
      .select("name")
      .eq("id", data.created_by)
      .single();

    return {
      data: {
        centreId: data.centre_id,
        centreName: centre.name,
        primaryUserName: creator?.name ?? "the centre administrator",
      },
      error: null,
    };
  } catch (err) {
    console.error("validateSharedLink error:", err);
    return { data: null, error: "Failed to validate link." };
  }
}
