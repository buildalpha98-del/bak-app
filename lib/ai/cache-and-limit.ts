// ============================================================
// AI cost guardrails — daily cap + result cache
// ============================================================
//
// The two AI generators that aren't covered by the per-feature
// rate limits (assistant cache hit, insights per-minute cap, etc.)
// share these helpers:
//
//   - assessments/generate-skills (Claude → assessment templates)
//   - ai/generate-program          (Claude → session plans)
//
// Pattern: short-cooldown (10s, already in place) prevents accidental
// double-clicks; daily cap stops a runaway tab. Cache by input hash
// short-circuits repeat requests so the same (sport, age_group)
// doesn't hit Claude every time someone reopens the dialog.
//
// In-memory only — fine for the scale we're at (Vercel serverless
// keeps a handful of warm instances; cache hits on the same instance
// are the common case for back-to-back identical requests). Move to
// Supabase-backed cache if we ever shard heavily.

interface DailyEntry {
  count: number;
  resetAt: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const dailyStore = new Map<string, DailyEntry>();
const cacheStore = new Map<string, CacheEntry<unknown>>();

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Check + increment a per-user-per-feature daily counter.
 * Returns `{ allowed: true, remaining }` or `{ allowed: false, resetAt }`.
 *
 * Keys look like `skills:<userId>` or `program:<userId>` — the feature
 * prefix means a user can hit each generator independently.
 */
export function checkDailyLimit(
  key: string,
  limit: number
): { allowed: true; remaining: number } | { allowed: false; resetAt: number } {
  const now = Date.now();
  const entry = dailyStore.get(key);

  if (!entry || now > entry.resetAt) {
    dailyStore.set(key, { count: 1, resetAt: now + DAY_MS });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

/**
 * Look up a cached result. Returns `undefined` on miss or expiry.
 * Type-checked at the callsite via the generic.
 */
export function getCached<T>(key: string): T | undefined {
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Store a value with `ttlMs` lifetime. Default = 24 hours. */
export function setCached<T>(
  key: string,
  value: T,
  ttlMs: number = DAY_MS
): void {
  cacheStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Stable cache key for a structured request body. Sorts object keys
 * so {a:1,b:2} and {b:2,a:1} hash to the same string.
 */
export function hashRequestKey(prefix: string, body: unknown): string {
  return `${prefix}:${stableStringify(body)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`
  );
  return `{${parts.join(",")}}`;
}

// Janitor — keep the in-memory stores tidy.
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, e] of dailyStore) if (now > e.resetAt) dailyStore.delete(k);
    for (const [k, e] of cacheStore) if (now > e.expiresAt) cacheStore.delete(k);
  }, 60_000);
}
