import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// "Who are the coaches" is COACH_POOL_FILTER (lib/staff/coach-pool.ts),
// never `.eq("role", "coach")`: since migration 101 an ops member can
// also coach, and a query on the role alone leaves them out of the
// roster pickers, the AI solver, training, performance and the rest.
// Thirty queries asked it the old way when the flag landed.

const ROOT = process.cwd();
const ROOTS = ["lib", "app", "components"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "__tests__") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield p;
    }
  }
}

describe("coach-pool queries", () => {
  it('no query selects the coaching pool with .eq("role", "coach")', () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(ROOT, root))) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (/\.eq\(\s*["']role["']\s*,\s*["']coach["']\s*\)/.test(line)) {
            hits.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }
    expect(hits, `Use .or(COACH_POOL_FILTER) from lib/staff/coach-pool.ts:\n${hits.join("\n")}`).toEqual([]);
  });
});
