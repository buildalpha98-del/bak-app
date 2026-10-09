import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ROSTERABLE_ROLES } from "@/lib/staff/rosterable-roles";

// Every query that decides WHO CAN WORK A SHIFT must use ROSTERABLE_ROLES.
// Each of these used to be `.eq("role", "coach")`, which meant an ops
// manager could never roster themselves (or be rostered) — not in the
// roster sheet, the suggestions, term setup, or the AI solver.
const ROSTER_QUERY_FILES = [
  "lib/sessions/actions.ts",
  "lib/sessions/scheduling-actions.ts",
  "lib/utils/scheduling/data-assembly.ts",
  "lib/terms/setup-actions.ts",
];

// getCoachesForDropdown (bookable-session new / bulk / edit pages).
const DROPDOWN_FILE = "lib/bookings/actions.ts";

// Pages whose shift pickers must list everyone rosterable.
const ROSTER_PAGES = [
  "app/(dashboard)/admin/roster/page.tsx",
  "app/(dashboard)/ops/roster/page.tsx",
  "app/(dashboard)/admin/roster/terms/[id]/template/page.tsx",
  "app/(dashboard)/ops/roster/terms/[id]/template/page.tsx",
  "app/(dashboard)/admin/settings/scheduling/page.tsx",
];

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("roster pickers include ops and admin staff", () => {
  it("ROSTERABLE_ROLES covers coach, ops and admin", () => {
    expect([...ROSTERABLE_ROLES].sort()).toEqual(["admin", "coach", "ops"]);
  });

  it.each(ROSTER_QUERY_FILES)("%s never filters shift candidates to coaches only", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.eq\(\s*["']role["']\s*,\s*["']coach["']\s*\)/);
    expect(src).toContain("ROSTERABLE_ROLES");
  });

  it("getCoachesForDropdown lists every rosterable role", () => {
    const src = read(DROPDOWN_FILE);
    const fn = src.slice(src.indexOf("export async function getCoachesForDropdown"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("ROSTERABLE_ROLES");
    expect(body).not.toMatch(/\.eq\(\s*["']role["']\s*,\s*["']coach["']\s*\)/);
  });

  it.each(ROSTER_PAGES)("%s loads getRosterableStaff, not getActiveCoaches", (file) => {
    const src = read(file);
    expect(src).toContain("getRosterableStaff");
    expect(src).not.toContain("getActiveCoaches");
  });
});
