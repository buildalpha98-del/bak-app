import { test, expect, type Page } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";

// ============================================================
// "Needs your decision" — hours adjustments, review flags, change requests
// ============================================================
//
// Pins the whole hours-adjustment path, which had FOUR breaks in
// production: the coach's form was on no page; the request insert set a
// `status` column tasks no longer has and no `column_id` it requires; a
// coach has no INSERT policy on tasks (the write now goes through the
// admin client after the coach's own checks); and nothing approved it.
// Plus the two other asks that had no staff screen: a session the app
// flagged for review and a centre's change request.
//
// Throwaway coach, centre, director and three sessions this week;
// everything deleted in afterAll.

const RUN = `e2e-${Date.now().toString(36)}`;
type Fx = { coach: { id: string; email: string; name: string }; centreId: string; cuId: string; cuAuthId: string; sessions: string[]; adminEmail: string; movedTo: string };
let fx: Fx | null = null;
let skipReason: string | null = null;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${today}T12:00:00+10:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  const { data: staff } = adminEmail ? await admin.from("profiles").select("id").eq("email", adminEmail).single() : { data: null };
  const { data: term } = await admin.from("terms").select("id").eq("status", "active").limit(1).maybeSingle();
  if (!adminEmail || !staff || !term) {
    skipReason = "No active admin or term.";
    return;
  }
  const undo: Array<() => Promise<unknown>> = [];
  const fail = async (why: string) => {
    for (const u of undo.reverse()) await u();
    skipReason = why;
  };
  const { data: u, error: uErr } = await admin.auth.admin.createUser({ email: `${RUN}-coach@buildalphakids.app`, email_confirm: true });
  if (uErr || !u.user) return fail(`coach: ${uErr?.message}`);
  const coach = { id: u.user.id, email: `${RUN}-coach@buildalphakids.app`, name: `${RUN} Coach` };
  undo.push(async () => admin.auth.admin.deleteUser(coach.id));
  await admin.from("profiles").upsert({ id: coach.id, email: coach.email, name: coach.name, role: "coach", status: "active", default_pay_rate: 60 });
  undo.push(async () => admin.from("profiles").delete().eq("id", coach.id));
  const { data: centre } = await admin.from("centres").insert({ name: `E2E Centre ${RUN}`, type: "childcare_centre" }).select("id").single();
  if (!centre) return fail("centre");
  undo.push(async () => admin.from("centres").delete().eq("id", centre.id));
  const { data: cuAuth, error: cuAuthErr } = await admin.auth.admin.createUser({ email: `${RUN}-director@buildalphakids.app`, email_confirm: true });
  if (cuAuthErr || !cuAuth.user) return fail(`director: ${cuAuthErr?.message}`);
  undo.push(async () => admin.auth.admin.deleteUser(cuAuth.user!.id));
  const { data: cu } = await admin.from("client_users").insert({ user_id: cuAuth.user.id, centre_id: centre.id, name: `${RUN} Director`, email: `${RUN}-director@buildalphakids.app`, is_primary: true }).select("id").single();
  if (!cu) return fail("client user");
  undo.push(async () => admin.from("client_users").delete().eq("id", cu.id));
  const base = { term_id: term.id, centre_id: centre.id, time: "10:00:00", duration_minutes: 45, sport: "Soccer", coach_id: coach.id, needs_ops_review: false };
  const { data: ss, error: ssErr } = await admin
    .from("sessions")
    .insert([
      { ...base, date: daysAgo(3), status: "completed", actual_duration_minutes: 45 },
      { ...base, date: daysAgo(2), status: "completed", actual_duration_minutes: 75, needs_ops_review: true },
      { ...base, date: daysAgo(-7), status: "confirmed" },
    ])
    .select("id, date")
    .order("date");
  if (ssErr || !ss) return fail(`sessions: ${ssErr?.message}`);
  undo.push(async () => admin.from("sessions").delete().in("id", ss.map((s) => s.id)));
  for (const s of ss) await admin.rpc("set_session_coaches", { p_session_id: s.id, p_coaches: [{ user_id: coach.id, is_primary: true }], p_assigned_by: staff.id });
  const movedTo = daysAgo(-8);
  await admin.from("session_change_requests").insert({ session_id: ss[2].id, centre_id: centre.id, requested_by: cu.id, request_type: "reschedule", requested_date: movedTo, requested_time: "11:00:00", reason: "Photo day clash" });
  fx = { coach, centreId: centre.id, cuId: cu.id, cuAuthId: cuAuth.user.id, sessions: ss.map((s) => s.id), adminEmail, movedTo };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (!fx) return;
  await admin.from("session_change_requests").delete().in("session_id", fx.sessions);
  await admin.from("tasks").delete().in("linked_entity_id", fx.sessions);
  await admin.from("sessions").delete().in("id", fx.sessions);
  await admin.from("client_user_centres").delete().eq("client_user_id", fx.cuId);
  await admin.from("client_users").delete().eq("id", fx.cuId);
  await admin.auth.admin.deleteUser(fx.cuAuthId);
  await admin.from("centres").delete().eq("id", fx.centreId);
  await admin.from("notifications").delete().eq("user_id", fx.coach.id);
  await admin.from("profiles").delete().eq("id", fx.coach.id);
  await admin.auth.admin.deleteUser(fx.coach.id);
});

const widget = (page: Page) => page.locator(".rounded-2xl").filter({ hasText: "Needs your decision" }).first();

test.describe("ops dashboard — needs your decision", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });
  let taskId = "";

  test("a coach's hours request goes through the real form and lands as an open task", async ({ page, baseURL }) => {
    await signInAs(page, fx!.coach.email, baseURL!);
    await page.goto("/coach/invoicing");
    await expect(page.getByRole("heading", { name: "Session Hours" })).toBeVisible({ timeout: 60_000 });
    const adjust = page.getByRole("button", { name: "Adjust" }).last();
    await adjust.scrollIntoViewIfNeeded();
    await adjust.click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByRole("heading", { name: "Request Hours Adjustment" })).toBeVisible();
    await dlg.locator("#adj-duration").fill("60");
    await dlg.locator("#adj-reason").fill("Stayed for pickup");
    await dlg.getByRole("button", { name: "Submit Request" }).click();
    await expect(page.getByText("Adjustment request submitted for ops review.")).toBeVisible({ timeout: 30_000 });
    const { data } = await adminClient().from("tasks").select("id, column:task_columns!column_id(is_final)").like("title", `Hours adjustment: ${fx!.coach.name}%`);
    expect(data).toHaveLength(1);
    expect((data![0].column as unknown as { is_final: boolean }).is_final).toBe(false);
    taskId = data![0].id as string;
  });

  test("ops see all three asks in one queue, counted on the pulse strip", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/ops");
    const w = widget(page);
    await expect(w).toBeVisible({ timeout: 60_000 });
    await expect(w).toContainText(`${fx!.coach.name} asks for 60 min, rostered 45`);
    await expect(w).toContainText(`E2E Centre ${RUN} asks to move Soccer`);
    await expect(w).toContainText("Ran 30 min over");
    // The number counts up on mount; the link's accessible name settles at the total.
    await expect(page.getByRole("link", { name: /^([3-9]|\d{2,}) waiting on your decision$/ })).toBeVisible({ timeout: 15_000 });
  });

  test("approve the hours: the session pays 60 min and the task closes", async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/ops");
    const row = widget(page).locator("li", { hasText: `${fx!.coach.name} asks for 60 min` });
    await row.getByRole("button", { name: "Approve" }).click({ timeout: 60_000 });
    await expect(page.getByText("Approved 60 min")).toBeVisible({ timeout: 90_000 });
    const admin = adminClient();
    const { data: s } = await admin.from("sessions").select("actual_duration_minutes, needs_ops_review").eq("id", fx!.sessions[0]).single();
    expect(s).toMatchObject({ actual_duration_minutes: 60, needs_ops_review: false });
    const { data: t } = await admin.from("tasks").select("column:task_columns!column_id(is_final)").eq("id", taskId).single();
    expect((t!.column as unknown as { is_final: boolean }).is_final).toBe(true);
  });

  test("approve the centre's move: the session moves to the requested day and time", async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/ops");
    const row = widget(page).locator("li", { hasText: "asks to move Soccer" });
    await row.getByRole("button", { name: "Approve" }).click({ timeout: 60_000 });
    await expect(page.getByText("Session moved")).toBeVisible({ timeout: 90_000 });
    const { data: s } = await adminClient().from("sessions").select("date, time").eq("id", fx!.sessions[2]).single();
    expect(s!.date).toBe(fx!.movedTo);
    expect(String(s!.time)).toMatch(/^11:00/);
  });

  test("keep a ran-long session at rostered: pay minutes back to 45, flag cleared, queue empty of ours", async ({ page, baseURL }) => {
    // Two dashboard loads late in a long run — the command centre fans
    // out a dozen queries and a busy dev server has blown 60s once.
    test.setTimeout(180_000);
    await signInAs(page, fx!.adminEmail, baseURL!);
    await page.goto("/ops");
    const row = widget(page).locator("li", { hasText: "Ran 30 min over" }).filter({ hasText: `E2E Centre ${RUN}` });
    await row.getByRole("button", { name: "Keep rostered" }).click({ timeout: 60_000 });
    await expect(page.getByText("Kept at 45 min")).toBeVisible({ timeout: 90_000 });
    const { data: s } = await adminClient().from("sessions").select("actual_duration_minutes, needs_ops_review").eq("id", fx!.sessions[1]).single();
    expect(s).toMatchObject({ actual_duration_minutes: 45, needs_ops_review: false });
    await page.goto("/ops");
    await expect(widget(page)).toBeVisible({ timeout: 60_000 });
    await expect(widget(page)).not.toContainText(RUN);
  });
});
