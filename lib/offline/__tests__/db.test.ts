import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFakeIndexedDB,
  installFakeIndexedDB,
  uninstallFakeIndexedDB,
} from "./fake-idb";

beforeEach(() => {
  installFakeIndexedDB();
  vi.stubGlobal("crypto", {
    randomUUID: () =>
      `id_${Math.random().toString(36).slice(2, 12)}`,
  });
});

afterEach(() => {
  clearFakeIndexedDB();
  uninstallFakeIndexedDB();
});

describe("offline/db", () => {
  it("enqueue creates a row and getQueue returns it", async () => {
    const mod = await import("../db");
    const item = await mod.enqueue("attendance", { foo: 1 });
    expect(item.id).toBeTruthy();
    expect(item.attempt).toBe(0);
    expect(item.lastError).toBeNull();

    const all = await mod.getQueue();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(item.id);
    expect(all[0].payload).toEqual({ foo: 1 });
  });

  it("returns items ordered by createdAt asc", async () => {
    const mod = await import("../db");
    // Slip three items in with small delays so createdAt diverges.
    const a = await mod.enqueue("attendance", { n: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const b = await mod.enqueue("form_submission", { n: 2 });
    await new Promise((r) => setTimeout(r, 5));
    const c = await mod.enqueue("observation", { n: 3 });

    const queue = await mod.getQueue();
    expect(queue.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it("markFailed increments attempt and stores the error", async () => {
    const mod = await import("../db");
    const item = await mod.enqueue("status_broadcast", { hi: true });
    await mod.markFailed(item.id, "boom");
    await mod.markFailed(item.id, "boom2");
    const [refreshed] = await mod.getQueue();
    expect(refreshed.attempt).toBe(2);
    expect(refreshed.lastError).toBe("boom2");
    expect(refreshed.updatedAt).toBeGreaterThanOrEqual(item.updatedAt);
  });

  it("dequeue removes the row", async () => {
    const mod = await import("../db");
    const item = await mod.enqueue("session_note", { x: 1 });
    await mod.dequeue(item.id);
    const queue = await mod.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("clearAll resets the store", async () => {
    const mod = await import("../db");
    await mod.enqueue("attendance", { a: 1 });
    await mod.enqueue("attendance", { a: 2 });
    await mod.enqueue("attendance", { a: 3 });
    await mod.clearAll();
    const queue = await mod.getQueue();
    expect(queue).toHaveLength(0);
  });

  it("falls back to a no-op when IndexedDB is unavailable", async () => {
    // Wipe out indexedDB after the fake is installed.
    vi.stubGlobal("indexedDB", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Use a fresh module instance so the in-module reference picks up the
    // missing global.
    vi.resetModules();
    const mod = await import("../db");

    const item = await mod.enqueue("attendance", { fallback: true });
    expect(item.id).toBeTruthy(); // generated id even if persistence failed
    expect(item.payload).toEqual({ fallback: true });
    const queue = await mod.getQueue();
    expect(queue).toEqual([]);
    await expect(mod.markFailed(item.id, "noop")).resolves.toBeUndefined();
    await expect(mod.dequeue(item.id)).resolves.toBeUndefined();
    await expect(mod.clearAll()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
