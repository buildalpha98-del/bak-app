import { test, expect } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// A coach sets their own availability, and the roster can then place them
// ============================================================
//
// The solver's first hard constraint is an availability slot covering the
// shift; until now only staff could enter slots, and most real coaches
// had none. Throwaway coach (valid certs, no slots), throwaway centre,
// one draft shift on a Tuesday in a 2031 draft term. Before saving
// availability the solver leaves the shift unassigned; after the coach
// ticks Mon–Fri on their profile, AI assign places them. Deleted in
// afterAll.

const RUN = `e2e-${Date.now().toString(36)}`;
let fx: { coach: { id: string; email: string }; centreId: string; termId: string; sessionId: string; adminEmail: string } | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  if (!adminEmail) {
    skipReason = "No active admin.";
    return;
  }
  const { data: u, error } = await admin.auth.admin.createUser({ email: `${RUN}-coach@buildalphakids.app`, email_confirm: true });
  if (error || !u.user) {
    skipReason = `coach: ${error?.message}`;
    return;
  }
  const coach = { id: u.user.id, email: `${RUN}-coach@buildalphakids.app` };
  await admin.from("profiles").upsert({ id: coach.id, email: coach.email, name: `${RUN} Coach`, role: "coach", status: "active" });
  await admin.from("compliance_docs").insert([
    { user_id: coach.id, doc_type: "wwcc", status: "verified", expiry_date: "2035-01-01" },
    { user_id: coach.id, doc_type: "first_aid", status: "verified", expiry_date: "2035-01-01" },
  ]);
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre" }).select("id").single();
  const { data: term } = await admin.from("terms").insert({ name: `E2E Avail ${RUN}`, start_date: "2031-02-03", end_date: "2031-02-07", year: 2031, status: "draft" }).select("id").single();
  if (!centre || !term) {
    skipReason = "Could not create centre/term.";
    return;
  }
  const { data: s } = await admin
    .from("sessions")
    .insert({ term_id: term.id, centre_id: centre.id, date: "2031-02-04", time: "10:00:00", duration_minutes: 45, sport: "Soccer", status: "draft", needs_ops_review: false })
    .select("id")
    .single();
  fx = { coach, centreId: centre.id, termId: term.id, sessionId: s!.id, adminEmail };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (!fx) return;
  await admin.from("scheduling_runs").delete().eq("term_id", fx.termId);
  await admin.from("terms").delete().eq("id", fx.termId); // cascades the session
  await admin.from("centres").delete().eq("id", fx.centreId);
  await admin.from("profiles").delete().eq("id", fx.coach.id); // cascades slots + docs
  await admin.auth.admin.deleteUser(fx.coach.id);
});

async function solve(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/scheduling/generate", { data: { weekStart: "2031-02-03", weekEnd: "2031-02-07", termId: fx!.termId, keepExisting: true } });
  return (await res.json()) as { assignments: Array<{ session_id: string; assigned_coach_id: string | null; eligible_coaches: Array<{ coach_id: string }> }> };
}

test.describe("coach availability", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("with no availability the solver cannot place the coach", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    const { assignments } = await solve(page);
    const a = assignments.find((x) => x.session_id === fx!.sessionId)!;
    expect(a.eligible_coaches.some((c) => c.coach_id === fx!.coach.id)).toBe(false);
    await adminClient().from("sessions").update({ coach_id: null }).eq("id", fx!.sessionId);
    await adminClient().from("session_coaches").delete().eq("session_id", fx!.sessionId);
  });

  test("the coach ticks Mon–Fri on their profile and it saves as their slots", async ({ page, baseURL }) => {
    await signInAs(page, fx!.coach.email, baseURL!);
    await page.goto("/coach/profile");
    await expect(page.getByRole("heading", { name: "My Availability" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/haven't set any availability yet/)).toBeVisible();
    for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      await page.getByRole("checkbox", { name: `Available ${d}` }).click();
    }
    await page.getByLabel("Tuesday start").fill("09:00");
    await page.getByLabel("Tuesday finish").fill("15:00");
    await page.getByRole("button", { name: "Save availability" }).click();
    await expect(page.getByText("Saved — available 5 days a week.")).toBeVisible({ timeout: 30_000 });
    const { data } = await adminClient().from("availability_slots").select("day_of_week, start_time, end_time").eq("user_id", fx!.coach.id).order("day_of_week");
    expect(data!.map((s) => s.day_of_week)).toEqual([1, 2, 3, 4, 5]);
    expect(String(data![1].start_time)).toMatch(/^09:00/);
    expect(String(data![1].end_time)).toMatch(/^15:00/);
  });

  test("now the solver places them on the Tuesday shift", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    const { assignments } = await solve(page);
    const a = assignments.find((x) => x.session_id === fx!.sessionId)!;
    expect(a.eligible_coaches.some((c) => c.coach_id === fx!.coach.id)).toBe(true);
  });

  test("unticking a day removes it; the editor reloads what was saved", async ({ page, baseURL }) => {
    await signInAs(page, fx!.coach.email, baseURL!);
    await page.goto("/coach/profile");
    const tue = page.getByRole("checkbox", { name: "Available Tuesday" });
    await expect(tue).toBeChecked({ timeout: 60_000 });
    await expect(page.getByLabel("Tuesday start")).toHaveValue("09:00");
    await tue.click();
    await page.getByRole("button", { name: "Save availability" }).click();
    await expect(page.getByText("Saved — available 4 days a week.")).toBeVisible({ timeout: 30_000 });
    const { data } = await adminClient().from("availability_slots").select("day_of_week").eq("user_id", fx!.coach.id);
    expect(data!.map((s) => s.day_of_week).sort()).toEqual([1, 3, 4, 5]);
  });
});
