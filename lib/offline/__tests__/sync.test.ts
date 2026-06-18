import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFakeIndexedDB,
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from "./fake-idb";

// localStorage needs to exist for the success-path persistence write.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  });
}

beforeEach(() => {
  installFakeIndexedDB();
  stubLocalStorage();
  vi.stubGlobal("crypto", {
    randomUUID: () => `id_${Math.random().toString(36).slice(2, 12)}`,
  });
  vi.resetModules();
});

afterEach(() => {
  clearFakeIndexedDB();
  uninstallFakeIndexedDB();
});

describe("offline/sync", () => {
  it("dispatches each item via its registered handler", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    const attendance = vi.fn(async () => ({ error: null }));
    const form = vi.fn(async () => ({ error: null }));
    sync.clearSyncHandlers();
    sync.registerSyncHandler({ kind: "attendance", dispatch: attendance });
    sync.registerSyncHandler({ kind: "form_submission", dispatch: form });

    await db.enqueue("attendance", { a: 1 });
    await db.enqueue("form_submission", { f: 1 });

    const result = await sync.syncQueue();

    expect(attendance).toHaveBeenCalledWith({ a: 1 });
    expect(form).toHaveBeenCalledWith({ f: 1 });
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(await db.getQueue()).toHaveLength(0);
  });

  it("marks the item failed when the handler returns an error", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    sync.clearSyncHandlers();
    sync.registerSyncHandler({
      kind: "form_submission",
      async dispatch() {
        return { error: "validation failed" };
      },
    });

    const item = await db.enqueue("form_submission", { hi: true });
    const result = await sync.syncQueue();

    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);
    expect(result.errors[0]).toEqual({ id: item.id, error: "validation failed" });

    const [refreshed] = await db.getQueue();
    expect(refreshed.attempt).toBe(1);
    expect(refreshed.lastError).toBe("validation failed");
  });

  it("dequeues an item on a successful dispatch", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    sync.clearSyncHandlers();
    sync.registerSyncHandler({
      kind: "session_note",
      async dispatch() {
        return { error: null };
      },
    });

    const item = await db.enqueue("session_note", { sessionId: "s1", notes: "x" });
    expect((await db.getQueue()).find((q) => q.id === item.id)).toBeDefined();

    const result = await sync.syncQueue();
    expect(result.synced).toBe(1);
    expect((await db.getQueue()).find((q) => q.id === item.id)).toBeUndefined();
  });

  it("caps retries at MAX_ATTEMPTS and sentinels the row as permanently failed", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    sync.clearSyncHandlers();
    sync.registerSyncHandler({
      kind: "attendance",
      async dispatch() {
        throw new Error("network down");
      },
    });

    const item = await db.enqueue("attendance", { sessionId: "s1" });

    // Drive the queue MAX_ATTEMPTS times — by the last call the row should
    // be sentinelled and subsequent runs should skip it.
    for (let i = 0; i < db.MAX_ATTEMPTS; i++) {
      await sync.syncQueue();
    }

    const [refreshed] = await db.getQueue();
    expect(refreshed.attempt).toBe(db.PERMANENT_FAILURE_ATTEMPT);

    // One more pass — failed count should stay flat because the engine skips
    // sentinelled rows.
    const result = await sync.syncQueue();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);

    // The row is still there for the Sync issues card to surface.
    expect((await db.getQueue()).find((q) => q.id === item.id)).toBeDefined();
  });

  it("returns accurate synced/failed counts", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    sync.clearSyncHandlers();
    sync.registerSyncHandler({
      kind: "attendance",
      async dispatch() {
        return { error: null };
      },
    });
    sync.registerSyncHandler({
      kind: "form_submission",
      async dispatch() {
        return { error: "boom" };
      },
    });

    await db.enqueue("attendance", { a: 1 });
    await db.enqueue("attendance", { a: 2 });
    await db.enqueue("form_submission", { f: 1 });

    const result = await sync.syncQueue();
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("processes multiple kinds independently in createdAt order", async () => {
    const db = await import("../db");
    const sync = await import("../sync");

    const calls: string[] = [];
    sync.clearSyncHandlers();
    sync.registerSyncHandler({
      kind: "attendance",
      async dispatch(p) {
        calls.push(`attendance:${(p as { n: number }).n}`);
        return { error: null };
      },
    });
    sync.registerSyncHandler({
      kind: "observation",
      async dispatch(p) {
        calls.push(`observation:${(p as { n: number }).n}`);
        return { error: null };
      },
    });
    sync.registerSyncHandler({
      kind: "status_broadcast",
      async dispatch(p) {
        calls.push(`status_broadcast:${(p as { n: number }).n}`);
        return { error: null };
      },
    });

    await db.enqueue("attendance", { n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await db.enqueue("observation", { n: 2 });
    await new Promise((r) => setTimeout(r, 5));
    await db.enqueue("status_broadcast", { n: 3 });

    const result = await sync.syncQueue();
    expect(result.synced).toBe(3);
    expect(calls).toEqual([
      "attendance:1",
      "observation:2",
      "status_broadcast:3",
    ]);
  });
});
