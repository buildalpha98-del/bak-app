"use server";

// ============================================================
// Launch Foundation — Invitation actions
// Creates invitations, sends emails, tracks in invitations table
// ============================================================

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/launch/email";
import { invitation as invitationTemplate } from "@/lib/launch/email-templates";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://app.buildalphakids.com.au";

// ========================
// Send individual invitation
// ========================

export async function sendIndividualInvitation(params: {
  name: string;
  email: string;
  role: "parent" | "centre_director" | "coach";
  centreId?: string;
  schoolId?: string;
  invitedBy: string;
}): Promise<{ success: boolean; invitationId?: string; error?: string }> {
  try {
    const adminClient = createSupabaseAdmin();

    // Check for existing pending invitation
    const { data: existing } = await adminClient
      .from("invitations")
      .select("id")
      .eq("email", params.email)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return { success: true, invitationId: existing.id }; // Already invited
    }

    // Create invitation record
    const { data: inv, error: invErr } = await adminClient
      .from("invitations")
      .insert({
        name: params.name,
        email: params.email,
        role: params.role,
        centre_id: params.centreId || null,
        school_id: params.schoolId || null,
        invited_by: params.invitedBy,
        status: "pending",
      })
      .select("id")
      .single();

    if (invErr || !inv) {
      return { success: false, error: invErr?.message || "Failed to create invitation." };
    }

    // Determine invite URL based on role
    let inviteUrl: string;
    if (params.role === "coach") {
      inviteUrl = `${APP_URL}/auth/accept-invite?token=${inv.id}`;
    } else if (params.role === "centre_director") {
      inviteUrl = `${APP_URL}/client-login?invite=${inv.id}`;
    } else {
      inviteUrl = `${APP_URL}/parent-login?invite=${inv.id}`;
    }

    // Get inviter name
    const { data: inviter } = await adminClient
      .from("profiles")
      .select("name")
      .eq("id", params.invitedBy)
      .maybeSingle();

    // Send invitation email
    const emailData = invitationTemplate({
      name: params.name,
      role: params.role,
      inviteUrl,
      invitedBy: inviter?.name || "Build Alpha Kids",
    });

    await sendEmail({
      to: params.email,
      subject: emailData.subject,
      html: emailData.html,
      emailType: "invitation",
      metadata: { invitation_id: inv.id, role: params.role },
    });

    return { success: true, invitationId: inv.id };
  } catch (err) {
    console.error("sendIndividualInvitation error:", err);
    return { success: false, error: "Failed to send invitation." };
  }
}

// ========================
// Send bulk invitations
// ========================

export async function sendBulkInvitations(params: {
  invitations: Array<{
    name: string;
    email: string;
    role: "parent" | "centre_director" | "coach";
    centreId?: string;
    schoolId?: string;
  }>;
  invitedBy: string;
}): Promise<{ sent: number; skipped: number; errors: Array<{ email: string; error: string }> }> {
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ email: string; error: string }> = [];

  for (const inv of params.invitations) {
    const result = await sendIndividualInvitation({
      ...inv,
      invitedBy: params.invitedBy,
    });

    if (result.success) {
      sent++;
    } else {
      errors.push({ email: inv.email, error: result.error || "Unknown error" });
    }
  }

  return { sent, skipped, errors };
}
