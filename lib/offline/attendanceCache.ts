/**
 * IndexedDB cache for centre child lists used in offline attendance.
 * Caches children per centre so the named attendance list works offline.
 */

const DB_NAME = "bak-attendance-cache";
const DB_VERSION = 1;
const STORE_NAME = "centre_children";

export interface CachedChild {
  id: string;
  first_name: string;
  last_name: string;
  age_group: string;
}

export interface CentreChildCache {
  centreId: string;
  children: CachedChild[];
  cachedAt: string;
}

// ============================================================
// Open database
// ============================================================

function openAttendanceDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "centreId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Cache children for a centre
// ============================================================

export async function cacheChildrenForCentre(
  centreId: string,
  children: CachedChild[]
): Promise<void> {
  const db = await openAttendanceDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const record: CentreChildCache = {
    centreId,
    children,
    cachedAt: new Date().toISOString(),
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
// Get cached children for a centre
// ============================================================

export async function getCachedChildren(
  centreId: string
): Promise<CachedChild[] | null> {
  const db = await openAttendanceDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const request = store.get(centreId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      db.close();
      const result = request.result as CentreChildCache | undefined;
      resolve(result?.children ?? null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

// ============================================================
// Clear cache for a centre (e.g. after sync)
// ============================================================

export async function clearCentreCache(centreId: string): Promise<void> {
  const db = await openAttendanceDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.delete(centreId);

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
