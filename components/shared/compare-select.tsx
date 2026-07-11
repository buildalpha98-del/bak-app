"use client";

// ============================================================
// CompareSelect — URL-bound period picker chip
// ============================================================
//
// Drops into a dashboard toolbar to let the operator switch the
// comparison window. We render a tiny <select> rather than a full
// shadcn `<Select>` because:
//
//   1. The set of options is fixed and small (5 entries).
//   2. URL persistence is the source of truth — the input value
//      reads from `searchParams.get("compare")` and writes back on
//      change. A native select with no client state is the cleanest
//      shape for that flow.
//   3. Rendering inside server components: the parent page can be
//      a server component, and this client island handles the
//      navigation handoff without dragging the whole page client.
//
// Default `none` doesn't serialise — keeps URLs clean for the most
// common case ("no comparison").

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { PeriodKey } from "@/lib/comparison/period";

export type CompareValue = "none" | "last_week" | "last_month" | "last_term";

const OPTIONS: { value: CompareValue; label: string }[] = [
  { value: "none", label: "No comparison" },
  { value: "last_week", label: "vs last week" },
  { value: "last_month", label: "vs last month" },
  { value: "last_term", label: "vs last term" },
];

export function CompareSelect({
  className = "",
}: {
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current =
    (searchParams.get("compare") as CompareValue | null) ?? "none";

  return (
    <label
      className={`inline-flex items-center gap-2 text-xs ${className}`}
      data-testid="compare-select"
    >
      <span className="text-muted-foreground">Compare:</span>
      <select
        value={current}
        onChange={(e) => {
          const next = e.target.value as CompareValue;
          const sp = new URLSearchParams(searchParams.toString());
          if (next === "none") {
            sp.delete("compare");
          } else {
            sp.set("compare", next);
          }
          const query = sp.toString();
          router.replace(query ? `${pathname}?${query}` : pathname);
        }}
        className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// `compareParamToPeriodKey` lives in `lib/comparison/url-param.ts` so
// server components can import it without crossing the "use client"
// boundary. Re-exported here for backwards compatibility with any
// callers that still import it from this module.
export { compareParamToPeriodKey } from "@/lib/comparison/url-param";
