import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// Term setup + the term board
// ============================================================
//
// Rolling a term forward reads the weekly pattern out of last term's
// sessions BY DATE (a mislabelled term_id must not hide it), writes the
// ticked slots as templates, generates every week at once, and the term
// board shows the result with gaps first. All of it on a throwaway 2031
// draft term — deleting it cascades its templates and sessions.
//
// The pattern comes from real production sessions, so the spec asserts
// shape (grouping, badges, flags, counts derived from what it ticked),
// never specific centres. Skips when no earlier term ever ran anything.

const RUN_ID = `e2e-${Date.now().toString(36)}`;
const TERM_NAME = `E2E Setup ${RUN_ID}`;
const START = "2031-02-03"; // Monday
const END = "2031-03-07"; // Friday — five weeks

let termId: string | null = null;
let adminEmail: string | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  adminEmail = await findUserEmail("admin");
  if (!adminEmail) {
    skipReason = "No active admin.";
    return;
  }
  const { count } = await admin.from("sessions").select("id", { count: "exact", head: true }).lt("date", START).neq("status", "cancelled");
  if (!count) {
    skipReason = "No earlier sessions to roll forward.";
    return;
  }
  const { data, error } = await admin
    .from("terms")
    .insert({ name: TERM_NAME, start_date: START, end_date: END, year: 2031, status: "draft" })
    .select("id")
    .single();
  if (error || !data) {
    skipReason = `Could not create the term: ${error?.message}`;
    return;
  }
  termId = data.id;
});

test.afterAll(async () => {
  await adminClient().from("terms").delete().eq("name", TERM_NAME);
});

test.describe("term setup and the term board", () => {
  test.beforeEach(() => {
    test.skip(!termId, skipReason ?? "fixture not provisioned");
  });

  let ticked = 0;
  let templates = 0;

  test("setup reads last term's pattern by date and ticks the regular slots", async ({ page, baseURL }) => {
    await signInAs(page, adminEmail!, baseURL!);
    await page.goto(`/admin/roster/terms/${termId}/setup`);
    await expect(page.getByRole("heading", { name: `Set up ${TERM_NAME}` })).toBeVisible({ timeout: 60_000 });
    const main = page.locator("main");
    await expect(main).toContainText(/pattern read from .+ \(\d+ sessions/);
    await expect(main).toContainText(/\d+ of \d+ weeks/);
    const add = page.getByRole("button", { name: /^Add \d+ slots? to/ });
    ticked = Number((await add.innerText()).match(/Add (\d+)/)![1]);
    expect(ticked).toBeGreaterThan(0);
    await add.click();
    await expect(main.getByText(/\d+ added/)).toBeVisible({ timeout: 60_000 });
    const { count } = await adminClient().from("term_templates").select("id", { count: "exact", head: true }).eq("term_id", termId!);
    templates = count ?? 0;
    expect(templates).toBe(ticked);
  });

  test("adding again does not double up", async ({ page, baseURL }) => {
    await signInAs(page, adminEmail!, baseURL!);
    await page.goto(`/admin/roster/terms/${termId}/setup`);
    await page.getByRole("button", { name: /^Add \d+ slots? to/ }).click({ timeout: 60_000 });
    await expect(page.getByText(/already there/).first()).toBeVisible({ timeout: 60_000 });
    const { count } = await adminClient().from("term_templates").select("id", { count: "exact", head: true }).eq("term_id", termId!);
    expect(count).toBe(templates);
  });

  test("generating the term makes one draft per slot per week, and is idempotent", async ({ page, baseURL }) => {
    await signInAs(page, adminEmail!, baseURL!);
    await page.goto(`/admin/roster/terms/${termId}/setup`);
    const generate = page.getByRole("button", { name: `Generate ${TERM_NAME}` });
    await generate.click({ timeout: 60_000 });
    await expect(page.locator("main").getByText(/sessions created across 5 weeks/)).toBeVisible({ timeout: 120_000 });
    const admin = adminClient();
    const { data } = await admin.from("sessions").select("date, status, template_id").eq("term_id", termId!);
    expect(data).toHaveLength(templates * 5);
    expect(data!.every((s) => s.status === "draft" && s.template_id && s.date >= START && s.date <= END)).toBe(true);

    await generate.click();
    await expect(page.locator("main").getByText(/0 sessions created/)).toBeVisible({ timeout: 120_000 });
    const { count } = await admin.from("sessions").select("id", { count: "exact", head: true }).eq("term_id", termId!);
    expect(count).toBe(templates * 5);
  });

  test("the term board shows every week, the totals, and links each cell to the roster", async ({ page, baseURL }) => {
    await signInAs(page, adminEmail!, baseURL!);
    await page.goto(`/admin/roster/coverage?term=${termId}`);
    await expect(page.getByRole("heading", { name: "Term board" })).toBeVisible({ timeout: 60_000 });
    const main = page.locator("main");
    await expect(main).toContainText("Wk 5");
    await expect(main).not.toContainText("Wk 6");
    await expect(main).toContainText(new RegExp(`Sessions\\s*${templates * 5}`));
    await expect(main).toContainText(/Term ready\s*0%/);
    const cell = page.getByRole("link", { name: /week of 3 Feb: \d+ sessions?/ }).first();
    await expect(cell).toHaveAttribute("href", /\/admin\/roster\?week=2031-02-03&centre=[0-9a-f-]{36}$/);
  });

  test("the roster's Generate Week dialog points at Set up when the active term has no slots", async ({ page, baseURL }) => {
    const { count } = await adminClient()
      .from("term_templates")
      .select("id", { count: "exact", head: true })
      .eq("term_id", (await adminClient().from("terms").select("id").eq("status", "active").limit(1).single()).data!.id);
    test.skip((count ?? 0) > 0, "the active term already has template slots");
    await signInAs(page, adminEmail!, baseURL!);
    await page.goto("/admin/roster");
    await page.getByRole("button", { name: "Generate Week" }).click({ timeout: 60_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/has no template slots yet/, { timeout: 30_000 });
    await expect(dialog.getByRole("link", { name: "Set up the term" })).toHaveCount(1);
  });
});
