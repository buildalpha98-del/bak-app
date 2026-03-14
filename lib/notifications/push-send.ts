import webpush from "web-push";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Configure VAPID
if (
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Send a push notification to all registered devices for a user.
 * Cleans up stale subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const admin = createSupabaseAdmin();

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, keys_p256dh, keys_auth")
      .eq("user_id", userId);

    if (!subscriptions || subscriptions.length === 0) return;

    const jsonPayload = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys_p256dh,
                auth: sub.keys_auth,
              },
            },
            jsonPayload
          );
        } catch (err) {
          // 410 Gone or 404 — subscription expired, clean up
          if (
            err instanceof webpush.WebPushError &&
            (err.statusCode === 410 || err.statusCode === 404)
          ) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
          } else {
            throw err;
          }
        }
      })
    );

    // Log failures (non-stale)
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Push send failed:", result.reason);
      }
    }
  } catch (err) {
    console.error("sendPushToUser error:", err);
  }
}
