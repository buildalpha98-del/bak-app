import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// ============================================================
// CI guard: no <a>/<Link> as a direct child of <TableRow>
// ============================================================
//
// An anchor is not valid HTML inside <tr>. The parser hoists it out of
// the table, so the DOM the client builds no longer matches the HTML the
// server sent, and React throws #418 — a hydration error that discards
// the server render and silently re-renders the whole tree on the
// client. It costs correctness AND speed, and it is invisible in dev
// unless you are watching the console.
//
// The row-overlay-link pattern (`<Link className="absolute inset-0">`
// covering a table row) is the way it keeps getting reintroduced: it
// reads naturally as a sibling of the cells. It belongs INSIDE a
// statically-positioned cell, where `inset-0` still resolves against the
// `relative` <tr> and covers the whole row.
//
// Four instances of this shipped to production at once. This test is
// cheaper than finding the fifth from a minified stack trace.

const ROOTS = ["components", "app"];
const EXTS = [".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

/** `</TableCell>` or `</td>` followed directly by an anchor, before the row closes. */
const OFFENDER = /<\/(?:TableCell|td)>\s*(?:\{[^}]*\}\s*)?\n\s*<(Link|a)\b/g;

describe("no anchor as a direct child of a table row", () => {
  it("finds no <Link>/<a> sitting between cells and </TableRow>", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf8");
        if (!source.includes("TableRow") && !source.includes("<tr")) continue;

        for (const match of source.matchAll(OFFENDER)) {
          const line = source.slice(0, match.index).split("\n").length + 1;
          offenders.push(`${file}:${line} — <${match[1]}> directly inside a table row`);
        }
      }
    }

    expect(
      offenders,
      `An anchor cannot be a child of <tr>; the parser relocates it and hydration ` +
        `breaks (React #418). Move it inside a statically-positioned <TableCell> — ` +
        `\`absolute inset-0\` still resolves against the relative <tr>.\n\n` +
        offenders.join("\n")
    ).toEqual([]);
  });
});
