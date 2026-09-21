import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, mintSession, signInAs } from "./fixtures/auth";

// ============================================================
// The second coach on a shared shift (migrations 048, 068, 099)
// ============================================================
//
// `sessions.coach_id` is the LEAD only; every coach on a shift has a row
// in `session_coaches`. Until 099 the coach app and nine RLS policies
// asked for the lead, so a second coach had no shift, no session plan, no
// attendance list and no thread — three real shared shifts never reached
// their second coach. A unit suite cannot see this: it lives in auth →
// RLS → query → render.
//
// Throwaway everything: two coach accounts (lead + second), a third
// (bystander) to prove the door did not open too far, a draft term in
// 2031 with one confirmed shift and a programme. Deleting the term
// cascades the shift; the rest is removed in afterAll. No real coach,
// centre roster or programme is touched. No AI.

const RUN_ID = `e2e-${Date.now().toString(36)}`;
const TERM_NAME = `E2E Coach Term ${RUN_ID}`;
const SHIFT_DATE = "2031-02-12";
const PROGRAMME_TITLE = `E2E shared-shift plan ${RUN_ID}`;
const email = (who: string) => `${RUN_ID}-${who}@buildalphakids.app`;

type Fixture = {
  paidCentreId: string;
  paidSessionId: string;
  termId: string;
  sessionId: string;
  programId: string;
  centreId: string;
  users: Record<"lead" | "second" | "bystander", { id: string; email: string; name: string }>;
};
let fx: Fixture | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();
  const undo: Array<() => Promise<unknown>> = [];
  const fail = async (why: string) => {
    for (const u of undo.reverse()) await u();
    skipReason = why;
  };

  const { data: centre } = await admin.from("centres").select("id").order("created_at").limit(1).maybeSingle();
  const { data: staff } = await admin.from("profiles").select("id").eq("role", "admin").eq("status", "active").limit(1).maybeSingle();
  if (!centre || !staff) return fail("No centre or admin to hang the shift on.");

  const users = {} as Fixture["users"];
  for (const who of ["lead", "second", "bystander"] as const) {
    const name = `${RUN_ID} ${who}`;
    const { data: created, error } = await admin.auth.admin.createUser({ email: email(who), email_confirm: true });
    if (error || !created.user) return fail(`Could not create ${who}: ${error?.message}`);
    const id = created.user.id;
    undo.push(async () => admin.auth.admin.deleteUser(id));
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ id, email: email(who), name, role: "coach", status: "active" }, { onConflict: "id" });
    if (pErr) return fail(`Could not create ${who}'s profile: ${pErr.message}`);
    undo.push(async () => admin.from("profiles").delete().eq("id", id));
    users[who] = { id, email: email(who), name };
  }

  const { data: term, error: termErr } = await admin
    .from("terms")
    .insert({ name: TERM_NAME, start_date: "2031-02-03", end_date: "2031-04-11", year: 2031, status: "draft" })
    .select("id")
    .single();
  if (termErr || !term) return fail(`Could not create the term: ${termErr?.message}`);
  undo.push(async () => admin.from("terms").delete().eq("id", term.id));

  const section = (name: string) => ({ name, duration: 5, description: "d", instructions: ["i"], coachingTips: ["t"] });
  const { data: programme, error: progErr } = await admin
    .from("programs")
    .insert({
      subject: "pdhpe",
      sport: "Netball",
      age_groups: ["8-12"],
      age_group: "8-12",
      duration_minutes: 45,
      content_json: {
        title: PROGRAMME_TITLE,
        sport: "Netball",
        ageGroup: "8-12",
        duration: 45,
        objectives: ["o"],
        equipmentNeeded: ["Balls"],
        warmUp: section("Warm"),
        skillDevelopment: [{ ...section("Drill"), progressions: ["p"] }],
        modifiedGame: { ...section("Game"), rules: ["r"], variations: ["v"] },
        coolDown: section("Cool"),
      },
      equipment_used: ["Balls"],
      created_by: staff.id,
      version_number: 1,
    })
    .select("id")
    .single();
  if (progErr || !programme) return fail(`Could not create the programme: ${progErr?.message}`);
  undo.push(async () => admin.from("programs").delete().eq("id", programme.id));

  const { data: session, error: sessErr } = await admin
    .from("sessions")
    .insert({
      term_id: term.id,
      centre_id: centre.id,
      date: SHIFT_DATE,
      time: "09:15:00",
      duration_minutes: 45,
      sport: "Netball",
      status: "confirmed",
      program_id: programme.id,
    })
    .select("id")
    .single();
  if (sessErr || !session) return fail(`Could not create the shift: ${sessErr?.message}`);
  undo.push(async () => admin.from("sessions").delete().eq("id", session.id));

  // The one write path for who is on a shift (048).
  const { error: rpcErr } = await admin.rpc("set_session_coaches", {
    p_session_id: session.id,
    p_coaches: [
      { user_id: users.lead.id, is_primary: true },
      { user_id: users.second.id, is_primary: false },
    ],
    p_assigned_by: staff.id,
  });
  if (rpcErr) return fail(`Could not put the coaches on the shift: ${rpcErr.message}`);

  // ---- Pay (the lead is paid the shift's rate, the second coach their own) ----
  // A COMPLETED shift dated today so it falls in the current pay fortnight —
  // on a throwaway centre, so no real centre's portal or roster ever shows it.
  const { data: activeTerm } = await admin.from("terms").select("id").eq("status", "active").limit(1).maybeSingle();
  const { data: paidCentre, error: pcErr } = await admin
    .from("centres")
    .insert({ name: `E2E Centre ${RUN_ID}`, type: "childcare_centre" })
    .select("id")
    .single();
  if (pcErr || !paidCentre) return fail(`Could not create the throwaway centre: ${pcErr?.message}`);
  undo.push(async () => admin.from("centres").delete().eq("id", paidCentre.id));

  // Lead: $80 a session (their default). Second: $40 an hour at childcare.
  await admin.from("profiles").update({ default_pay_rate: 80 }).eq("id", users.lead.id);
  const { error: rateErr } = await admin
    .from("pay_rates")
    .insert({ user_id: users.second.id, session_type: "childcare", rate: 40, rate_unit: "per_hour", effective_from: "2026-01-01" });
  if (rateErr) return fail(`Could not set the second coach's rate: ${rateErr.message}`);
  undo.push(async () => admin.from("pay_rates").delete().eq("user_id", users.second.id));

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
  const { data: paid, error: paidErr } = await admin
    .from("sessions")
    .insert({
      term_id: activeTerm?.id ?? term.id,
      centre_id: paidCentre.id,
      date: today,
      time: "06:00:00",
      duration_minutes: 90,
      sport: "Netball",
      status: "draft",
    })
    .select("id")
    .single();
  if (paidErr || !paid) return fail(`Could not create the paid shift: ${paidErr?.message}`);
  undo.push(async () => admin.from("sessions").delete().eq("id", paid.id));
  const { error: crewErr } = await admin.rpc("set_session_coaches", {
    p_session_id: paid.id,
    p_coaches: [
      { user_id: users.lead.id, is_primary: true },
      { user_id: users.second.id, is_primary: false },
    ],
    p_assigned_by: staff.id,
  });
  if (crewErr) return fail(`Could not crew the paid shift: ${crewErr.message}`);
  await admin.from("sessions").update({ status: "completed" }).eq("id", paid.id);

  fx = {
    paidCentreId: paidCentre.id,
    paidSessionId: paid.id,
    termId: term.id,
    sessionId: session.id,
    programId: programme.id,
    centreId: centre.id,
    users,
  };
});

test.afterAll(async () => {
  const admin = adminClient();
  if (fx) {
    await admin.from("coach_invoices").delete().in("coach_id", Object.values(fx.users).map((u) => u.id));
    await admin.from("pay_rates").delete().in("user_id", Object.values(fx.users).map((u) => u.id));
    await admin.from("sessions").delete().eq("id", fx.paidSessionId);
    await admin.from("centres").delete().eq("id", fx.paidCentreId);
    await admin.from("shift_threads").delete().eq("session_id", fx.sessionId);
    await admin.from("sessions").delete().eq("id", fx.sessionId);
    await admin.from("programs").delete().eq("id", fx.programId);
  }
  await admin.from("terms").delete().eq("name", TERM_NAME);
  await admin.from("centres").delete().eq("name", `E2E Centre ${RUN_ID}`);
  for (const who of ["lead", "second", "bystander"] as const) {
    const { data } = await admin.from("profiles").select("id").eq("email", email(who)).maybeSingle();
    if (data) {
      await admin.from("profiles").delete().eq("id", data.id);
      await admin.auth.admin.deleteUser(data.id);
    }
  }
});

/** A Supabase client acting as that coach — RLS decides what comes back. */
async function asCoachClient(who: "lead" | "second" | "bystander") {
  const session = await mintSession(fx!.users[who].email);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

test.describe("shared shifts — the second coach (migration 099)", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("the 048 trigger still caches the lead on the shift", async () => {
    const { data } = await adminClient().from("sessions").select("coach_id").eq("id", fx!.sessionId).single();
    expect(data!.coach_id).toBe(fx!.users.lead.id);
  });

  test("RLS: the second coach reads the shift, its plan and the whole crew; a bystander reads none of it", async () => {
    for (const who of ["lead", "second"] as const) {
      const db = await asCoachClient(who);
      const { data: s } = await db.from("sessions").select("id").eq("id", fx!.sessionId);
      expect(s, `${who} sees the shift`).toHaveLength(1);
      const { data: p } = await db.from("programs").select("id").eq("id", fx!.programId);
      expect(p, `${who} sees the session plan`).toHaveLength(1);
      const { data: crew } = await db.from("session_coaches").select("user_id").eq("session_id", fx!.sessionId);
      expect(crew, `${who} sees both coaches`).toHaveLength(2);
    }
    const out = await asCoachClient("bystander");
    expect((await out.from("sessions").select("id").eq("id", fx!.sessionId)).data).toHaveLength(0);
    expect((await out.from("programs").select("id").eq("id", fx!.programId)).data).toHaveLength(0);
    expect((await out.from("session_coaches").select("user_id").eq("session_id", fx!.sessionId)).data).toHaveLength(0);
  });

  test("RLS: the second coach can post on the shift thread; a bystander cannot", async () => {
    const second = await asCoachClient("second");
    const ok = await second.from("shift_threads").insert({ session_id: fx!.sessionId, user_id: fx!.users.second.id, content: `hello ${RUN_ID}` });
    expect(ok.error).toBeNull();
    const lead = await asCoachClient("lead");
    const { data: seen } = await lead.from("shift_threads").select("content").eq("session_id", fx!.sessionId);
    expect(seen?.map((m) => m.content)).toContain(`hello ${RUN_ID}`);

    const out = await asCoachClient("bystander");
    const refused = await out.from("shift_threads").insert({ session_id: fx!.sessionId, user_id: fx!.users.bystander.id, content: "should not land" });
    expect(refused.error).not.toBeNull();
  });

  test("the second coach opens the shift: plan first, who they coach with, no lead-only buttons", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.second.email, baseURL!);
    await page.goto(`/coach/schedule/${fx!.sessionId}`);
    const body = page.locator("body");
    await expect(body).toContainText(PROGRAMME_TITLE, { timeout: 45_000 });
    await expect(body).toContainText(`Coaching with ${fx!.users.lead.name}`);
    await expect(body).toContainText(`${fx!.users.lead.name} leads this shift`);
    await expect(page.getByRole("button", { name: "Swap" })).toHaveCount(0);
  });

  test("the lead sees the same shift, leads it, and keeps the swap button", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.lead.email, baseURL!);
    await page.goto(`/coach/schedule/${fx!.sessionId}`);
    const body = page.locator("body");
    await expect(body).toContainText(`Coaching with ${fx!.users.second.name}`, { timeout: 45_000 });
    await expect(body).toContainText("You lead this shift.");
    await expect(page.getByRole("button", { name: "Swap" })).toHaveCount(1);
  });

  test("the shift is in the second coach's schedule — and not in a bystander's", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.second.email, baseURL!);
    await page.goto(`/coach/schedule?date=${SHIFT_DATE}`);
    const main = page.locator("main");
    await expect(main).toContainText("Netball", { timeout: 45_000 });
    await expect(main.locator(`a[href$="/coach/schedule/${fx!.sessionId}"]`)).toHaveCount(1);

    await page.context().clearCookies();
    await signInAs(page, fx!.users.bystander.email, baseURL!);
    await page.goto(`/coach/schedule?date=${SHIFT_DATE}`);
    await expect(page.locator("main")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator(`a[href$="/coach/schedule/${fx!.sessionId}"]`)).toHaveCount(0);
  });

  test("a coach who is not on the shift never gets the plan", async ({ page, baseURL }) => {
    // The app streams, so notFound() arrives as a 200 shell — assert what renders.
    await signInAs(page, fx!.users.bystander.email, baseURL!);
    await page.goto(`/coach/schedule/${fx!.sessionId}`);
    await expect(page.locator("body")).toContainText(/not found|could not be found|404/i, { timeout: 45_000 });
    await expect(page.locator("body")).not.toContainText(PROGRAMME_TITLE);
  });

  // ---------------- pay: the second coach is paid their own rate ----------------

  test("the shift stores the lead's rate — which is exactly why it cannot price the second coach", async () => {
    const { data } = await adminClient().from("sessions").select("pay_rate_resolved").eq("id", fx!.paidSessionId).single();
    expect(Number(data!.pay_rate_resolved)).toBe(80);
  });

  test("the second coach's invoicing page lists the shared shift at THEIR rate: $40/h × 1.5h = $60", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.second.email, baseURL!);
    await page.goto("/coach/invoicing");
    const main = page.locator("main");
    await expect(main).toContainText(`E2E Centre ${RUN_ID}`, { timeout: 60_000 });
    await expect(main).toContainText("60.00");
    await expect(main).not.toContainText("80.00"); // never the lead's
  });

  test("the lead's page lists the same shift at the shift's rate: $80", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.lead.email, baseURL!);
    await page.goto("/coach/invoicing");
    const main = page.locator("main");
    await expect(main).toContainText(`E2E Centre ${RUN_ID}`, { timeout: 60_000 });
    await expect(main).toContainText("80.00");
    await expect(main).not.toContainText("60.00");
  });

  test("the session screen shows each coach their own rate, never the other's", async ({ page, baseURL }) => {
    await signInAs(page, fx!.users.second.email, baseURL!);
    await page.goto(`/coach/schedule/${fx!.paidSessionId}`);
    const body = page.locator("body");
    await expect(body).toContainText(`Coaching with ${fx!.users.lead.name}`, { timeout: 45_000 });
    await expect(body).toContainText("$40.00");
    await expect(body).not.toContainText("$80.00");
  });
});
