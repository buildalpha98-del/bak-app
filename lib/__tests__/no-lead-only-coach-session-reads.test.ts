import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ============================================================
// "My shifts" means every shift the coach is on, not only the ones
// they lead (migration 099)
// ============================================================
//
// `sessions.coach_id` is the LEAD coach — a cache of the primary row in
// `session_coaches`. A `.from("sessions")…​.eq("coach_id", someone)`
// read therefore silently drops every shift that person works as the
// second coach: no shift in their schedule, no session plan, no
// attendance list. That shipped for four months and three real shared
// shifts never reached their second coach.
//
// Ask the join table instead — lib/sessions/coach-membership.ts:
//   .select(`…, ${MEMBERSHIP_JOIN}`).eq(MEMBERSHIP_FILTER, coachId)
//
// No exemptions. Pay and invoicing were the last lead-only readers; they
// now list every shift the coach was on and price each one for THAT
// coach (lib/pay-rates/coach-shift-pay.ts).
// (`.in("coach_id", ids)` admin aggregates are not matched here; they
// undercount a second coach's hours and are tracked separately.)

const ROOT = process.cwd();
const ROOTS = ["lib", "app", "components"];
const EXEMPT = new Set<string>();

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "__tests__") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) yield p;
  }
}

function leadOnlyReads(text: string): number[] {
  const hits: number[] = [];
  const re = /\.eq\(\s*"coach_id"\s*,/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    // The nearest preceding .from() in the same statement is the table.
    const from = text.lastIndexOf('.from("', m.index);
    if (from < 0 || text.slice(from, m.index).includes(";")) continue;
    const table = text.slice(from + 7, text.indexOf('"', from + 7));
    if (table === "sessions") hits.push(text.slice(0, m.index).split("\n").length);
  }
  return hits;
}

describe("no lead-only reads of a coach's shifts", () => {
  it("finds the pattern it is looking for", () => {
    expect(leadOnlyReads('supabase\n.from("sessions")\n.select("id")\n.eq("coach_id", coachId)')).toEqual([4]);
    expect(leadOnlyReads('x.from("sessions").select("id");\ny.from("skill_ratings").select("id").eq("coach_id", u)')).toEqual([]);
  });

  it("every sessions read for a coach goes through session_coaches", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(ROOT, root))) {
        const rel = relative(ROOT, file);
        if (EXEMPT.has(rel)) continue;
        for (const line of leadOnlyReads(readFileSync(file, "utf8"))) offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, "use MEMBERSHIP_JOIN + MEMBERSHIP_FILTER from lib/sessions/coach-membership.ts").toEqual([]);
  });
});
