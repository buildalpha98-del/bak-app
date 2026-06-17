"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSmsProvider } from "./index";
import { normaliseAuPhone } from "./twilio-provider";

// ============================================================
// Public surface
// ============================================================

export interface SendSmsInput {
  /** The profile (or parent_profile.user_id) whose phone we'll look up. */
  userId: string;
  /** SMS body. Keep under ~140 chars or it'll be billed as two segments. */
  body: string;
  /**
   * Optional id of the notification that triggered this SMS. When set,
   * it's stored on `sms_log.triggered_by_notification_id` so admins can
   * see "the urgent shift-swap alert escalated to SMS at 8:42pm".
   */
  triggeredBy?: string;
}

export interface SendSmsResult {
  /** Provider message id when the send succeeded; null on every failure. */
  id: string | null;
  /** Null on success, human-readable message on failure. */
  error: string | null;
}

/**
 * Admin/ops triage helper: send an SMS to a single staff member by id.
 *
 * Used by the "SMS test" affordance on /admin/staff/[id] and on the
 * Portal Access tab of /admin/centres/[id]. Looks up `profiles.phone`,
 * normalises it to E.164, dispatches through the configured provider,
 * and writes an `sms_log` row regardless of outcome. Returns the
 * provider id (or error) so the calling UI can toast.
 *
 * Auth: admin or ops. Coaches/parents must not be able to spam each
 * other so this is locked even though the underlying provider would
 * happily send.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, error: "Not authenticated." };

  const { data: actor } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!actor || (actor.role !== "admin" && actor.role !== "ops")) {
    return { id: null, error: "Not authorised." };
  }

  // Service-role client for the lookup + insert — RLS on sms_log is
  // SELECT-only, but we still want the admin pathway to bypass any
  // future write policies and the lookup to hit phone numbers across
  // roles.
  const admin = createSupabaseAdmin();

  const { data: target } = await admin
    .from("profiles")
    .select("id, phone")
    .eq("id", input.userId)
    .single();
  if (!target) return { id: null, error: "Recipient not found." };
  if (!target.phone) return { id: null, error: "Recipient has no phone number." };

  const normalised = normaliseAuPhone(target.phone);
  if (!normalised) {
    return { id: null, error: "Invalid phone format." };
  }

  const provider = getSmsProvider();
  const providerName = provider.constructor.name === "TwilioProvider" ? "twilio" : "mock";

  // Note: we insert the row AFTER the send so we can stamp status/sent_at
  // correctly in a single row. If the process dies mid-call we lose the
  // audit but never claim "sent" for something we didn't send.
  const { id: providerMessageId, error: sendError } = await provider.send(
    normalised,
    input.body,
  );

  const now = new Date().toISOString();
  await admin.from("sms_log").insert({
    user_id: target.id,
    to_phone: normalised,
    body: input.body,
    provider: providerName,
    provider_message_id: providerMessageId,
    status: sendError ? "failed" : "sent",
    error: sendError,
    triggered_by_notification_id: input.triggeredBy ?? null,
    sent_at: sendError ? null : now,
  });

  return { id: providerMessageId, error: sendError };
}

/**
 * Internal helper for the notification fallback (see roadmap item 4 —
 * "urgent push fails → escalate to SMS"). Looks up the notification row,
 * loads the recipient's phone + opt-in flag, and dispatches only when
 * the user has explicitly opted in.
 *
 * Skips silently (`{ id: null, error: null }`) when:
 *   - opt-in is false
 *   - phone is missing or invalid
 *   - notification is missing or not urgent tier
 *
 * The silent-skip is intentional: this is called by the dispatcher in a
 * loop, and we don't want a single ineligible recipient to surface as
 * an error in monitoring. Real provider failures (e.g. Twilio 5xx) still
 * return an error string and write a `failed` log row.
 */
export async function sendUrgentNotificationViaSms(
  notificationId: string,
): Promise<SendSmsResult> {
  const admin = createSupabaseAdmin();

  const { data: notification } = await admin
    .from("notifications")
    .select("id, user_id, title, body, tier")
    .eq("id", notificationId)
    .single();

  if (!notification) return { id: null, error: null };
  if (notification.tier !== "urgent") return { id: null, error: null };

  const { data: profile } = await admin
    .from("profiles")
    .select("id, phone, sms_opt_in")
    .eq("id", notification.user_id)
    .single();

  if (!profile) return { id: null, error: null };
  if (!profile.sms_opt_in) return { id: null, error: null };
  if (!profile.phone) return { id: null, error: null };

  const normalised = normaliseAuPhone(profile.phone);
  if (!normalised) return { id: null, error: null };

  const provider = getSmsProvider();
  if (!provider.isConfigured()) return { id: null, error: null };

  const providerName = provider.constructor.name === "TwilioProvider" ? "twilio" : "mock";

  // Keep the SMS short — Twilio bills per 160-char segment. Title +
  // first ~120 chars of body is plenty for triage; the in-app
  // notification carries the full payload.
  const truncatedBody =
    notification.body.length > 120
      ? `${notification.body.slice(0, 117)}...`
      : notification.body;
  const message = `${notification.title}\n${truncatedBody}`;

  const { id: providerMessageId, error: sendError } = await provider.send(
    normalised,
    message,
  );

  const now = new Date().toISOString();
  await admin.from("sms_log").insert({
    user_id: profile.id,
    to_phone: normalised,
    body: message,
    provider: providerName,
    provider_message_id: providerMessageId,
    status: sendError ? "failed" : "sent",
    error: sendError,
    triggered_by_notification_id: notification.id,
    sent_at: sendError ? null : now,
  });

  return { id: providerMessageId, error: sendError };
}

// ============================================================
// User-facing opt-in toggles
// ============================================================

/**
 * Flip `profiles.sms_opt_in` for the currently authenticated user.
 * Powers the toggle on /coach/profile (and any future admin/ops self-
 * service settings page).
 */
export async function setProfileSmsOptIn(
  optIn: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("profiles")
    .update({ sms_opt_in: optIn })
    .eq("id", user.id);
  if (error) return { error: error.message };

  return { error: null };
}

/**
 * Flip `parent_profiles.sms_opt_in` for the currently authenticated parent.
 * Powers the toggle on /parent/account.
 */
export async function setParentSmsOptIn(
  optIn: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("parent_profiles")
    .update({ sms_opt_in: optIn })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  return { error: null };
}
