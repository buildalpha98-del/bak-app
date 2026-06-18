/**
 * Sync engine for the offline queue.
 *
 * Handlers register at module load via {@link registerSyncHandler}. When
 * {@link syncQueue} runs, it walks the queue in `createdAt` order and asks
 * each item's handler to dispatch the payload. On success the row is
 * deleted; on failure the attempt counter ticks up; once we hit
 * {@link MAX_ATTEMPTS} we sentinel the row as permanently-failed and stop
 * retrying until the coach taps "Retry" on /coach/profile.
 *
 * The default handlers (see {@link registerDefaultSyncHandlers}) wire up
 * attendance, form submissions, observations, status broadcasts and
 * session notes. They lazily import the server-action modules so this file
 * stays SSR-safe and the bundle stays slim on routes that don't sync.
 */

import {
  dequeue,
  getQueue,
  markFailed,
  markPermanentlyFailed,
  MAX_ATTEMPTS,
  type QueueItem,
  type QueueKind,
} from "./db";

// ============================================================
// Handler registry
// ============================================================

export interface SyncHandler<T = unknown> {
  kind: QueueKind;
  /**
   * Dispatch a single queued payload to its server action. Must return an
   * `{ error }` shape so the sync engine can decide whether to dequeue or
   * mark-failed. Throwing also counts as a failure — the engine catches it.
   */
  dispatch(payload: T): Promise<{ error: string | null }>;
}

const handlers = new Map<QueueKind, SyncHandler<unknown>>();

/** Register (or replace) a handler for a given queue kind. */
export function registerSyncHandler<T>(handler: SyncHandler<T>): void {
  handlers.set(handler.kind, handler as SyncHandler<unknown>);
}

/** Convenience for tests — drops every registered handler. */
export function clearSyncHandlers(): void {
  handlers.clear();
}

/** Read-only handler accessor — useful for the OfflineIndicator popover so it
 * can label items by kind without each component reaching into the registry. */
export function getRegisteredHandlerKinds(): QueueKind[] {
  return Array.from(handlers.keys());
}

// ============================================================
// syncQueue
// ============================================================

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Walk the queue and dispatch every item whose handler is registered.
 *
 * Items at or past {@link MAX_ATTEMPTS} are skipped silently — they appear on
 * the "Sync issues" surface and need a manual reset to retry. Anything without
 * a registered handler (e.g. a stale row from an older schema) is also skipped
 * and counts toward `failed` with a clear error message.
 */
export async function syncQueue(): Promise<SyncResult> {
  const items = await getQueue();
  let synced = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const item of items) {
    if (item.attempt >= MAX_ATTEMPTS) {
      // Permanently failed — surface on /coach/profile, don't auto-retry.
      continue;
    }

    const result = await dispatchOne(item);
    if (result.ok) {
      synced++;
      continue;
    }

    failed++;
    errors.push({ id: item.id, error: result.error });

    // Cap retries: once this failure would put us at or over MAX_ATTEMPTS, we
    // promote the row to the permanently-failed sentinel so future sync runs
    // skip it — until the coach taps "Retry" on the Sync issues card.
    const nextAttempt = item.attempt + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      await markPermanentlyFailed(
        item.id,
        `Max retries exceeded after ${nextAttempt} attempts: ${result.error}`,
      );
    } else {
      await markFailed(item.id, result.error);
    }
  }

  if (synced > 0) {
    try {
      window.localStorage.setItem("bak-offline-last-sync", String(Date.now()));
    } catch {
      // localStorage may be unavailable (SSR/private mode); ignore.
    }
  }

  return { synced, failed, errors };
}

interface DispatchOutcome {
  ok: boolean;
  error: string;
}

async function dispatchOne(item: QueueItem): Promise<DispatchOutcome> {
  const handler = handlers.get(item.kind);
  if (!handler) {
    return {
      ok: false,
      error: `No handler registered for kind '${item.kind}'`,
    };
  }

  try {
    const res = await handler.dispatch(item.payload);
    if (res?.error) {
      return { ok: false, error: res.error };
    }
    await dequeue(item.id);
    return { ok: true, error: "" };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown sync failure";
    return { ok: false, error: message };
  }
}

// ============================================================
// Default handler registration
// ============================================================

let defaultHandlersRegistered = false;

/**
 * Register the canonical handlers for every queue kind. Idempotent — safe to
 * call from multiple entry points (the coach layout calls this once on mount).
 *
 * Server actions are imported lazily inside each `dispatch` so:
 *   1. This module remains tree-shakable / SSR-safe;
 *   2. We don't pull every action into the coach bundle just to register.
 */
export function registerDefaultSyncHandlers(): void {
  if (defaultHandlersRegistered) return;
  defaultHandlersRegistered = true;

  // ---------------- attendance ----------------
  registerSyncHandler<{
    sessionId: string;
    coachId: string;
    attendanceRecords: Array<{
      childId: string;
      status: "present" | "absent";
    }>;
    walkIns?: Array<{
      childName: string;
      parentName: string;
      parentPhone: string;
    }>;
  }>({
    kind: "attendance",
    async dispatch(payload) {
      const { markAttendance } = await import(
        "@/lib/launch/coach-dashboard-actions"
      );
      const res = await markAttendance(payload);
      return { error: res.success ? null : (res.error ?? "Attendance failed") };
    },
  });

  // ---------------- form_submission ----------------
  registerSyncHandler<{
    formTemplateId: string;
    sessionId: string | null;
    dataJson: Record<string, unknown>;
    attachments: string[];
  }>({
    kind: "form_submission",
    async dispatch(payload) {
      const { submitForm } = await import("@/lib/forms/actions");
      const res = await submitForm(payload);
      return { error: res.error };
    },
  });

  // ---------------- observation ----------------
  registerSyncHandler<{
    sessionId: string;
    coachId: string;
    generalNotes?: string;
    rating?: number;
    childObservations?: Array<{ childId: string; observation: string }>;
  }>({
    kind: "observation",
    async dispatch(payload) {
      const { saveSessionNotes } = await import(
        "@/lib/launch/coach-dashboard-actions"
      );
      const res = await saveSessionNotes(payload);
      return {
        error: res.success ? null : (res.error ?? "Observation save failed"),
      };
    },
  });

  // ---------------- status_broadcast ----------------
  registerSyncHandler<{
    sessionId: string;
    status: "running_late" | "on_site" | "session_over";
    lateMinutes?: number;
    message?: string;
    broadcastTo?: Array<"centre" | "admin" | "parents">;
  }>({
    kind: "status_broadcast",
    async dispatch(payload) {
      const { broadcastSessionStatus } = await import(
        "@/lib/sessions/status-broadcast-actions"
      );
      const res = await broadcastSessionStatus(payload);
      return { error: res.error };
    },
  });

  // ---------------- session_note ----------------
  registerSyncHandler<{ sessionId: string; notes: string }>({
    kind: "session_note",
    async dispatch(payload) {
      const { updateSessionNotes } = await import("@/lib/sessions/actions");
      const res = await updateSessionNotes(payload.sessionId, payload.notes);
      return { error: res.error };
    },
  });
}
