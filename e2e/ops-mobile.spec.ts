import { test, expect, devices } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";
import { sydneyTodayIso } from "../lib/utils/sydney-time";

// ============================================================
// Ops on a phone — the roster is usable one-handed in a car park
// ============================================================
//
// Abdul runs the day from his phone. Before this the roster opened on
// the 980px staff grid, the session sheet took three quarters of the
// screen, and thirty-odd controls on the ops home were 28–32px tall.
// iPhone 13 profile (390×844, coarse pointer). One throwaway centre with
// a draft session today so the current week has a row to tap; deleted
// in afterAll.

test.use({ ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" });

const RUN = `e2e-${Date.now().toString(36)}`;
let fx: { centreId: string; centreName: string; sessionId: string; email: string } | null = null;
let skipReason: string | null = null;

test.beforeAll(async () => {
  const admin = adminClient();
  const email = (await findUserEmail("ops")) ?? (await findUserEmail("admin"));
  if (!email) {
    skipReason = "No active ops/admin user.";
    return;
  }
  const centreName = `E2E Centre ${RUN}`;
  const { data: centre } = await admin.from("centres").insert({ name: centreName, type: "childcare_centre" }).select("id").single();
  const { data: term } = await admin.from("terms").select("id").eq("status", "active").limit(1).maybeSingle();
  if (!centre || !term) {
    skipReason = "Could not create the centre or find an active term.";
    return;
  }
  const { data: s, error } = await admin
    .from("sessions")
    .insert({ term_id: term.id, centre_id: centre.id, date: sydneyTodayIso(), time: "10:00:00", duration_minutes: 45, sport: "Soccer", status: "draft", needs_ops_review: false })
    .select("id")
    .single();
  if (error || !s) {
    skipReason = `session: ${error?.message}`;
    return;
  }
  fx = { centreId: centre.id, centreName, sessionId: s.id, email };
});

test.afterAll(async () => {
  if (!fx) return;
  const admin = adminClient();
  await admin.from("sessions").delete().eq("id", fx.sessionId);
  await admin.from("centres").delete().eq("id", fx.centreId);
});

/** Visible controls inside <main> shorter than 44px, named. */
async function shortControls(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>("main button, main [role=button], main a.inline-flex, main select, main input:not([type=checkbox]):not([type=radio])")];
    return els
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 44)
      .map(({ e, r }) => `${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30)}: ${Math.round(r.height)}px`);
  });
}

test.describe("ops on a phone", () => {
  test.beforeEach(({ page }) => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
    test.setTimeout(180_000);
    void page;
  });

  test("the roster opens as a list with the first session on screen and no sideways scroll", async ({ page, baseURL }) => {
    await signInAs(page, fx!.email, baseURL!);
    await page.goto("/ops/roster");
    const row = page.locator("main table tbody tr").filter({ hasText: fx!.centreName }).first();
    await expect(row).toBeVisible({ timeout: 90_000 });
    const box = (await row.boundingBox())!;
    expect(box.y + box.height, "first session row is above the fold").toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal page scroll").toBe(true);
    // The grid toggles and the drag hint are desktop chrome.
    await expect(page.getByRole("button", { name: /^Staff$/ })).toBeHidden();
    await expect(page.getByText(/Drag a card/)).toBeHidden();
  });

  test("tapping a session opens the sheet across the full width", async ({ page, baseURL }) => {
    await signInAs(page, fx!.email, baseURL!);
    await page.goto("/ops/roster");
    const row = page.locator("main table tbody tr").filter({ hasText: fx!.centreName }).first();
    await expect(row).toBeVisible({ timeout: 90_000 });
    await row.getByRole("cell").nth(1).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const box = (await sheet.boundingBox())!;
    expect(Math.round(box.width)).toBe(390);
  });

  test("every control on the ops home and the roster is at least 44px tall", async ({ page, baseURL }) => {
    await signInAs(page, fx!.email, baseURL!);
    for (const path of ["/ops", "/ops/roster"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible({ timeout: 90_000 });
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      expect(await shortControls(page), `${path} controls under 44px`).toEqual([]);
    }
  });

  test("the term board's counts sit two-up, the readiness tile full width", async ({ page, baseURL }) => {
    await signInAs(page, fx!.email, baseURL!);
    await page.goto("/ops/roster/coverage");
    const ready = page.getByText("Term ready", { exact: true }).locator("..");
    await expect(ready).toBeVisible({ timeout: 90_000 });
    const sessions = page.getByText("Sessions", { exact: true }).locator("..");
    const rb = (await ready.boundingBox())!;
    const sb = (await sessions.boundingBox())!;
    expect(rb.width).toBeGreaterThan(300);
    expect(sb.width).toBeLessThan(200);
    expect(await shortControls(page), "coverage controls under 44px").toEqual([]);
  });
});
