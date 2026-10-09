import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// An ops member who also coaches (migration 101, profiles.also_coaches)
// ============================================================
//
// A profile has one role, and "who can be put on a shift" was role =
// coach in thirty queries — so making Carla ops took her off every
// coach list. The flag puts her back in the pool and opens the coach
// screens for her own shifts. This pins the seam a unit suite cannot
// reach: the middleware's role hint, the real `.or()` filter, the nav.
//
// Throwaway: an ops member who coaches (valid certs, Mon–Fri slots), an
// ops member who doesn't, a centre, a draft 2031 term with one Tuesday
// shift. Deleted in afterAll. No AI.

const RUN = `e2e-${Date.now().toString(36)}`;
type Person = { id: string; email: string };
let fx: { opsCoach: Person; opsOnly: Person; centreId: string; termId: string; sessionId: string; adminEmail: string } | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  if (!adminEmail) {
    skipReason = "No active admin.";
    return;
  }
  const people: Record<"opsCoach" | "opsOnly", Person> = {} as never;
  for (const who of ["opsCoach", "opsOnly"] as const) {
    const email = `${RUN}-${who.toLowerCase()}@buildalphakids.app`;
    const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !u.user) {
      skipReason = `${who}: ${error?.message}`;
      return;
    }
    people[who] = { id: u.user.id, email };
    await admin.from("profiles").upsert({
      id: u.user.id,
      email,
      name: `${RUN} ${who}`,
      role: "ops",
      status: "active",
      also_coaches: who === "opsCoach",
    });
  }
  const c = people.opsCoach.id;
  await admin.from("compliance_docs").insert([
    { user_id: c, doc_type: "wwcc", status: "verified", expiry_date: "2035-01-01" },
    { user_id: c, doc_type: "first_aid", status: "verified", expiry_date: "2035-01-01" },
  ]);
  await admin.from("availability_slots").insert(
    [1, 2, 3, 4, 5].map((d) => ({ user_id: c, day_of_week: d, start_time: "08:00:00", end_time: "16:30:00", location_preferences: [] })),
  );
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre" }).select("id").single();
  const { data: term } = await admin
    .from("terms")
    .insert({ name: `E2E Ops Coach ${RUN}`, start_date: "2031-02-03", end_date: "2031-02-07", year: 2031, status: "draft" })
    .select("id")
    .single();
  if (!centre || !term) {
    skipReason = "Could not create centre/term.";
    return;
  }
  const { data: s } = await admin
    .from("sessions")
    .insert({ term_id: term.id, centre_id: centre.id, date: "2031-02-04", time: "10:00:00", duration_minutes: 45, sport: "Soccer", status: "draft", needs_ops_review: false })
    .select("id")
    .single();
  fx = { ...people, centreId: centre.id, termId: term.id, sessionId: s!.id, adminEmail };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (!fx) return;
  await admin.from("scheduling_runs").delete().eq("term_id", fx.termId);
  await admin.from("terms").delete().eq("id", fx.termId); // cascades the session
  await admin.from("centres").delete().eq("id", fx.centreId);
  for (const p of [fx.opsCoach, fx.opsOnly]) {
    await admin.from("profiles").delete().eq("id", p.id); // cascades slots + docs
    await admin.auth.admin.deleteUser(p.id);
  }
});

test.describe("ops member who also coaches", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("opens the coach screens, with the coach nav and a way back to ops", async ({ page, baseURL }) => {
    await signInAs(page, fx!.opsCoach.email, baseURL!);
    await page.goto("/ops");
    await expect(page).toHaveURL(/\/ops$/);
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "My coaching" })).toBeVisible({ timeout: 60_000 });

    await sidebar.getByRole("link", { name: "My coaching" }).click();
    await expect(page).toHaveURL(/\/coach$/, { timeout: 60_000 });
    await expect(sidebar.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Operations" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Roster" })).toHaveCount(0);

    // Profile is where availability lives — the roster needs it.
    await page.goto("/coach/profile");
    await expect(page).toHaveURL(/\/coach\/profile$/);
    await expect(page.getByRole("heading", { name: "My Availability" })).toBeVisible({ timeout: 60_000 });
  });

  test("an ops member who doesn't coach is sent back to ops", async ({ page, baseURL }) => {
    await signInAs(page, fx!.opsOnly.email, baseURL!);
    await page.goto("/coach");
    await expect(page).toHaveURL(/\/ops$/, { timeout: 60_000 });
    await expect(page.locator("aside").getByRole("link", { name: "My coaching" })).toHaveCount(0);
  });

  test("the solver counts the ops coach as eligible, and not the other", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    const res = await page.request.post("/api/scheduling/generate", {
      data: { weekStart: "2031-02-03", weekEnd: "2031-02-07", termId: fx!.termId, keepExisting: true },
    });
    const { assignments } = (await res.json()) as {
      assignments: Array<{ session_id: string; eligible_coaches: Array<{ coach_id: string }> }>;
    };
    const a = assignments.find((x) => x.session_id === fx!.sessionId)!;
    const ids = a.eligible_coaches.map((e) => e.coach_id);
    expect(ids).toContain(fx!.opsCoach.id);
    expect(ids).not.toContain(fx!.opsOnly.id);
  });
});
