/**
 * Marketing-page fetch guard: public sections must degrade, never
 * throw — a DB hiccup can't be allowed to break the homepage. Wraps
 * a server fetch and resolves to `fallback` on any rejection.
 * Used by the clinics, stats and testimonials sections (and blog/
 * newsletter when they land).
 */
export async function safeFetch<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
