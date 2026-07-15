import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

// ============================================================
// getCanonicalSiteUrl() is restricted to the SEO surfaces
// ============================================================
//
// The footgun this exists to stop: getMarketingUrl() and
// getCanonicalSiteUrl() return the IDENTICAL string once
// NEXT_PUBLIC_MARKETING_URL is set, so picking the wrong one at a call
// site is invisible in production. It only diverges when the env is
// unset — i.e. before the DNS cutover, and on any preview or local run.
// A wrong pick would sail through review, tests and a prod smoke-test,
// then surface as either a broken parent link or a self-canonical .app
// duplicate at exactly the moment nobody is looking.
//
// The rule (see lib/utils/base-url.ts):
//   SEO surfaces      → getCanonicalSiteUrl()  (the .com.au literal)
//   links humans click → getMarketingUrl()     (falls back to .app)
//
// WHY A TEST AND NOT A LINT RULE: this is the natural job for ESLint's
// no-restricted-imports, and that was the first choice. But lint does not
// run in this repo, verified rather than assumed:
//   - `npm run lint` → `next lint`, REMOVED in Next 16 (package.json
//     pins next ^16.1.6); it now reads "lint" as a directory argument and
//     errors with "Invalid project directory provided".
//   - `npx eslint` → ESLint 9 (pinned ^9.39.4) requires flat config, and
//     there is no eslint.config.* or .eslintrc* anywhere in the repo.
// So an ESLint rule added here would never execute — worse than nothing,
// because it would LOOK like a guard. Standing up a whole flat config to
// host one rule is infrastructure for a single constraint. This test runs
// in the suite that already runs, and follows the existing precedent for
// architectural constraints in this codebase
// (lib/__tests__/no-direct-coach-id-writes.test.ts).

const ROOT = process.cwd();
const ROOTS = ["lib", "app", "components"];

/**
 * The ONLY files allowed to import getCanonicalSiteUrl.
 *
 * Every entry is a surface whose output is read by a crawler, where the
 * origin is an identity claim rather than a route. Adding to this list
 * means asserting exactly that. If you are reaching for it to build a URL
 * a PERSON will click, you want getMarketingUrl() instead.
 */
const ALLOWED_CANONICAL_IMPORTERS = new Set<string>([
  "app/robots.ts", // Sitemap: line — must name the canonical host
  "app/sitemap.ts", // every <loc> in the sitemap
  "app/(marketing)/layout.tsx", // metadataBase → resolves every canonical/OG URL
  "lib/marketing/jsonld.ts", // schema.org @id/url identity claims
]);

/** The definition site and this test are not call sites. */
const EXEMPT = new Set<string>([
  "lib/utils/base-url.ts",
  "lib/utils/__tests__/base-url.test.ts",
  "lib/utils/__tests__/canonical-helper-boundary.test.ts",
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

/** Repo-relative, POSIX-separated so the allow-list is portable. */
function relPath(filePath: string): string {
  return relative(ROOT, filePath).split(sep).join("/");
}

/**
 * Does this file IMPORT the named helper from base-url?
 *
 * Matches the identifier only inside an `import { ... } from
 * ".../base-url"` binding list, so a mention in a comment does not count
 * — several files deliberately explain in prose why they use one helper
 * and not the other, and those comments must not trip the guard.
 */
function importsHelper(filePath: string, helper: string): boolean {
  const text = readFileSync(filePath, "utf8");
  const importRe = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*utils\/base-url["']/g;
  for (const match of text.matchAll(importRe)) {
    const bindings = match[1].split(",").map((b) => b.trim().split(/\s+as\s+/)[0].trim());
    if (bindings.includes(helper)) return true;
  }
  return false;
}

function allSourceFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    for (const filePath of walk(join(ROOT, root))) files.push(filePath);
  }
  return files;
}

describe("getCanonicalSiteUrl is confined to the SEO surfaces", () => {
  it("is imported by no file outside the allow-list", () => {
    const violations = allSourceFiles()
      .map(relPath)
      .filter((rel) => !EXEMPT.has(rel) && !ALLOWED_CANONICAL_IMPORTERS.has(rel))
      .filter((rel) => importsHelper(join(ROOT, rel), "getCanonicalSiteUrl"));

    if (violations.length > 0) {
      throw new Error(
        `getCanonicalSiteUrl() imported outside the SEO surfaces:\n` +
          violations.map((v) => `  ${v}`).join("\n") +
          `\n\ngetCanonicalSiteUrl() hardcodes https://buildalphakids.com.au, which ` +
          `serves WordPress until the DNS cutover. If you are building a URL a ` +
          `PERSON will click, use getMarketingUrl() — it falls back to the app ` +
          `domain so the link works today.\n` +
          `If this really is a crawler-facing surface, add it to ` +
          `ALLOWED_CANONICAL_IMPORTERS in this file and say why.`
      );
    }
    expect(violations).toEqual([]);
  });

  it("is actually imported by every file on the allow-list", () => {
    // Keeps the allow-list honest: a stale entry would silently widen the
    // rule for a file that has since been renamed or refactored.
    const missing = [...ALLOWED_CANONICAL_IMPORTERS].filter(
      (rel) => !importsHelper(join(ROOT, rel), "getCanonicalSiteUrl")
    );
    expect(missing).toEqual([]);
  });

  it("keeps the SEO surfaces off the fallback helper entirely", () => {
    // The inverse mistake, and the more dangerous one: a canonical built
    // from getMarketingUrl() would self-canonicalise every .app page and
    // advertise a crawlable .app sitemap whenever the env is unset.
    const leaks = [...ALLOWED_CANONICAL_IMPORTERS].filter((rel) =>
      importsHelper(join(ROOT, rel), "getMarketingUrl")
    );
    expect(leaks).toEqual([]);
  });

  it("leaves the parent-invite call sites on the fallback helper", () => {
    // The two paths the release fix was actually about. If either ever
    // switches to getCanonicalSiteUrl(), parent magic links point at
    // WordPress pre-cutover and Supabase swaps the redirect silently.
    for (const rel of ["lib/parent/actions.ts", "lib/launch/invitation-actions.ts"]) {
      expect(
        importsHelper(join(ROOT, rel), "getCanonicalSiteUrl"),
        `${rel} must not use getCanonicalSiteUrl — parent links need the .app fallback`
      ).toBe(false);
      expect(
        importsHelper(join(ROOT, rel), "getMarketingUrl"),
        `${rel} must build parent invite URLs from getMarketingUrl`
      ).toBe(true);
    }
  });
});
