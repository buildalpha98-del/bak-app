/**
 * Bridge helper for coach write surfaces.
 *
 * `submitOrQueue(kind, payload, dispatchFn)` is the single shape every
 * offline-eligible client component reaches for. When the browser is online
 * (or `navigator` is unavailable, e.g. SSR), we dispatch the supplied
 * server-action wrapper directly. When the browser is offline we drop the
 * payload onto the unified IndexedDB queue and return a normal-looking
 * success result with `queued: true` so the calling UI can toast appropriately
 * without branching on three different shapes.
 *
 * Notes:
 *  - The `dispatchFn` is what the UI would have called online. We don't
 *    re-use the sync handler here because the calling component already has
 *    the right server-action import in hand — there's no upside to going
 *    through the registry just to forward the call.
 *  - If the network is flaky (online but the dispatch throws), we fall
 *    through to enqueue so the work doesn't get lost.
 */

import { enqueue, type QueueKind } from "./db";

export interface SubmitOrQueueResult {
  /** Server-action error message. `null` when the operation succeeded online
   * OR was queued for later sync. */
  error: string | null;
  /** True when we queued instead of dispatching synchronously. The UI can
   * use this to show an "offline — will sync" toast. */
  queued?: boolean;
}

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true; // SSR — assume online so server-side calls still work
  if (typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

/**
 * Dispatch a write online; queue it offline.
 *
 * @param kind        Queue kind (must be one of {@link QueueKind})
 * @param payload     JSON-serialisable payload, matching the server action input
 * @param dispatchFn  The server-action wrapper to invoke when online
 */
export async function submitOrQueue<T>(
  kind: QueueKind,
  payload: T,
  dispatchFn: (payload: T) => Promise<{ error: string | null }>,
): Promise<SubmitOrQueueResult> {
  if (!isOnline()) {
    await enqueue(kind, payload);
    return { error: null, queued: true };
  }

  try {
    const res = await dispatchFn(payload);
    if (res?.error) {
      // The server returned a structured error — propagate it. Don't queue,
      // because the failure is semantic (validation, permissions) not
      // network. Re-queuing would just re-fail forever.
      return { error: res.error };
    }
    return { error: null };
  } catch (err) {
    // Network dropped between the online check and the call. Queue it.
    await enqueue(kind, payload);
    return {
      error: null,
      queued: true,
    };
  }
}
