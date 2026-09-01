import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  signInAs,
  findUserEmail,
  findClientUser,
  findUserWithoutFinancialAccess,
  adminClient,
  mintSession,
} from "./fixtures/auth";
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
// assert what a user SEES and never write. Two deliberate exceptions
// carry their own justification inline: the AI generation and the
// feedback-RLS probe (which deletes its row). Run with `npm run e2e`.

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

test.describe("financial gate", () => {
  // Regression: the gate worked — a denied user was correctly bounced to
  // /admin — but the landing then threw React #310, every time, for the
  // one person who hits it daily. The cause was an RSC redirect thrown
  // from the section layout: Next's own AppRouter renders a different
  // number of hooks when one lands mid-navigation. The gate now runs in
  // middleware so the browser gets an ordinary 307 instead.
  //
  // Asserts BOTH halves, because either alone is misleading: no error
  // but no redirect would mean payroll is readable; a redirect that
  // crashes on arrival is what we just fixed.
  for (const path of ["/admin/payroll", "/admin/invoicing", "/admin/analytics"]) {
    test(`${path} denies without a client-side crash`, async ({ page, baseURL }) => {
      test.slow();
      const email = await findUserWithoutFinancialAccess();
      test.skip(!email, "No active staff user with financial_access=false.");

      await signInAs(page, email!, baseURL!);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message.split(";")[0]));

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      expect(new URL(page.url()).pathname, "denied user must not stay on a financial page").toBe(
        "/admin"
      );
      expect(
        errors.filter((e) => e.includes("#310")),
        "React #310 on the denied landing"
      ).toEqual([]);
    });
  }
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

  // Curriculum build: the Auto-programme dialog's preview is a pure
  // dry-run — it must render (or say there's nothing to do) without
  // writing anything. We never click Apply here: this suite is
  // read-only against production.
  test("auto-programme preview renders without applying", async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, email, baseURL!);
    await page.goto("/admin/roster");
    await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();

    const trigger = page.getByRole("button", { name: /auto-programme/i });
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Preview loads: either group rows with session counts, or the
    // explicit "nothing to programme" state.
    await expect(
      page
        .getByText(/session(s)? will be programmed|Nothing to programme/i)
        .first()
    ).toBeVisible({ timeout: 20_000 });

    // Close WITHOUT applying.
    await page.getByRole("button", { name: "Cancel" }).click();
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

  // Regression: a director's FIRST rating on a session died with RLS
  // 42501 — feedback_ratings had UPDATE and SELECT policies for the
  // client role but no INSERT (added in migration 076) — and the server
  // action swallowed the error, so the portal thanked them while saving
  // nothing. Every unit test stayed green; only a real client-role
  // INSERT reaches this seam.
  //
  // Like the AI spec, this one earns its exception to "never write":
  // it inserts one rating with the exact shape submitSessionFeedback
  // sends, edits it (the 077 client UPDATE policy), and deletes it via
  // the service role in `finally`. No UI: the write is the seam that
  // broke, and the browse-then-rate page filters to completed sessions
  // the seed centres don't have.
  test("a director's first-time rating passes RLS (migrations 076/077)", async () => {
    const client = await findClientUser();
    test.skip(!client, "No client_users row with a resolvable email.");

    const admin = adminClient();
    // Any non-draft session works: 076 checks the session belongs to
    // the centre through the client's own read policy, which hides
    // drafts. The completed-only rule is app-tier, not RLS.
    const { data: session } = await admin
      .from("sessions")
      .select("id, coach_id, sport")
      .eq("centre_id", client!.centreId)
      .neq("status", "draft")
      .limit(1)
      .maybeSingle();
    test.skip(!session, "Client's centre has no non-draft session to rate.");

    const minted = await mintSession(client!.email);
    const asClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${minted.access_token}` } },
      }
    );

    let probeId: string | null = null;
    try {
      const { data: inserted, error: insErr } = await asClient
        .from("feedback_ratings")
        .insert({
          session_id: session!.id,
          centre_id: client!.centreId,
          coach_id: session!.coach_id ?? null,
          sport: session!.sport ?? null,
          rating: 5,
          comment: "e2e smoke probe (auto-deleted)",
          feedback_token: crypto.randomUUID(),
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      probeId = inserted?.id ?? null;

      expect(
        insErr?.code,
        "42501 on a client INSERT means migration 076 is not applied to this database"
      ).not.toBe("42501");
      expect(insErr, `first-time INSERT failed: ${insErr?.message}`).toBeNull();
      expect(probeId, "insert returned no row").toBeTruthy();

      // Editing the fresh rating is the other half of the portal flow
      // (077 replaced the open UPDATE policy with a centre-scoped one).
      const { data: updated, error: updErr } = await asClient
        .from("feedback_ratings")
        .update({ rating: 4, submitted_at: new Date().toISOString() })
        .eq("id", probeId!)
        .select("id");
      expect(updErr, `rating edit failed: ${updErr?.message}`).toBeNull();
      expect(updated?.length, "rating edit touched no rows").toBe(1);
    } finally {
      if (probeId) {
        await admin.from("feedback_ratings").delete().eq("id", probeId);
      }
    }
  });
});
