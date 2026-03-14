/**
 * IndexedDB-based offline queue for form submissions.
 * Stores form data + attachments locally, syncs when online.
 */

const DB_NAME = "bak-form-queue";
const DB_VERSION = 1;
const STORE_NAME = "form_submissions";

export interface QueuedFormSubmission {
  id: string;
  formTemplateId: string;
  sessionId: string | null;
  dataJson: Record<string, unknown>;
  attachments: string[];
  createdAt: string;
  synced: boolean;
}

// ============================================================
// Open database
// ============================================================

function openFormDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("synced", "synced", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Queue a form submission for offline storage
// ============================================================

export async function queueFormSubmission(input: {
  formTemplateId: string;
  sessionId: string | null;
  dataJson: Record<string, unknown>;
  attachments: string[];
}): Promise<string> {
  const db = await openFormDB();
  const id = `form_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const entry: QueuedFormSubmission = {
    id,
    formTemplateId: input.formTemplateId,
    sessionId: input.sessionId,
    dataJson: input.dataJson,
    attachments: input.attachments,
    createdAt: new Date().toISOString(),
    synced: false,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Get pending (unsynced) submissions
// ============================================================

export async function getPendingFormSubmissions(): Promise<QueuedFormSubmission[]> {
  const db = await openFormDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const index = tx.objectStore(STORE_NAME).index("synced");
    const request = index.getAll(IDBKeyRange.only(false));

    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// Mark a queued submission as synced
// ============================================================

export async function markFormSynced(id: string): Promise<void> {
  const db = await openFormDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const entry = getReq.result as QueuedFormSubmission | undefined;
      if (entry) {
        entry.synced = true;
        store.put(entry);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================
// Sync all pending form submissions
// ============================================================

export async function syncPendingFormSubmissions(): Promise<{
  synced: number;
  failed: number;
}> {
  const pending = await getPendingFormSubmissions();
  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      // Dynamic import to avoid server-side import issues
      const { submitForm } = await import("@/lib/forms/actions");
      const { error } = await submitForm({
        formTemplateId: entry.formTemplateId,
        sessionId: entry.sessionId,
        dataJson: entry.dataJson,
        attachments: entry.attachments,
      });

      if (!error) {
        await markFormSynced(entry.id);
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
// Get count of pending submissions
// ============================================================

export async function getPendingFormCount(): Promise<number> {
  try {
    const pending = await getPendingFormSubmissions();
    return pending.length;
  } catch {
    return 0;
  }
}

// ============================================================
// Image compression utility (target <500KB)
// ============================================================

export function compressImage(
  file: File,
  maxSizeKB = 500,
  maxDimension = 1200
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Scale down if too large
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Cannot get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Try progressively lower quality until under target
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Compression failed"));
                return;
              }
              if (blob.size > maxSizeKB * 1024 && quality > 0.2) {
                quality -= 0.1;
                tryCompress();
              } else {
                resolve(blob);
              }
            },
            "image/jpeg",
            quality
          );
        };

        tryCompress();
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
