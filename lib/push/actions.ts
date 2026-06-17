"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getVapidKeys, signPushRequest, type PushSubscriptionJSON } from "./sign";

// ============================================================
// Web push server actions
// ============================================================
//
// The `push_subscriptions` table predates this surface (added in
// migration 011, hardened in migration 057). Columns are:
//
//   user_id   uuid       -> profiles.id
//   endpoint  text       -> push service URL (unique per device)
//   keys_p256dh text     -> subscriber public key (base64url)
//   keys_auth   text     -> auth secret (base64url)
//   user_agent  text     -> for triage
//   last_used_at timestamptz -> 057
//
// We expose typed entry points so the rest of the codebase can stay
// agnostic of the column names.

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  tier?: "urgent" | "important" | "informational";
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  user_agent: string | null;
  last_used_at: string;
  created_at: string;
}

/**
 * Upsert the calling user's subscription. Idempotent on
 * (user_id, endpoint) -- safe to call on every page load if the
 * client wants to keep the row warm.
 */
export async function savePushSubscription(
  subscription: PushSubscriptionJSON,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    if (
      !subscription?.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys?.auth
    ) {
      return { error: "Invalid subscription payload." };
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

    if (error) {
      console.error("savePushSubscription error:", error);
      return { error: "Failed to save subscription." };
    }
    return { error: null };
  } catch (err) {
    console.error("savePushSubscription threw:", err);
    return { error: "Failed to save subscription." };
  }
}

/**
 * Delete the calling user's subscription for a given endpoint.
 * Self-only: the WHERE clause includes user_id so even if a
 * different user obtained the endpoint somehow they can't delete
 * someone else's row.
 */
export async function deletePushSubscription(
  endpoint: string,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    if (!endpoint) return { error: "Endpoint is required." };

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) {
      console.error("deletePushSubscription error:", error);
      return { error: "Failed to remove subscription." };
    }
    return { error: null };
  } catch (err) {
    console.error("deletePushSubscription threw:", err);
    return { error: "Failed to remove subscription." };
  }
}

/**
 * Number of active push subscriptions for the calling user. Used by
 * the opt-in UX to render "2 devices subscribed" without leaking
 * the endpoints themselves.
 */
export async function getPushSubscriptionCount(
  userId: string,
): Promise<number> {
  try {
    const admin = createSupabaseAdmin();
    const { count, error } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) {
      console.error("getPushSubscriptionCount error:", error);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error("getPushSubscriptionCount threw:", err);
    return 0;
  }
}

/**
 * Dispatch a push to every subscription the user owns. Returns
 * counts so the caller can log "sent 1, failed 1" without taking
 * the time to walk results.
 *
 * Stale subscriptions (410 Gone / 404 Not Found) are removed so
 * the next send doesn't waste a round-trip on them.
 *
 * Important: this function is server-only and uses the admin
 * client because the dispatcher typically runs from server-action
 * contexts where the calling user is the SENDER, not the recipient
 * -- RLS would otherwise block reading the recipient's subscriptions.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    const admin = createSupabaseAdmin();

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, keys_p256dh, keys_auth")
      .eq("user_id", userId);

    if (error || !subs || subs.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const vapidKeys = getVapidKeys();

    for (const sub of subs) {
      try {
        const subscription: PushSubscriptionJSON = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        };

        const { headers, body } = await signPushRequest(
          subscription,
          payload,
          vapidKeys,
        );

        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers,
          body: body as unknown as BodyInit,
        });

        if (res.status === 410 || res.status === 404) {
          // Subscription is dead; remove the row so we don't retry.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          failed += 1;
          continue;
        }

        if (res.status >= 200 && res.status < 300) {
          sent += 1;
          // Best-effort touch so triage sees a fresh `last_used_at`.
          await admin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", sub.id);
        } else {
          failed += 1;
          console.warn(
            `Push to ${sub.endpoint} failed with status ${res.status}.`,
          );
        }
      } catch (err) {
        failed += 1;
        console.error("Push dispatch threw:", err);
      }
    }
  } catch (err) {
    console.error("sendPushToUser threw:", err);
  }

  return { sent, failed };
}

/**
 * "Send test push" button: dispatches a known payload to the
 * calling user's own devices, so they can verify the opt-in worked.
 */
export async function sendTestPush(): Promise<{
  sent: number;
  failed: number;
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { sent: 0, failed: 0, error: "Not authenticated." };
  }

  const result = await sendPushToUser(user.id, {
    title: "Build Alpha Kids",
    body: "Push notifications are working.",
    url: "/",
    tag: "bak-test",
    tier: "important",
  });
  return { ...result, error: null };
}
