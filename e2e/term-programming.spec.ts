import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// The term programming card on the programmes page
// ============================================================
//
// Whether the active term's roster is programmed, what Auto-programme
// would attach from the library, the library gaps (each opening the
// generator prefilled), and the coach-feedback panel. Throwaway centre
// with six draft sessions in the active term: three of a sport the
// library covers, three of a made-up sport it does not. Auto-programme is
// exercised for real — it attaches library programmes, no AI. Deleted
// in afterAll.

const RUN = `e2e-${Date.now().toString(36)}`;
const GAP_SPORT = `Quidditch ${RUN}`;
let fx: { centreId: string; sessions: string[]; adminEmail: string; termName: string } | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  const { data: term } = await admin.from("terms").select("id, name, start_date").eq("status", "active").limit(1).maybeSingle();
  if (!adminEmail || !term) {
    skipReason = "No active admin or term.";
    return;
  }
  // A library series for Netball 8-12 must exist for the covered half.
  const { count: netball } = await admin.from("programs").select("id", { count: "exact", head: true }).eq("sport", "Netball").is("centre_id", null);
  if (!netball) {
    skipReason = "The library has no Netball programme to attach.";
    return;
  }
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre", age_groups: ["8-12"] }).select("id").single();
  if (!centre) {
    skipReason = "Could not create the centre.";
    return;
  }
  const rows = [];
  for (let w = 0; w < 3; w++) {
    const d = new Date(`${term.start_date}T12:00:00+10:00`);
    d.setDate(d.getDate() + 1 + 7 * w);
    const date = d.toISOString().slice(0, 10);
    rows.push({ term_id: term.id, centre_id: centre.id, date, time: "10:00:00", duration_minutes: 45, sport: "Netball", status: "draft", needs_ops_review: false });
    rows.push({ term_id: term.id, centre_id: centre.id, date, time: "13:00:00", duration_minutes: 45, sport: GAP_SPORT, status: "draft", needs_ops_review: false });
  }
  const { data: ss, error } = await admin.from("sessions").insert(rows).select("id");
  if (error || !ss) {
    await admin.from("centres").delete().eq("id", centre.id);
    skipReason = `Could not create sessions: ${error?.message}`;
    return;
  }
  fx = { centreId: centre.id, sessions: ss.map((s) => s.id), adminEmail, termName: term.name };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (!fx) return;
  await admin.from("sessions").delete().in("id", fx.sessions);
  await admin.from("centres").delete().eq("id", fx.centreId);
});

test.describe("programmes page — term programming", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("the card shows progress, what the library can cover, and the gap with a prefilled generator link", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/admin/programs");
    await expect(page.getByRole("heading", { name: `${fx!.termName} programming` })).toBeVisible({ timeout: 90_000 });
    const main = page.locator("main");
    await expect(main).toContainText(/\d+ of \d+ sessions have a programme/);
    await expect(page.getByRole("button", { name: /Auto-programme \d+ sessions? from the library/ })).toBeVisible();
    await expect(main).toContainText(`${GAP_SPORT} · 8-12 · E2E Centre ${RUN} · 3 sessions`);
    const gap = main.locator("li", { hasText: GAP_SPORT }).getByRole("button", { name: /Generate a 10-week series/ });
    await expect(gap).toHaveAttribute("href", new RegExp(`/admin/programs/generate\\?sport=Quidditch\\+${RUN}&bands=8-12&weeks=10`));
    await gap.click();
    await expect(page).toHaveURL(/programs\/generate\?/);
    await expect(page.locator("main")).toContainText(GAP_SPORT, { timeout: 30_000 });
  });

  test("Auto-programme attaches library programmes to the covered sessions only", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/admin/programs");
    const before = await adminClient().from("sessions").select("sport, program_id").in("id", fx!.sessions);
    const netballUnprogrammed = before.data!.filter((s) => s.sport === "Netball" && !s.program_id).length;
    test.skip(netballUnprogrammed === 0, "already programmed");
    await page.getByRole("button", { name: /Auto-programme \d+ sessions? from the library/ }).click({ timeout: 90_000 });
    await expect(page.getByText(/\d+ sessions? programmed/)).toBeVisible({ timeout: 60_000 });
    const { data } = await adminClient().from("sessions").select("sport, program_id").in("id", fx!.sessions);
    expect(data!.filter((s) => s.sport === "Netball").every((s) => s.program_id)).toBe(true);
    expect(data!.filter((s) => s.sport === GAP_SPORT).every((s) => !s.program_id)).toBe(true);
  });
});
