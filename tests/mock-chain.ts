// Supabase fluent-chain mocks: let `.or(...)` stand wherever `.eq(...)` does.
//
// "Who are the coaches" became `.or(COACH_POOL_FILTER)` (migration 101)
// where it used to be `.eq("role", "coach")`. Mocks written as nested
// `{ eq: () => ({ eq: ... }) }` chains wrap their profiles object in this
// and keep working whichever of the two filters the code calls.

type Chain = { [key: string]: unknown };

function isChain(value: unknown): value is Chain {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then !== "function"
  );
}

export function withOr<T>(chain: T): T {
  if (!isChain(chain)) return chain;
  const out: Chain = { ...chain };
  for (const key of ["select", "eq", "or"]) {
    const fn = chain[key];
    if (typeof fn === "function") {
      out[key] = (...args: unknown[]) => withOr((fn as (...a: unknown[]) => unknown)(...args));
    }
  }
  if (typeof out.eq === "function" && out.or === undefined) out.or = out.eq;
  return out as T;
}
