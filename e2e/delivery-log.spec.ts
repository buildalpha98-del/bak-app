import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// The centre delivery log — the record behind the term report
// ============================================================
//
// Read-only against production: the first centre that ran sessions in a
// completed term. Asserts the panel's totals match the database, the
// term picker switches terms, and the CSV route serves one row per
// session with the right filename. No writes.

let fx: { centreId: string; centreName: string; termId: string; termName: string; delivered: number; total: number; adminEmail: string } | null = null;
let skipReason: string | null = null;

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  if (!adminEmail) {
    skipReason = "No active admin.";
    return;
  }
  const { data: terms } = await admin.from("terms").select("id, name, start_date, end_date").eq("status", "completed").order("start_date", { ascending: false });
  for (const t of terms ?? []) {
    const { data: rows } = await admin.from("sessions").select("centre_id, status").gte("date", t.start_date).lte("date", t.end_date);
    const byCentre = new Map<string, { total: number; delivered: number }>();
    for (const r of rows ?? []) {
      const e = byCentre.get(r.centre_id) ?? { total: 0, delivered: 0 };
      e.total++;
      if (r.status === "completed" || r.status === "in_progress") e.delivered++;
      byCentre.set(r.centre_id, e);
    }
    const best = [...byCentre.entries()].sort((a, b) => b[1].delivered - a[1].delivered)[0];
    if (best && best[1].delivered > 0) {
      const { data: c } = await admin.from("centres").select("name").eq("id", best[0]).single();
      fx = { centreId: best[0], centreName: c!.name as string, termId: t.id, termName: t.name, ...best[1], adminEmail };
      return;
    }
  }
  skipReason = "No completed term with delivered sessions.";
});

test.describe("centre delivery log", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("the Sessions tab shows the term's delivery totals and switches terms", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto(`/admin/centres/${fx!.centreId}`);
    await page.getByRole("tab", { name: /Sessions/ }).click({ timeout: 60_000 });
    const panel = page.locator("div", { hasText: "Delivery log" }).filter({ has: page.getByLabel("Term") }).first();
    await expect(panel).toBeVisible({ timeout: 60_000 });
    await panel.getByLabel("Term").click();
    await page.getByRole("option", { name: fx!.termName }).click();
    await expect(panel).toContainText(new RegExp(`Delivered\\s*${fx!.delivered}\\s*session`), { timeout: 30_000 });
    await expect(panel.locator("a", { hasText: "Download CSV" })).toHaveAttribute("href", `/api/centres/${fx!.centreId}/delivery-log?term=${fx!.termId}`);
  });

  test("the CSV is one row per session of the term, named for the centre and term", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    const res = await page.request.get(`/api/centres/${fx!.centreId}/delivery-log?term=${fx!.termId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toMatch(/delivery-log\.csv"$/);
    const lines = (await res.text()).trim().split("\n");
    expect(lines[0]).toBe("Date,Time,Status,Sport,Classes,Coach(es),Programme,Outcomes,Rostered min,Actual min,Children");
    expect(lines.length - 1).toBe(fx!.total);
  });

  test("a signed-out visitor cannot download it", async ({ page }) => {
    const res = await page.request.get(`/api/centres/${fx!.centreId}/delivery-log?term=${fx!.termId}`);
    expect([401, 307, 302]).toContain(res.status());
  });
});
