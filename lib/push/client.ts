// ============================================================
// Client-side push subscription helper
// ============================================================
//
// Runs in the browser only. Handles permission prompt, registers
// the existing next-pwa service worker, subscribes via the
// PushManager, and posts the JSON-serialised subscription to the
// `savePushSubscription` server action.
//
// All entry points are best-effort and never throw -- they return
// { ok, error? } so the UI can toast on failure without a try/catch.

"use client";

import {
  savePushSubscription,
  deletePushSubscription,
} from "./actions";

export type PushPermissionState =
  | "default"
  | "granted"
  | "denied"
  | "unsupported";

/**
 * Convert the VAPID public key from url-safe base64 into the
 * Uint8Array form the PushManager expects.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padded = base64String + "=".repeat(
    (4 - (base64String.length % 4)) % 4,
  );
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/**
 * Snapshot of the browser's current Notification permission state.
 * Returns `"unsupported"` for browsers without the Notification
 * API (mostly older Safari + WebViews).
 */
export function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined") return "unsupported";
  if (typeof Notification === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/**
 * Subscribe the current browser to web push and persist the
 * subscription to our backend. Idempotent: re-calling is safe and
 * just refreshes the row.
 */
export async function subscribeToPush(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const state = getPushPermissionState();
    if (state === "unsupported") {
      return { ok: false, error: "Push not supported in this browser." };
    }
    if (state === "denied") {
      return {
        ok: false,
        error: "Notifications are blocked. Enable them in browser settings.",
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, error: "Permission denied." };
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return { ok: false, error: "VAPID public key not configured." };
    }

    const registration = await navigator.serviceWorker.ready;

    // If we already have a subscription, reuse it -- the upsert on
    // the server keeps the row fresh.
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      }));

    const { error } = await savePushSubscription(
      subscription.toJSON() as Parameters<typeof savePushSubscription>[0],
    );
    if (error) return { ok: false, error };

    return { ok: true };
  } catch (err) {
    console.error("subscribeToPush error:", err);
    return { ok: false, error: "Failed to subscribe to push notifications." };
  }
}

/**
 * Unsubscribe the current browser and remove the row server-side.
 * Safe to call even if no subscription exists.
 */
export async function unsubscribeFromPush(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { ok: true }; // nothing to do
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const { error } = await deletePushSubscription(endpoint);
    if (error) return { ok: false, error };

    return { ok: true };
  } catch (err) {
    console.error("unsubscribeFromPush error:", err);
    return { ok: false, error: "Failed to unsubscribe." };
  }
}
