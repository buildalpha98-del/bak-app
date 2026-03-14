/**
 * IndexedDB-based offline queue for session workflow actions.
 * Uses raw IndexedDB API — no external dependencies.
 */

const DB_NAME = "bak-session-queue";
const DB_VERSION = 1;
const STORE_NAME = "actions";

export interface QueuedAction {
  id: string;
  type: "save_progress" | "complete_session";
  sessionId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  synced: boolean;
}

// ============================================================
// Open database
// ============================================================

function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Queue an action
// ============================================================

export async function queueAction(
  action: Omit<QueuedAction, "id" | "createdAt" | "synced">
): Promise<void> {
  const db = await openSessionDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const record: QueuedAction = {
    ...action,
    id: `${action.sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    synced: false,
  };

  store.put(record);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ============================================================
// Get pending (unsynced) actions
// ============================================================

export async function getPendingActions(): Promise<QueuedAction[]> {
  const db = await openSessionDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("synced");
  const request = index.getAll(IDBKeyRange.only(0));

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ============================================================
// Mark an action as synced
// ============================================================

export async function markSynced(id: string): Promise<void> {
  const db = await openSessionDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const getReq = store.get(id);

  return new Promise((resolve, reject) => {
    getReq.onsuccess = () => {
      if (getReq.result) {
        const record = getReq.result as QueuedAction;
        record.synced = true;
        store.put(record);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ============================================================
// Sync pending actions with the server
// ============================================================

export async function syncPendingActions(): Promise<{
  synced: number;
  failed: number;
}> {
  // Dynamic import to avoid SSR issues
  const { saveSessionProgress, completeSession } = await import(
    "@/lib/sessions/session-workflow-actions"
  );

  const pending = await getPendingActions();
  let synced = 0;
  let failed = 0;

  for (const action of pending) {
    try {
      let result: { error: string | null };

      if (action.type === "save_progress") {
        result = await saveSessionProgress(
          action.sessionId,
          action.payload as { headcount?: number; coach_notes?: string }
        );
      } else if (action.type === "complete_session") {
        result = await completeSession(
          action.sessionId,
          action.payload as unknown as Parameters<typeof completeSession>[1]
        );
      } else {
        continue;
      }

      if (!result.error) {
        await markSynced(action.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

// ============================================================
// Get latest offline state for a session
// ============================================================

export async function getOfflineSessionState(
  sessionId: string
): Promise<{ headcount?: number; coach_notes?: string } | null> {
  const db = await openSessionDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const index = store.index("sessionId");
  const request = index.getAll(sessionId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      const actions = (request.result as QueuedAction[])
        .filter((a) => a.type === "save_progress" && !a.synced)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      if (actions.length === 0) {
        resolve(null);
        return;
      }

      const latest = actions[0].payload as {
        headcount?: number;
        coach_notes?: string;
      };
      resolve(latest);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}
