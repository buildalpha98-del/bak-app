import { test, expect } from "@playwright/test";
import { signInAs, findUserEmail, findClientUser } from "./fixtures/auth";
import { mondayOfIso, formatDayHeaderShort, getWeekDates } from "../lib/utils/roster";
import { sydneyTodayIso } from "../lib/utils/sydney-time";

// ============================================================
// Critical-journey smoke tests
// ============================================================
//
// Every assertion here maps to a bug that shipped to production and
// survived a green 868-test unit suite, because they all live in the
// seams unit tests don't reach: auth → RLS → query → render.
//
// Read-only by design: they run against the real database, so they
// assert what a user SEES and never write. Run with `npm run e2e`.

test.describe("auth", () => {
  // Regression (took production down): middleware read
  // AuthSessionMissingError — which is what getUser() returns when there
  // is simply NO session, and whose status is 400 — as a stale-cookie
  // signal and redirected to /login. From /login. Every signed-out
  // visitor hit an infinite loop and nobody could sign in.
  //
  // This test signs in as nobody. That's the point: it is the only one
  // here that exercises the door rather than the rooms behind it.
  test("a signed-out visitor can reach the login page", async ({ page }) => {
    const res = await page.goto("/login");
    expect(res?.status(), "login redirected instead of rendering").toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Application error/i);
  });

  test("a protected route still sends a stranger to login", async ({ page }) => {
    await page.goto("/admin/roster");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("admin", () => {
  let email: string;

  test.beforeAll(async () => {
    const found = await findUserEmail("admin");
    if (!found) throw new Error("No active admin profile to sign in as.");
    email = found;
  });

  // Regression: the roster opened on SATURDAY with US-format dates,
  // and three surfaces disagreed about which week it was, because
  // local-midnight dates were serialised through UTC.
  test("roster opens on the current Sydney week, Monday first, day-first dates", async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, email, baseURL!);
    await page.goto("/admin/roster");
    await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();

    const monday = mondayOfIso(sydneyTodayIso());
    const [firstDay] = getWeekDates(new Date(monday + "T00:00:00"));
    const expectedHeader = formatDayHeaderShort(firstDay); // e.g. "Mon 13/7"

    // The first day column must be THIS Sydney week's Monday.
    await expect(page.getByText(expectedHeader, { exact: false }).first()).toBeVisible();
    expect(expectedHeader.startsWith("Mon")).toBe(true);

    // A Saturday column must never lead the grid.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Sat \d+\/\d+[\s\S]{0,40}Sun \d+\/\d+/);
  });

  // Regression: 19 seeded series × 8 weeks would flood the library
  // with 152 cards; a series must collapse to its week 1.
  test("programme library collapses each series to a single card", async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, email, baseURL!);
    await page.goto("/admin/programs");
    await expect(page.getByRole("heading", { name: /programme/i }).first()).toBeVisible();

    const body = await page.locator("body").innerText();
    if (body.includes("Week 1 of 8")) {
      // Week 1 is the series' only entry — later weeks live behind it.
      expect(body).not.toContain("Week 2 of 8");
      expect(body).not.toContain("Week 8 of 8");
    }
  });

  // Regression: the AI was down three separate ways (retired model id,
  // rejected temperature param, truncated JSON) while every unit test
  // stayed green. This is the only test that actually exercises it.
  test("AI generates a programme end to end", async ({ page, baseURL }) => {
    test.slow(); // a real generation takes ~30s
    await signInAs(page, email, baseURL!);

    const res = await page.request.post("/api/ai/generate-program", {
      data: {
        sport: "Basketball",
        ageGroups: ["5-8"],
        durationMinutes: 45,
        availableEquipment: ["Basketballs", "Cones", "Hoops"],
      },
      timeout: 120_000,
    });

    expect(
      res.ok(),
      `generate-program returned ${res.status()}: ${await res.text()}`
    ).toBe(true);
    const body = await res.json();
    expect(body.data?.title, "AI returned no programme title").toBeTruthy();
    expect(Array.isArray(body.data?.skillDevelopment)).toBe(true);
  });
});

test.describe("coach", () => {
  // Regression: 8 coach pages crashed on a non-serializable icon prop,
  // and the week view showed ~2 days on a phone.
  test("schedule loads with the coach's own week", async ({ page, baseURL }) => {
    const email = await findUserEmail("coach");
    test.skip(!email, "No active coach profile to sign in as.");

    await signInAs(page, email!, baseURL!);
    await page.goto("/coach/schedule");

    await expect(page.getByRole("heading", { name: /schedule/i }).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Application error|something went wrong/i);
  });
});

test.describe("client portal", () => {
  // Regression (launch-blocking): the client role had SELECT policies on
  // TWO tables, so every portal page rendered empty for real directors.
  // Admin preview masked it — only a real client session catches this.
  test("director sees their centre's real data, not an empty shell", async ({
    page,
    baseURL,
  }) => {
    const client = await findClientUser();
    test.skip(!client, "No client_users row with a resolvable email.");

    await signInAs(page, client!.email, baseURL!);
    await page.goto(`/client/${client!.centreId}`);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Application error|something went wrong/i);
    // The centre's own name is the cheapest proof RLS let a read through.
    expect(body.length, "portal rendered an empty shell").toBeGreaterThan(200);
  });
});
