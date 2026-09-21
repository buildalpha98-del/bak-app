import { test, expect, type Page } from "@playwright/test";
import { adminClient, findUserEmail, signInAs } from "./fixtures/auth";
import { yearGroupToAgeBand, yearGroupToStage } from "../lib/schools/year-groups";
import pdhpe2024 from "../lib/curriculum/data/nsw-pdhpe-2024.json";

// ============================================================
// The school planning seam — plan → roster → lesson → report card
// ============================================================
//
// September 2026 shipped six things that each only exist where auth, RLS,
// a server action or route, and the render meet: term plans edited in
// place (096), the school dashboard, report-card comments (097), the
// approved PDHPE plan driving the roster (098), PDHPE health lessons, and
// planning a coming term. Each was proved by an untracked rehearsal
// script against a throwaway school; this spec is those checks, tracked.
//
// Self-provisioning, like teacher-seam: on the first NSW school with a
// class list it creates a throwaway colleague (non-primary portal user
// who sees every class), a DRAFT term far in the future, and — in that
// term only — an approved PDHPE plan, one rostered session, the
// plan-written programme and a health lesson. Nothing of the school's
// own is read-modified: the one write outside the throwaway term is a
// report-card comment on a student who has none, deleted in afterAll.
// Deleting the term cascades the plan and the session.
//
// NO AI: every generation path is exercised up to the model and no
// further — the plan→roster route through its reuse branch, the lesson
// and term-plan routes through their refusals. The billed generation
// stays the smoke suite's one.

const RUN_ID = `e2e-${Date.now().toString(36)}`;
const COLLEAGUE_EMAIL = `${RUN_ID}-colleague@buildalphakids.app`;
const TERM_NAME = `E2E Term ${RUN_ID}`;
const TERM_START = "2031-02-03"; // a Monday, in 2024-syllabus territory
const TERM_END = "2031-04-11";
const SESSION_DATE = "2031-02-12"; // week 2
const PROGRAMME_TITLE = `E2E plan-written session ${RUN_ID}`;
const LESSON_TITLE = `E2E health lesson ${RUN_ID}`;
const CLASSROOM_STRAND = "Personal development and health — Identity, health and wellbeing";
const MOVEMENT_STRAND = "Physical education — Movement skill and physical activity";

type Fixture = {
  centreId: string;
  cls: { id: string; name: string; yearGroup: string };
  ageBand: string;
  child: { id: string; name: string } | null;
  activeTermId: string;
  activeTermName: string;
  completedTermId: string | null;
  termId: string;
  planId: string;
  sessionId: string;
  programId: string;
  lessonId: string;
  clientUserId: string;
  userId: string;
  adminEmail: string;
};

let fx: Fixture | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

function programmeContent(title: string, sport: string, ageGroup: string) {
  const section = (name: string) => ({ name, duration: 5, description: `${name} description`, instructions: ["Step one"], coachingTips: ["Tip"] });
  return {
    title,
    subject: "pdhpe",
    sport,
    ageGroup,
    duration: 45,
    objectives: ["Objective one"],
    equipmentNeeded: ["Whiteboard"],
    warmUp: section("Opening"),
    skillDevelopment: [{ ...section("Main activity"), progressions: ["Extend"] }],
    modifiedGame: { ...section("Applied task"), rules: ["Rule"], variations: ["Variation"] },
    coolDown: section("Closing"),
    curriculumOutcomes: [],
  };
}

test.beforeAll(async () => {
  const admin = adminClient();
  const adminEmail = await findUserEmail("admin");
  if (!adminEmail) {
    skipReason = "No active admin.";
    return;
  }
  const { data: staff } = await admin.from("profiles").select("id").eq("email", adminEmail).maybeSingle();
  const { data: activeTerm } = await admin.from("terms").select("id, name").eq("status", "active").limit(1).maybeSingle();
  if (!activeTerm || !staff) {
    skipReason = "No active term.";
    return;
  }
  const { data: completed } = await admin.from("terms").select("id").eq("status", "completed").limit(1).maybeSingle();

  // First NSW school with a class whose stage the 2024 PDHPE syllabus covers.
  const { data: schools } = await admin
    .from("centres")
    .select("id, name, curriculum_framework")
    .eq("type", "school")
    .order("created_at")
    .limit(20);
  let picked: { centreId: string; cls: Fixture["cls"]; band: string; ageBand: string } | null = null;
  for (const s of schools ?? []) {
    if ((s.curriculum_framework ?? "nsw") !== "nsw") continue;
    const { data: classes } = await admin.from("school_classes").select("id, name, year_group, school_year").eq("centre_id", s.id);
    if (!classes?.length) continue;
    const latest = Math.max(...classes.map((c) => c.school_year));
    for (const c of classes.filter((x) => x.school_year === latest)) {
      const band = yearGroupToStage(c.year_group);
      const ageBand = yearGroupToAgeBand(c.year_group);
      const hasCodes = band && pdhpe2024.outcomes.some((o) => (o.bands as string[]).includes(band));
      if (band && ageBand && hasCodes) {
        picked = { centreId: s.id, cls: { id: c.id, name: c.name, yearGroup: c.year_group }, band, ageBand };
        break;
      }
    }
    if (picked) break;
  }
  if (!picked) {
    skipReason = "No NSW school with a class list.";
    return;
  }
  const inBand = pdhpe2024.outcomes.filter((o) => (o.bands as string[]).includes(picked!.band));
  const movement = inBand.find((o) => /-MS[PS]-/.test(o.code));
  const classroom = inBand.find((o) => /-IHW-|-SHW-/.test(o.code));
  if (!movement || !classroom) {
    skipReason = `No movement + classroom outcome pair for ${picked.band}.`;
    return;
  }

  // A student of that class with no comment this term (for the comment test).
  const { data: members } = await admin
    .from("school_class_children")
    .select("child_id, children!inner(id, first_name, last_name, status)")
    .eq("class_id", picked.cls.id)
    .is("ended_at", null);
  let child: Fixture["child"] = null;
  for (const m of members ?? []) {
    const c = m.children as unknown as { id: string; first_name: string; last_name: string; status: string };
    if (c.status !== "active") continue;
    const { data: existing } = await admin
      .from("report_card_comments")
      .select("id")
      .eq("child_id", c.id)
      .eq("term_id", activeTerm.id)
      .maybeSingle();
    if (!existing) {
      child = { id: c.id, name: `${c.first_name} ${c.last_name}` };
      break;
    }
  }

  // Everything below is throwaway. Unwind on any failure.
  const undo: Array<() => Promise<unknown>> = [];
  const fail = async (why: string) => {
    for (const u of undo.reverse()) await u();
    skipReason = why;
  };

  const { data: term, error: termErr } = await admin
    .from("terms")
    .insert({ name: TERM_NAME, start_date: TERM_START, end_date: TERM_END, year: 2031, status: "draft" })
    .select("id")
    .single();
  if (termErr || !term) return fail(`Could not create the draft term: ${termErr?.message}`);
  undo.push(async () => admin.from("terms").delete().eq("id", term.id));

  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email: COLLEAGUE_EMAIL, email_confirm: true });
  if (userErr || !created.user) return fail(`Could not create the colleague: ${userErr?.message}`);
  undo.push(async () => admin.auth.admin.deleteUser(created.user!.id));
  const { data: cu, error: cuErr } = await admin
    .from("client_users")
    .insert({ user_id: created.user.id, centre_id: picked.centreId, name: `${RUN_ID} Colleague`, email: COLLEAGUE_EMAIL, is_primary: false })
    .select("id")
    .single();
  if (cuErr || !cu) return fail(`Could not create the client_users row: ${cuErr?.message}`);
  undo.push(async () => admin.from("client_users").delete().eq("id", cu.id));
  await admin
    .from("client_user_centres")
    .upsert([{ client_user_id: cu.id, centre_id: picked.centreId, is_default: true }], { onConflict: "client_user_id,centre_id", ignoreDuplicates: true });
  undo.push(async () => admin.from("client_user_centres").delete().eq("client_user_id", cu.id));

  const weeks = Array.from({ length: 10 }, (_, i) => i + 1);
  const outcome = (o: { code: string; statement: string }) => ({ framework: "pdhpe", code: o.code, title: o.statement, description: "" });
  const plan = {
    title: `E2E PDHPE plan ${RUN_ID}`,
    subject: "pdhpe",
    bandLabel: picked.band,
    rationale: "E2E fixture.",
    weekCount: 10,
    units: [
      {
        title: "Who we are",
        strand: CLASSROOM_STRAND,
        weeks,
        description: "Classroom unit.",
        outcomes: [outcome(classroom)],
        assessment: "Portfolio.",
        weeklyFocus: weeks.map((w) => ({ week: w, focus: `Classroom focus week ${w}` })),
      },
      {
        title: "Moving well",
        strand: MOVEMENT_STRAND,
        weeks,
        description: "Movement unit.",
        outcomes: [outcome(movement)],
        assessment: "Observation.",
        weeklyFocus: weeks.map((w) => ({ week: w, focus: `Movement focus week ${w}` })),
      },
    ],
  };
  const { data: planRow, error: planErr } = await admin
    .from("term_plans")
    .insert({
      centre_id: picked.centreId,
      school_class_id: picked.cls.id,
      term_id: term.id,
      subject: "pdhpe",
      title: plan.title,
      content_json: plan,
      status: "approved",
      created_by_client_user_id: cu.id,
    })
    .select("id")
    .single();
  if (planErr || !planRow) return fail(`Could not create the plan: ${planErr?.message}`);

  const { data: session, error: sessErr } = await admin
    .from("sessions")
    .insert({
      term_id: term.id,
      centre_id: picked.centreId,
      date: SESSION_DATE,
      time: "09:15:00",
      duration_minutes: 45,
      sport: "Netball",
      status: "draft",
      school_class_ids: [picked.cls.id],
    })
    .select("id")
    .single();
  if (sessErr || !session) return fail(`Could not create the session: ${sessErr?.message}`);
  undo.push(async () => admin.from("sessions").delete().eq("id", session.id));

  // The plan's week-2 programme already exists → the route's reuse branch.
  const { data: programme, error: progErr } = await admin
    .from("programs")
    .insert({
      subject: "pdhpe",
      sport: "Netball",
      age_groups: [picked.ageBand],
      age_group: picked.ageBand,
      duration_minutes: 45,
      skill_focus: "Movement focus week 2",
      content_json: programmeContent(PROGRAMME_TITLE, "Netball", picked.ageBand),
      equipment_used: ["Balls"],
      created_by: staff.id,
      version_number: 1,
      term_plan_id: planRow.id,
      term_plan_week: 2,
    })
    .select("id")
    .single();
  if (progErr || !programme) return fail(`Could not create the programme: ${progErr?.message}`);
  undo.push(async () => admin.from("programs").delete().eq("id", programme.id));

  const { data: lesson, error: lessonErr } = await admin
    .from("programs")
    .insert({
      subject: "pdhpe",
      sport: "Online safety",
      age_groups: [picked.ageBand],
      age_group: picked.ageBand,
      duration_minutes: 45,
      content_json: programmeContent(LESSON_TITLE, "Online safety", picked.ageBand),
      equipment_used: ["Whiteboard"],
      created_by: null,
      created_by_client_user_id: cu.id,
      centre_id: picked.centreId,
      school_class_id: picked.cls.id,
      version_number: 1,
    })
    .select("id")
    .single();
  if (lessonErr || !lesson) return fail(`Could not create the health lesson: ${lessonErr?.message}`);

  fx = {
    centreId: picked.centreId,
    cls: picked.cls,
    ageBand: picked.ageBand,
    child,
    activeTermId: activeTerm.id,
    activeTermName: activeTerm.name,
    completedTermId: completed?.id ?? null,
    termId: term.id,
    planId: planRow.id,
    sessionId: session.id,
    programId: programme.id,
    lessonId: lesson.id,
    clientUserId: cu.id,
    userId: created.user.id,
    adminEmail,
  };
});

test.afterAll(async () => {
  const admin = adminClient();
  // By name as well as id: a run that died in beforeAll must not leave a term.
  if (fx) {
    await admin.from("sessions").update({ program_id: null }).eq("id", fx.sessionId);
    await admin.from("programs").delete().in("id", [fx.programId, fx.lessonId]);
    if (fx.child) {
      await admin
        .from("report_card_comments")
        .delete()
        .eq("child_id", fx.child.id)
        .eq("term_id", fx.activeTermId)
        .eq("author_client_user_id", fx.clientUserId);
    }
    await admin.from("sessions").delete().eq("id", fx.sessionId);
  }
  await admin.from("terms").delete().eq("name", TERM_NAME); // cascades the plan
  if (fx) {
    await admin.from("client_user_centres").delete().eq("client_user_id", fx.clientUserId);
    await admin.from("client_users").delete().eq("id", fx.clientUserId);
    await admin.auth.admin.deleteUser(fx.userId);
  }
});

async function asColleague(page: Page, baseURL: string) {
  await signInAs(page, COLLEAGUE_EMAIL, baseURL);
}

async function openPlanCard(page: Page) {
  const card = page.locator("[aria-expanded]").filter({ hasText: `E2E PDHPE plan ${RUN_ID}` }).first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  if ((await card.getAttribute("aria-expanded")) !== "true") await card.click();
}

test.describe("school portal — plan, roster, lesson, report card (096–098)", () => {
  test.beforeEach(() => {
    test.skip(!fx, skipReason ?? "fixture not provisioned");
  });

  test("a school lands on the school dashboard", async ({ page, baseURL }) => {
    // First page of the run against a cold dev server: the dashboard's
    // module graph once took longer to compile than the default budget.
    test.setTimeout(180_000);
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}`);
    await expect(page.getByRole("heading", { name: /Term plans by class/ })).toBeVisible({ timeout: 150_000 });
    await expect(page.getByRole("heading", { name: /This week/ })).toBeVisible();
  });

  test("Plan the term offers this term and the coming one; this term is the default", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/curriculum/plan`);
    const nav = page.getByRole("navigation", { name: "Term to plan" });
    await expect(nav).toBeVisible({ timeout: 45_000 });
    await expect(nav.locator('[aria-current="page"]')).toContainText(fx!.activeTermName);
    const coming = nav.getByRole("link", { name: new RegExp(TERM_NAME) });
    await expect(coming).toContainText("Starts 3 Feb 2031");
    await coming.click();
    await expect(page).toHaveURL(new RegExp(`termId=${fx!.termId}`));
    await expect(page.getByRole("navigation", { name: "Term to plan" }).locator('[aria-current="page"]')).toContainText(TERM_NAME);
    await expect(page.getByText(new RegExp(`${TERM_NAME} · 10 weeks`))).toBeVisible();
  });

  test("a finished term is refused before any generation", async ({ page, baseURL }) => {
    test.skip(!fx!.completedTermId, "no completed term to refuse");
    await asColleague(page, baseURL!);
    const res = await page.request.post(`/api/client/${fx!.centreId}/generate-term-plan`, {
      data: { subject: "pdhpe", classId: fx!.cls.id, termId: fx!.completedTermId },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/is over/);
  });

  test("Scope & Sequence lists the coming term's plan; Write lesson is the classroom unit's only", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/curriculum`);
    await expect(page.getByRole("heading", { name: new RegExp(`Term plans — ${TERM_NAME} · Starts 3 Feb 2031`) })).toBeVisible({ timeout: 45_000 });
    await openPlanCard(page);
    const links = page.locator(`a[href*="week=2031-"]`);
    await expect(links).toHaveCount(10); // ten classroom weeks, none for the movement unit
    const href = new URL((await links.nth(1).getAttribute("href"))!, baseURL!);
    expect(href.searchParams.get("subject")).toBe("pdhpe");
    expect(href.searchParams.get("classId")).toBe(fx!.cls.id);
    expect(href.searchParams.get("week")).toBe("2031-02-10");
    expect(href.searchParams.get("learningFocus")).toBe("Classroom focus week 2");
    // The specific focus area inside a free-form strand, not the umbrella.
    expect(href.searchParams.get("focus")).toBe("Identity, health and wellbeing");
  });

  test("that link opens the PDHPE health lesson generator on the coming term's weeks", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    const q = new URLSearchParams({
      subject: "pdhpe",
      classId: fx!.cls.id,
      week: "2031-02-10",
      learningFocus: "Classroom focus week 2",
      focus: "Identity, health and wellbeing",
    });
    await page.goto(`/client/${fx!.centreId}/programs/generate?${q.toString()}`);
    await expect(page.getByRole("button", { name: /Generate PDHPE lesson/ })).toBeVisible({ timeout: 45_000 });
    const main = page.locator("main");
    await expect(main).toContainText(TERM_NAME);
    await expect(main).toContainText("Online safety"); // focus areas…
    await expect(main).toContainText("Scenario cards"); // …and classroom resources
    await expect(main).not.toContainText("Netball"); // never sports
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: /10 Feb/ })).toHaveCount(1);
  });

  test("a sport is never a portal lesson", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    const res = await page.request.post(`/api/client/${fx!.centreId}/generate-lesson`, {
      data: { subject: "pdhpe", focus: "Netball", ageBand: fx!.ageBand, durationMinutes: 45, resources: ["Whiteboard"], classId: fx!.cls.id },
    });
    expect(res.status()).toBe(400);
  });

  test("a saved health lesson reads as a lesson, not a coaching session", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/programs/${fx!.lessonId}`);
    const main = page.locator("main");
    await expect(main).toContainText(LESSON_TITLE, { timeout: 45_000 });
    await expect(main).toContainText("PDHPE · Online safety");
    await expect(main).toContainText(/hook \/ tuning in/i);
    await expect(main).not.toContainText(/warm-up|cool-down/i);
  });

  test("editing an approved plan in place saves and returns it to draft", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/curriculum`);
    await openPlanCard(page);
    await page.getByRole("button", { name: "Edit plan" }).click();
    const focus = page.getByLabel("Unit 1 week 1 focus");
    await focus.fill(`Edited by ${RUN_ID}`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/back to draft/)).toBeVisible({ timeout: 30_000 });

    const { data } = await adminClient().from("term_plans").select("status, content_json").eq("id", fx!.planId).single();
    expect(data!.status).toBe("draft");
    const units = (data!.content_json as { units: Array<{ weeklyFocus: Array<{ week: number; focus: string }>; outcomes: Array<{ code: string }> }> }).units;
    expect(units[0].weeklyFocus.find((w) => w.week === 1)!.focus).toBe(`Edited by ${RUN_ID}`);
    // Re-normalised against the syllabus in force in 2031: the 2024 codes survive.
    expect(units.every((u) => u.outcomes.length === 1 && /^PH/.test(u.outcomes[0].code))).toBe(true);
  });

  test("the plan drives the roster: refused until approved, then the week's programme attaches", async ({ page, baseURL }) => {
    await signInAs(page, fx!.adminEmail, baseURL!);
    const call = (replace = false) =>
      page.request.post(`/api/ai/generate-plan-session`, { data: { planId: fx!.planId, sessionId: fx!.sessionId, replace } });

    const draft = await call(); // the previous test left the plan in draft
    expect(draft.status()).toBe(409);
    expect((await draft.json()).error).toMatch(/not approved/);

    const admin = adminClient();
    await admin.from("term_plans").update({ status: "approved" }).eq("id", fx!.planId);
    const ok = await call();
    expect(ok.status()).toBe(200);
    const body = (await ok.json()).data;
    expect(body).toMatchObject({ programId: fx!.programId, week: 2, focus: "Movement focus week 2", reused: true });
    const { data: s } = await admin.from("sessions").select("program_id").eq("id", fx!.sessionId).single();
    expect(s!.program_id).toBe(fx!.programId);

    expect((await call()).status()).toBe(409); // already programmed, replace not asked

    await admin.from("sessions").update({ status: "completed" }).eq("id", fx!.sessionId);
    expect((await call(true)).status()).toBe(409); // completed sessions are never touched
    await admin.from("sessions").update({ status: "published" }).eq("id", fx!.sessionId);
  });

  test("a portal user cannot drive the roster", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    const res = await page.request.post(`/api/ai/generate-plan-session`, { data: { planId: fx!.planId, sessionId: fx!.sessionId } });
    expect([401, 403]).toContain(res.status());
  });

  test("the school sees the coach session under its plan's week", async ({ page, baseURL }) => {
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/curriculum`);
    await openPlanCard(page);
    const link = page.getByRole("link", { name: new RegExp(`Coach session:\\s*${PROGRAMME_TITLE}`) });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute("href", new RegExp(`/schedule/${fx!.sessionId}$`));
  });

  test("a colleague writes a report-card comment and it is stored under their name", async ({ page, baseURL }) => {
    test.skip(!fx!.child, "every student in the class already has a comment this term");
    await asColleague(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/children/${fx!.child!.id}`);
    await page.getByRole("button", { name: "Assessments" }).click({ timeout: 45_000 });
    await page.getByLabel("General comment").fill(`E2E general comment ${RUN_ID}`);
    await page.getByLabel("Next steps").fill(`E2E next steps ${RUN_ID}`);
    await page.getByRole("button", { name: "Save comment" }).click();
    await expect(page.getByText("Report card comment saved.")).toBeVisible({ timeout: 30_000 });

    const { data } = await adminClient()
      .from("report_card_comments")
      .select("general_comment, next_steps, author_client_user_id")
      .eq("child_id", fx!.child!.id)
      .eq("term_id", fx!.activeTermId)
      .single();
    expect(data).toMatchObject({
      general_comment: `E2E general comment ${RUN_ID}`,
      next_steps: `E2E next steps ${RUN_ID}`,
      author_client_user_id: fx!.clientUserId,
    });
  });
});
