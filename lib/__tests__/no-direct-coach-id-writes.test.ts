import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const ROOTS = ["lib", "app", "components"];

// Files exempt from the guard:
//   - the helper itself (writes coach_id indirectly via the RPC)
//   - this test file
//
// The guard is scoped specifically to `.from("sessions")` chains.
// Other tables that legitimately have a `coach_id` column (notably
// `scheduling_preferences`, `rerostering_events`, `swap_requests`,
// `coach_performance_snapshots`, `notifications`, `feedback_ratings`)
// are not blocked.
//
// Detection algorithm: for each `coach_id:` line, walk back up to 20
// lines to find the NEAREST `.from("X")` call — that's the chain root
// for this write. If `X === "sessions"` AND a `.update(`/`.insert(`/
// `.upsert(` appeared between that `.from()` and the `coach_id:` line,
// it's a direct write violation.
//
// Walking back to the nearest `.from()` (rather than scanning a flat
// 12-line window) is the precise interpretation — otherwise an
// unrelated `.from("sessions").select(...)` immediately above a
// `.from("feedback_ratings").insert({ coach_id: ... })` would trip
// a false positive. The Supabase fluent builder always opens a new
// chain at `.from()`, so the nearest preceding `.from()` is always
// the table being written to.
const EXEMPT = new Set<string>([
  "lib/sessions/session-coaches.ts",
  "lib/__tests__/no-direct-coach-id-writes.test.ts",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield p;
    }
  }
}

function findDirectCoachIdWrites(filePath: string): { line: number; snippet: string }[] {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const hits: { line: number; snippet: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/coach_id\s*:/.test(lines[i])) continue;
    // Walk back to the nearest `.from("X")` — that's the chain root.
    let fromTable: string | null = null;
    let writeCall = false;
    for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
      const line = lines[j];
      const fromMatch = line.match(/\.from\(\s*["']([^"']+)["']\s*\)/);
      if (fromMatch) {
        fromTable = fromMatch[1];
        break;
      }
      if (/\.(update|insert|upsert)\s*\(/.test(line)) {
        writeCall = true;
      }
    }
    if (fromTable === "sessions" && writeCall) {
      hits.push({ line: i + 1, snippet: lines[i].trim() });
    }
  }
  return hits;
}

describe("no direct sessions.coach_id writes outside setSessionCoaches", () => {
  it("scans lib/, app/, components/ and finds no violations", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      const abs = join(ROOT, root);
      for (const filePath of walk(abs)) {
        const rel = relative(ROOT, filePath);
        if (EXEMPT.has(rel)) continue;
        const hits = findDirectCoachIdWrites(filePath);
        for (const h of hits) {
          violations.push(`${rel}:${h.line} ${h.snippet}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} direct coach_id write(s) outside setSessionCoaches:\n` +
          violations.join("\n") +
          "\n\nRoute these writes through setSessionCoaches() instead. See " +
          "docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5."
      );
    }
    expect(violations).toEqual([]);
  });
});
