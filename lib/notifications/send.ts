import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToUser } from "./push-send";
import { sendEmail } from "@/lib/email/send";
import { genericNotificationEmail } from "@/lib/email/templates";
import { getNotificationUrl } from "./url-builder";
import type { NotificationEvent } from "./events";
import { EVENT_TIER_MAP } from "./events";

// ============================================================
// Centralised notification sender
// ============================================================

interface NotificationRecipient {
  userId: string;
  email?: string;
  name?: string;
  role?: string;
}

/**
 * Send a notification to one or more recipients.
 * Always inserts a DB record (source of truth for in-app bell).
 * Checks DND and preferences to determine push/email delivery.
 */
export async function triggerNotification(
  event: NotificationEvent,
  recipients: NotificationRecipient[]
): Promise<void> {
  const admin = createSupabaseAdmin();
  const tier = EVENT_TIER_MAP[event.type];

  for (const recipient of recipients) {
    try {
      // 1. Always insert DB record (Realtime delivers to bell)
      const { data: inserted } = await admin
        .from("notifications")
        .insert({
          user_id: recipient.userId,
          type: event.type,
          title: event.title,
          body: event.body,
          tier,
          entity_type: event.entityType,
          entity_id: event.entityId,
          data: event.data ?? {},
          read: false,
        })
        .select("id")
        .single();

      // 2. Informational → DB only (Realtime handles in-app)
      if (tier === "informational") continue;

      // 3. Check DND: profiles.dnd_enabled OR active in_progress session
      const isDND = await checkDND(admin, recipient.userId);

      // DND skips push/email for non-urgent
      if (isDND && tier !== "urgent") continue;

      // 4. Check user preference
      const preference = await getUserPreference(
        admin,
        recipient.userId,
        event.type
      );

      // Urgent cannot be opted out
      const shouldPush =
        tier === "urgent" || preference === "push" || preference === "in_app";
      const shouldEmail =
        tier === "urgent" ||
        preference === "email" ||
        (tier === "important" && preference === "push"); // fallback email for important

      // 5. Push notification
      //
      // Single dispatcher: `push-send.ts` (web-push package) encrypts
      // the payload so the service worker shows the real title/body.
      // A second WebCrypto-based sender used to run in parallel for
      // urgent/important tiers — both hit the same push_subscriptions
      // rows, so every urgent event arrived TWICE on the same device.
      // Fails silently so a push outage can't block the in-app +
      // email path; the SMS fallback lives in
      // lib/sms/actions.ts::sendUrgentNotificationViaSms.
      const delivered: string[] = [];
      if (shouldPush) {
        const url = getNotificationUrl(
          event.entityType,
          event.entityId,
          recipient.role ?? "coach"
        );
        await sendPushToUser(recipient.userId, {
          title: event.title,
          body: event.body,
          url,
          tag: event.type,
        });
        delivered.push("push");
      }

      // 6. Email notification
      if (shouldEmail && recipient.email) {
        const { subject, html } = genericNotificationEmail(
          recipient.name ?? "there",
          event.title,
          event.body
        );
        await sendEmail(recipient.email, subject, html);
        delivered.push("email");
      }

      // 7. Record delivered channels — the daily digest uses this to
      // skip notifications the user was already emailed about, so the
      // same event never lands in their inbox twice. Push-only rows
      // stay digest-eligible: push is ephemeral and catch-up is the
      // digest's whole job.
      if (delivered.length > 0 && inserted?.id) {
        await admin
          .from("notifications")
          .update({ delivered_channels: delivered })
          .eq("id", inserted.id);
      }
    } catch (err) {
      console.error(
        `triggerNotification failed for user ${recipient.userId}:`,
        err
      );
    }
  }
}

/**
 * Send a notification to all active admin/ops users.
 * Replaces the scattered notifyOpsUsers helpers.
 */
export async function triggerNotificationForOps(
  event: NotificationEvent
): Promise<void> {
  const admin = createSupabaseAdmin();

  const { data: opsUsers } = await admin
    .from("profiles")
    .select("id, email, name, role")
    .in("role", ["admin", "ops"])
    .eq("status", "active");

  if (!opsUsers || opsUsers.length === 0) return;

  const recipients: NotificationRecipient[] = opsUsers.map((u) => ({
    userId: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
  }));

  await triggerNotification(event, recipients);
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Check if a user is in DND mode:
 * - Manual toggle: profiles.dnd_enabled = true
 * - Auto: has any session with status = 'in_progress'
 */
async function checkDND(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  // Check manual DND
  const { data: profile } = await admin
    .from("profiles")
    .select("dnd_enabled")
    .eq("id", userId)
    .single();

  if (profile?.dnd_enabled) return true;

  // Check auto-DND (in active session)
  const { data: activeSession } = await admin
    .from("sessions")
    .select("id")
    .eq("coach_id", userId)
    .eq("status", "in_progress")
    .limit(1)
    .single();

  return !!activeSession;
}

/**
 * Get user's notification channel preference for a specific type.
 * Defaults to "push" if no preference set.
 */
async function getUserPreference(
  admin: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  notificationType: string
): Promise<string> {
  const { data } = await admin
    .from("notification_preferences")
    .select("channel")
    .eq("user_id", userId)
    .eq("notification_type", notificationType)
    .single();

  return data?.channel ?? "push";
}
