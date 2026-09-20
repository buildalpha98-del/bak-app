import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

// Migration 088 made skill_ratings.coach_id nullable so teachers can
// author rows through client_user_id. The CHECK constraint is NOT VALID
// (historic rows), so nothing at the DB tier stops a new authorless row
// — every writer must name an author explicitly.

const ROOT = join(__dirname, "..", "..");

function writersOfSkillRatings(): string[] {
  const out = execSync(
    `grep -rl --include='*.ts' --include='*.tsx' 'from("skill_ratings")' lib app`,
    { cwd: ROOT }
  ).toString();
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes("__tests__"))
    .filter((f) => {
      const src = readFileSync(join(ROOT, f), "utf8");
      // Only files that write the table.
      return /from\("skill_ratings"\)\s*\.\s*(insert|upsert)/.test(src);
    });
}

describe("skill_ratings writers name an author", () => {
  it("every insert/upsert sets coach_id or client_user_id", () => {
    const writers = writersOfSkillRatings();
    expect(writers.length).toBeGreaterThan(0);
    for (const f of writers) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(
        /coach_id:\s*user\.id|client_user_id:\s*clientUser\.id/.test(src),
        `${f} writes skill_ratings without an author`
      ).toBe(true);
    }
  });
});
