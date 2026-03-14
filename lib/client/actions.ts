"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { clientInvitationEmail } from "@/lib/client/email-templates";
import type { ClientUser, SharedLink } from "@/lib/types/database";

// ============================================================
// Types
// ============================================================

export interface ClientUserWithCentre extends ClientUser {
  centre_name: string;
}

export interface SharedLinkWithCreator extends SharedLink {
  creator_name: string;
  creator_email: string;
}

// ============================================================
// Send magic link for client login
// ============================================================

export async function sendClientMagicLink(
  email: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${baseUrl}/client-login`,
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
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const { subject, html } = clientInvitationEmail(
      input.name,
      centre?.name ?? "your centre",
      `${baseUrl}/client-login`
    );

    await sendEmail(input.email, subject, html);

    // Also send magic link
    await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: input.email,
      options: {
        redirectTo: `${baseUrl}/client-login`,
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

export async function getCurrentClientUser(): Promise<{
  data: ClientUserWithCentre | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("client_users")
      .select("*, centres!inner(name)")
      .eq("user_id", user.id)
      .single();

    if (error || !data) return { data: null, error: error?.message ?? "Not found." };

    const centre = data.centres as unknown as { name: string };

    return {
      data: {
        ...data,
        centre_name: centre.name,
        centres: undefined,
      } as ClientUserWithCentre,
      error: null,
    };
  } catch (err) {
    console.error("getCurrentClientUser error:", err);
    return { data: null, error: "Failed to load user." };
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
