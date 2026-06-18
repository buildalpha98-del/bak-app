/**
 * Minimal in-memory IndexedDB shim for the offline-queue tests.
 *
 * We don't need spec-correctness — just enough surface area for the wrapper
 * to walk through openDb → transaction → store → put/get/getAll/delete/clear.
 * Indexes are emulated by lazy in-store sort + filter.
 */

import { vi } from "vitest";

type StoreRecord = Record<string, unknown> & { id: string };

interface FakeIDBStore {
  name: string;
  keyPath: string;
  records: Map<string, StoreRecord>;
  indexes: Map<string, { keyPath: string }>;
}

interface FakeIDBDatabase {
  name: string;
  version: number;
  stores: Map<string, FakeIDBStore>;
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore: (
    name: string,
    options: { keyPath: string },
  ) => FakeIDBStore;
  transaction: (store: string, mode: "readonly" | "readwrite") => FakeIDBTx;
  close: () => void;
}

type RequestState<T> = {
  result: T | undefined;
  error: Error | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onsuccess: ((e?: any) => void) | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onerror: ((e?: any) => void) | null;
};

function makeRequest<T>(): RequestState<T> & { fire: (result?: T) => void } {
  const req: RequestState<T> & { fire: (result?: T) => void } = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    fire(result?: T) {
      req.result = result;
      // Defer to the microtask queue so callers attaching handlers right
      // after the call still get fired.
      queueMicrotask(() => {
        if (req.onsuccess) req.onsuccess({ target: req });
      });
    },
  };
  return req;
}

interface FakeIDBTx {
  mode: "readonly" | "readwrite";
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  error: Error | null;
  objectStore: (name: string) => FakeIDBObjectStore;
  abort: () => void;
  _pendingOps: number;
  _settle: () => void;
  _failNextWrite?: boolean;
}

interface FakeIDBObjectStore {
  name: string;
  put: (record: StoreRecord) => RequestState<undefined> & { fire: (result?: undefined) => void };
  get: (id: string) => RequestState<StoreRecord | undefined> & {
    fire: (result?: StoreRecord) => void;
  };
  delete: (id: string) => RequestState<undefined> & { fire: (result?: undefined) => void };
  clear: () => RequestState<undefined> & { fire: (result?: undefined) => void };
  index: (name: string) => FakeIDBIndex;
  createIndex: (name: string, keyPath: string) => void;
}

interface FakeIDBIndex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAll: () => RequestState<any[]> & { fire: (rows: any[]) => void };
}

function makeStore(name: string, keyPath: string): FakeIDBStore {
  return {
    name,
    keyPath,
    records: new Map(),
    indexes: new Map(),
  };
}

function wrapStore(store: FakeIDBStore, tx: FakeIDBTx): FakeIDBObjectStore {
  return {
    name: store.name,
    put(record) {
      const req = makeRequest<undefined>();
      tx._pendingOps++;
      queueMicrotask(() => {
        if (tx.mode === "readonly") {
          req.error = new Error("readonly tx");
          if (req.onerror) req.onerror({ target: req });
        } else if (tx._failNextWrite) {
          req.error = new Error("simulated write failure");
          tx.error = req.error;
          if (req.onerror) req.onerror({ target: req });
        } else {
          store.records.set(record.id, { ...record });
          req.fire(undefined);
        }
        tx._pendingOps--;
        tx._settle();
      });
      return req;
    },
    get(id) {
      const req = makeRequest<StoreRecord | undefined>();
      tx._pendingOps++;
      queueMicrotask(() => {
        req.fire(store.records.get(id));
        tx._pendingOps--;
        tx._settle();
      });
      return req;
    },
    delete(id) {
      const req = makeRequest<undefined>();
      tx._pendingOps++;
      queueMicrotask(() => {
        store.records.delete(id);
        req.fire(undefined);
        tx._pendingOps--;
        tx._settle();
      });
      return req;
    },
    clear() {
      const req = makeRequest<undefined>();
      tx._pendingOps++;
      queueMicrotask(() => {
        store.records.clear();
        req.fire(undefined);
        tx._pendingOps--;
        tx._settle();
      });
      return req;
    },
    index(name) {
      return {
        getAll() {
          const req = makeRequest<unknown[]>();
          tx._pendingOps++;
          queueMicrotask(() => {
            const idx = store.indexes.get(name);
            const rows = Array.from(store.records.values());
            if (idx) {
              const key = idx.keyPath;
              rows.sort((a, b) => {
                const av = (a as Record<string, unknown>)[key] as number;
                const bv = (b as Record<string, unknown>)[key] as number;
                return Number(av) - Number(bv);
              });
            }
            req.fire(rows);
            tx._pendingOps--;
            tx._settle();
          });
          return req;
        },
      };
    },
    createIndex(name, keyPath) {
      store.indexes.set(name, { keyPath });
    },
  };
}

function makeTx(
  stores: Map<string, FakeIDBStore>,
  storeName: string,
  mode: "readonly" | "readwrite",
  options: { failNextWrite?: boolean } = {},
): FakeIDBTx {
  const tx: FakeIDBTx = {
    mode,
    error: null,
    oncomplete: null,
    onerror: null,
    onabort: null,
    _pendingOps: 0,
    _failNextWrite: options.failNextWrite,
    objectStore(name) {
      const store = stores.get(name);
      if (!store) throw new Error(`unknown store ${name}`);
      return wrapStore(store, tx);
    },
    abort() {
      if (tx.onabort) tx.onabort();
    },
    _settle() {
      if (tx._pendingOps !== 0) return;
      queueMicrotask(() => {
        if (tx._pendingOps !== 0) return;
        if (tx.error && tx.onerror) tx.onerror();
        else if (tx.oncomplete) tx.oncomplete();
      });
    },
  };
  return tx;
}

interface InstalledDb {
  db: FakeIDBDatabase;
}

const dbs = new Map<string, InstalledDb>();
let writeFailureOnce = false;

export function failNextWriteOnce(): void {
  writeFailureOnce = true;
}

export function installFakeIndexedDB(): void {
  dbs.clear();
  writeFailureOnce = false;
  vi.stubGlobal("indexedDB", {
    open(name: string, version: number) {
      const req: {
        result: FakeIDBDatabase | undefined;
        error: Error | null;
        onsuccess: ((e?: unknown) => void) | null;
        onerror: ((e?: unknown) => void) | null;
        onupgradeneeded: ((e?: unknown) => void) | null;
      } = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      queueMicrotask(() => {
        let installed = dbs.get(name);
        const isNew = !installed;
        if (!installed) {
          const stores = new Map<string, FakeIDBStore>();
          const db: FakeIDBDatabase = {
            name,
            version,
            stores,
            objectStoreNames: {
              contains: (storeName: string) => stores.has(storeName),
            },
            createObjectStore(storeName, options) {
              const store = makeStore(storeName, options.keyPath);
              stores.set(storeName, store);
              // The IDB spec exposes createIndex on the store returned by
              // createObjectStore — mirror that on the fake so the wrapper's
              // upgrade callback can call it directly.
              return {
                ...store,
                createIndex(name: string, keyPath: string) {
                  store.indexes.set(name, { keyPath });
                },
              } as unknown as FakeIDBStore;
            },
            transaction(storeName, mode) {
              return makeTx(stores, storeName, mode, {
                failNextWrite: writeFailureOnce,
              });
            },
            close() {
              // no-op in the fake — kept open between calls
            },
          };
          installed = { db };
          dbs.set(name, installed);
        }

        req.result = installed.db;
        if (isNew && req.onupgradeneeded) {
          req.onupgradeneeded({ target: req });
        }
        if (req.onsuccess) req.onsuccess({ target: req });
      });

      return req;
    },
  });

  // IDBKeyRange.only is referenced by the older formQueue path; provide a
  // permissive stub so the import doesn't blow up if a test imports that
  // module indirectly.
  vi.stubGlobal("IDBKeyRange", {
    only: <T,>(v: T) => v,
  });
}

export function clearFakeIndexedDB(): void {
  dbs.clear();
  writeFailureOnce = false;
}

export function uninstallFakeIndexedDB(): void {
  vi.unstubAllGlobals();
  dbs.clear();
}
