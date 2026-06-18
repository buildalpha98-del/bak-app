/**
 * Unified offline queue (IndexedDB).
 *
 * One store. One shape. Used by every coach write-surface that may need to
 * survive a flaky-signal moment in a centre carpark.
 *
 * The wrapper is hand-rolled — no `idb`, no `dexie` — so we stay dependency-
 * free. All calls are defensive: when `indexedDB` is unavailable (SSR, locked
 * private mode on older Safari) every operation resolves to a sensible no-op
 * rather than throwing, so the calling UI path can keep going.
 */

const DB_NAME = "bak-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "queue";

/** Every surface that can be queued for sync. Extend here first when you add a
 * new offline-eligible write path. */
export type QueueKind =
  | "attendance"
  | "form_submission"
  | "observation"
  | "status_broadcast"
  | "session_note";

export interface QueueItem {
  id: string;
  kind: QueueKind;
  /** Anything JSON-serialisable. The sync engine dispatches this verbatim to
   * the registered handler — keep it the same shape as the server action input. */
  payload: unknown;
  attempt: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// Defensive shim — detect IndexedDB availability
// ============================================================

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function warnNoop(action: string): void {
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production"
  ) {
    // Surface once per dev-session so we know offline ops are a no-op.
    console.warn(
      `[offline/db] IndexedDB unavailable — '${action}' is a no-op.`,
    );
  }
}

// ============================================================
// openDb
// ============================================================

/**
 * Open (and lazily create) the offline queue database.
 * Resolves with the open `IDBDatabase`, or rejects with the underlying error.
 *
 * On environments where `indexedDB` is missing, rejects with an explicit
 * `IndexedDB unavailable` error so callers can fall through to a no-op.
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("openDb failed"));
  });
}

// ============================================================
// Internal helpers
// ============================================================

/** Generate a UUIDv4 with a graceful fallback for environments that don't
 * expose `crypto.randomUUID` (older mobile WebViews). */
function newId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Lo-fi fallback — collision-resistant enough for a local queue.
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function runTx<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let bodyResult: T;
        let bodyResolved = false;
        let txComplete = false;
        let txErrored = false;

        function finalize() {
          if (!bodyResolved || (!txComplete && !txErrored)) return;
          db.close();
          if (txErrored) {
            reject(tx.error ?? new Error("transaction failed"));
            return;
          }
          resolve(bodyResult);
        }

        tx.oncomplete = () => {
          txComplete = true;
          finalize();
        };
        tx.onerror = () => {
          txErrored = true;
          finalize();
        };
        tx.onabort = () => {
          txErrored = true;
          finalize();
        };

        try {
          Promise.resolve(body(store))
            .then((value) => {
              bodyResult = value;
              bodyResolved = true;
              finalize();
            })
            .catch((err) => {
              bodyResolved = true;
              try {
                tx.abort();
              } catch {
                // already aborted
              }
              db.close();
              reject(err);
            });
        } catch (err) {
          try {
            tx.abort();
          } catch {
            // already aborted
          }
          db.close();
          reject(err);
        }
      }),
  );
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("request failed"));
  });
}

// ============================================================
// enqueue
// ============================================================

/** Persist a new queue item and return the inserted row. Generates the id,
 * sets `attempt=0`, and stamps both `createdAt` and `updatedAt` to `now`. */
export async function enqueue(
  kind: QueueKind,
  payload: unknown,
): Promise<QueueItem> {
  const now = Date.now();
  const item: QueueItem = {
    id: newId(),
    kind,
    payload,
    attempt: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!hasIndexedDb()) {
    warnNoop("enqueue");
    return item;
  }

  try {
    await runTx("readwrite", (store) => {
      store.put(item);
    });
    return item;
  } catch (err) {
    warnNoop(`enqueue (${err instanceof Error ? err.message : "error"})`);
    return item;
  }
}

// ============================================================
// getQueue
// ============================================================

/** Read the full queue ordered by `createdAt` ascending (oldest first). */
export async function getQueue(): Promise<QueueItem[]> {
  if (!hasIndexedDb()) {
    warnNoop("getQueue");
    return [];
  }

  try {
    return await runTx("readonly", async (store) => {
      const index = store.index("createdAt");
      const items = await reqAsPromise(index.getAll());
      // getAll on an index already returns in index order, but be defensive.
      return (items as QueueItem[]).slice().sort((a, b) => a.createdAt - b.createdAt);
    });
  } catch (err) {
    warnNoop(`getQueue (${err instanceof Error ? err.message : "error"})`);
    return [];
  }
}

// ============================================================
// markFailed
// ============================================================

/** Increment attempt count, record the latest error, bump `updatedAt`. */
export async function markFailed(id: string, error: string): Promise<void> {
  if (!hasIndexedDb()) {
    warnNoop("markFailed");
    return;
  }

  try {
    await runTx("readwrite", async (store) => {
      const existing = (await reqAsPromise(store.get(id))) as
        | QueueItem
        | undefined;
      if (!existing) return;
      const updated: QueueItem = {
        ...existing,
        attempt: existing.attempt + 1,
        lastError: error,
        updatedAt: Date.now(),
      };
      store.put(updated);
    });
  } catch (err) {
    warnNoop(`markFailed (${err instanceof Error ? err.message : "error"})`);
  }
}

// ============================================================
// markPermanentlyFailed — stop auto-retry, keep on Sync issues surface
// ============================================================

/**
 * Mark an item as permanently failed (attempt = {@link PERMANENT_FAILURE_ATTEMPT}).
 * The row stays in the queue so the coach can see it on the Sync issues card
 * and decide to retry or discard.
 */
export async function markPermanentlyFailed(
  id: string,
  error: string,
): Promise<void> {
  if (!hasIndexedDb()) {
    warnNoop("markPermanentlyFailed");
    return;
  }
  try {
    await runTx("readwrite", async (store) => {
      const existing = (await reqAsPromise(store.get(id))) as
        | QueueItem
        | undefined;
      if (!existing) return;
      const updated: QueueItem = {
        ...existing,
        attempt: PERMANENT_FAILURE_ATTEMPT,
        lastError: error,
        updatedAt: Date.now(),
      };
      store.put(updated);
    });
  } catch (err) {
    warnNoop(
      `markPermanentlyFailed (${err instanceof Error ? err.message : "error"})`,
    );
  }
}

// ============================================================
// resetAttempts — used by "retry now" on the permanent-failures surface
// ============================================================

/** Reset an item's attempt counter so the next sync picks it up again.
 * Used by the "Sync issues" retry button on /coach/profile. */
export async function resetAttempts(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    warnNoop("resetAttempts");
    return;
  }
  try {
    await runTx("readwrite", async (store) => {
      const existing = (await reqAsPromise(store.get(id))) as
        | QueueItem
        | undefined;
      if (!existing) return;
      const updated: QueueItem = {
        ...existing,
        attempt: 0,
        lastError: null,
        updatedAt: Date.now(),
      };
      store.put(updated);
    });
  } catch (err) {
    warnNoop(
      `resetAttempts (${err instanceof Error ? err.message : "error"})`,
    );
  }
}

// ============================================================
// dequeue
// ============================================================

/** Remove a queue item by id (called on successful sync, or "discard"). */
export async function dequeue(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    warnNoop("dequeue");
    return;
  }
  try {
    await runTx("readwrite", (store) => {
      store.delete(id);
    });
  } catch (err) {
    warnNoop(`dequeue (${err instanceof Error ? err.message : "error"})`);
  }
}

// ============================================================
// clearAll
// ============================================================

/** Wipe the entire queue. Used by sync-success or "Discard all" affordances. */
export async function clearAll(): Promise<void> {
  if (!hasIndexedDb()) {
    warnNoop("clearAll");
    return;
  }
  try {
    await runTx("readwrite", (store) => {
      store.clear();
    });
  } catch (err) {
    warnNoop(`clearAll (${err instanceof Error ? err.message : "error"})`);
  }
}

// ============================================================
// Sentinels
// ============================================================

/** Once attempt count hits this, we stop auto-retrying. Surface the item on
 * the Sync issues card so the coach can resolve it manually. */
export const MAX_ATTEMPTS = 5;

/** Attempt value used to mark an item as permanently failed (won't retry until
 * the coach taps "Retry" which calls `resetAttempts`). */
export const PERMANENT_FAILURE_ATTEMPT = 999;
