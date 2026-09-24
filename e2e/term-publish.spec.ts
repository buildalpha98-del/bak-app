import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// Assign, publish and chase a whole term from the term board
// ============================================================
//
// Pins three things that were broken in production:
//   * publishing left shifts at `published`, which a coach cannot confirm
//     (confirmShift accepts only pending_confirmation) — ops bulk-confirmed
//     on coaches' behalf instead;
//   * the AI solver's coach query was refused by PostgREST (two foreign
//     keys from compliance_docs to profiles), so every run said "no
//     coaches available";
//   * nothing sent a term's shifts to coaches in one go.
//
// Throwaway: two coaches with weekday availability and valid certs, a
// centre, a 2031 draft term with six drafts (three with coach A, three
// with nobody). Publishing must notify coach A once and coach B never.
// AI assign may pick any eligible coach but sends no notification.
// Everything is deleted in afterAll.

const RUN = `e2e-${Date.now().toString(36)}`;
const TERM_NAME = `E2E Publish ${RUN}`;
const email = (w: string) => `${RUN}-${w}@buildalphakids.app`;

type Fx = { termId: string; centreId: string; a: { id: string; email: string; name: string }; b: { id: string; email: string; name: string }; firstWithCoach: string; adminEmail: string };
let fx: Fx | null = null;
let skipReason: string | null = null;
const notifications = async (uid: string) => (await adminClient().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid)).count ?? 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  const { data: staff } = adminEmail ? await admin.from("profiles").select("id").eq("email", adminEmail).single() : { data: null };
  if (!adminEmail || !staff) {
    skipReason = "No active admin.";
    return;
  }
  const undo: Array<() => Promise<unknown>> = [];
  const fail = async (why: string) => {
    for (const u of undo.reverse()) await u();
    skipReason = why;
  };
  const coaches: Array<{ id: string; email: string; name: string }> = [];
  for (const w of ["a", "b"]) {
    const { data: u, error } = await admin.auth.admin.createUser({ email: email(w), email_confirm: true });
    if (error || !u.user) return fail(`Could not create coach ${w}: ${error?.message}`);
    const id = u.user.id;
    undo.push(async () => admin.auth.admin.deleteUser(id));
    await admin.from("profiles").upsert({ id, email: email(w), name: `${RUN} coach ${w.toUpperCase()}`, role: "coach", status: "active" });
    undo.push(async () => admin.from("profiles").delete().eq("id", id));
    await admin.from("compliance_docs").insert([
      { user_id: id, doc_type: "wwcc", status: "verified", expiry_date: "2035-01-01" },
      { user_id: id, doc_type: "first_aid", status: "verified", expiry_date: "2035-01-01" },
    ]);
    await admin.from("availability_slots").insert([1, 2, 3, 4, 5].map((d) => ({ user_id: id, day_of_week: d, start_time: "08:00:00", end_time: "16:30:00" })));
    coaches.push({ id, email: email(w), name: `${RUN} coach ${w.toUpperCase()}` });
  }
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre" }).select("id").single();
  if (!centre) return fail("Could not create the centre.");
  undo.push(async () => admin.from("centres").delete().eq("id", centre.id));
  const { data: term } = await admin.from("terms").insert({ name: TERM_NAME, start_date: "2031-02-03", end_date: "2031-02-21", year: 2031, status: "draft" }).select("id").single();
  if (!term) return fail("Could not create the term.");
  undo.push(async () => admin.from("terms").delete().eq("id", term.id));
  const rows = [];
  for (const d of ["2031-02-04", "2031-02-11", "2031-02-18"]) {
    rows.push({ term_id: term.id, centre_id: centre.id, date: d, time: "10:00:00", duration_minutes: 45, sport: "Soccer", status: "draft", coach_id: coaches[0].id });
    rows.push({ term_id: term.id, centre_id: centre.id, date: d, time: "13:00:00", duration_minutes: 45, sport: "Netball", status: "draft" });
  }
  await admin.from("sessions").insert(rows);
  const { data: withCoach } = await admin.from("sessions").select("id").eq("term_id", term.id).not("coach_id", "is", null).order("date");
  for (const s of withCoach ?? []) {
    await admin.rpc("set_session_coaches", { p_session_id: s.id, p_coaches: [{ user_id: coaches[0].id, is_primary: true }], p_assigned_by: staff.id });
  }
  fx = { termId: term.id, centreId: centre.id, a: coaches[0], b: coaches[1], firstWithCoach: withCoach![0].id, adminEmail };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (fx) {
    await admin.from("scheduling_runs").delete().eq("term_id", fx.termId);
    await admin.from("terms").delete().eq("id", fx.termId);
    await admin.from("centres").delete().eq("id", fx.centreId);
    for (const c of [fx.a, fx.b]) {
      await admin.from("notifications").delete().eq("user_id", c.id);
      await admin.from("profiles").delete().eq("id", c.id);
      await admin.auth.admin.deleteUser(c.id);
    }
  }
  await admin.from("terms").delete().eq("name", TERM_NAME);
});

test.describe("the term board — assign, publish, chase", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });
  let a0 = 0;
  let b0 = 0;

  test("publishing sends shifts with a coach to the coach and merely publishes the rest", async ({ page, baseURL }) => {
    a0 = await notifications(fx!.a.id);
    b0 = await notifications(fx!.b.id);
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto(`/admin/roster/coverage?term=${fx!.termId}`);
    await expect(page.getByRole("heading", { name: "Term board" })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("main")).toContainText(/No coach\s*3/);
    await page.getByRole("button", { name: /Publish 6 drafts to coaches/ }).click();
    await expect(page.getByText(/3 shifts sent to 1 coach to confirm; 3 with no coach published to centres/)).toBeVisible({ timeout: 60_000 });

    const { data } = await adminClient().from("sessions").select("status, coach_id").eq("term_id", fx!.termId);
    expect(data!.filter((s) => s.status === "pending_confirmation").length).toBe(3);
    expect(data!.filter((s) => s.status === "published" && !s.coach_id).length).toBe(3);
    expect(await notifications(fx!.a.id)).toBe(a0 + 1);
    expect(await notifications(fx!.b.id)).toBe(b0);
  });

  test("the coach can confirm from the app — the dead end is gone", async ({ page, baseURL }) => {
    await signInAs(page, fx!.a.email, baseURL!);
    await page.goto(`/coach/schedule/${fx!.firstWithCoach}`);
    await page.getByRole("button", { name: "Confirm", exact: true }).click({ timeout: 60_000 });
    await expect(page.getByText("Shift confirmed.")).toBeVisible({ timeout: 30_000 });
    const { data } = await adminClient().from("sessions").select("status").eq("id", fx!.firstWithCoach).single();
    expect(data!.status).toBe("confirmed");
  });

  test("the board names who is still to confirm and reminds them once", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto(`/admin/roster/coverage?term=${fx!.termId}`);
    const remind = page.getByRole("button", { name: /Remind 1 coach to confirm/ });
    await expect(remind).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("main")).toContainText(`Waiting on: ${fx!.a.name} (2, first 11 Feb)`);
    const before = await notifications(fx!.a.id);
    await remind.click();
    await expect(page.getByText("Reminded 1 coach.")).toBeVisible({ timeout: 30_000 });
    expect(await notifications(fx!.a.id)).toBe(before + 1);
    expect(await notifications(fx!.b.id)).toBe(b0);
  });

  test("AI assign fills every unassigned session across the term, one solver run per week", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto(`/admin/roster/coverage?term=${fx!.termId}`);
    await page.getByRole("button", { name: /AI assign 3 unassigned/ }).click({ timeout: 60_000 });
    await expect(page.getByText(/3 sessions assigned/)).toBeVisible({ timeout: 180_000 });
    const admin = adminClient();
    const { data } = await admin.from("sessions").select("coach_id").eq("term_id", fx!.termId);
    expect(data!.every((s) => s.coach_id)).toBe(true);
    const { count } = await admin.from("scheduling_runs").select("id", { count: "exact", head: true }).eq("term_id", fx!.termId);
    expect(count).toBe(3);
  });
});
