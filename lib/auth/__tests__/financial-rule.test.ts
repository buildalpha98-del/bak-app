import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { canSeeFinancials } from "../financial-rule";

describe("canSeeFinancials — money is Admin + financial_access only", () => {
  it("allows an admin with the flag", () => {
    expect(canSeeFinancials({ role: "admin", financial_access: true })).toBe(true);
  });
  it("refuses an admin without the flag", () => {
    expect(canSeeFinancials({ role: "admin", financial_access: false })).toBe(false);
  });
  it.each(["ops", "coach", "client", "parent"])("refuses %s even with the flag on", (role) => {
    expect(canSeeFinancials({ role, financial_access: true })).toBe(false);
  });
  it("refuses a missing profile", () => {
    expect(canSeeFinancials(null)).toBe(false);
    expect(canSeeFinancials(undefined)).toBe(false);
  });
});

// The flag alone used to BE the rule, which let an ops manager be
// granted rates, wage costs and projected income. Every gate now goes
// through canSeeFinancials; this fails the build on a gate that reads
// the raw flag again.
const ROOT = process.cwd();
const ROOTS = ["app", "components", "lib", "middleware.ts"];
const GATE = /!!\s*[\w?.]*financial_access|if\s*\(\s*!\s*[\w?.]*financial_access|financialAccess=\{\s*[\w?.]*financial_access\s*\}|const\s+\w+\s*=\s*[\w?.]*\.financial_access\s*;/;
// Toggling the flag (not gating on it) is fine.
const ALLOWED = new Set(["components/staff/staff-detail-view.tsx"]);

function walk(path: string, out: string[]) {
  const st = statSync(path);
  if (st.isDirectory()) {
    if (path.includes("__tests__") || path.includes("node_modules")) return;
    for (const f of readdirSync(path)) walk(join(path, f), out);
  } else if (/\.(ts|tsx)$/.test(path)) out.push(path);
}

describe("no gate reads financial_access directly", () => {
  it("routes every money check through canSeeFinancials", () => {
    const files: string[] = [];
    for (const r of ROOTS) walk(join(ROOT, r), files);
    const offenders = files
      .map((f) => relative(ROOT, f))
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        readFileSync(join(ROOT, f), "utf8")
          .split("\n")
          .map((line, i) => ({ f, line: i + 1, text: line.trim() }))
          .filter((l) => GATE.test(l.text) && !l.text.startsWith("//") && !l.text.startsWith("*")),
      );
    expect(offenders.map((o) => `${o.f}:${o.line}  ${o.text}`)).toEqual([]);
  });
});
