import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, mintSession, signInAs } from "./fixtures/auth";

// ============================================================
// The teacher seam — auth → RLS (088/090/091) → server action → render
// ============================================================
//
// Everything a school's class teacher does in the portal crosses the
// same seam the unit suite cannot reach: a client_users row with
// role=teacher and a class scope, cookie-client reads and writes that
// RLS decides, and the report-card gate the principal controls. Every
// production rehearsal bug this session lived here (two attendance
// tables, a 403 the UI never explained, a whole-stage outcome dump).
//
// The spec provisions its OWN teacher on a real school (a throwaway
// auth user + client_users row + one assessment template), writes the
// few rows it needs, and removes all of it in afterAll — the same
// exception the feedback-RLS spec makes, for the same reason: the write
// is the seam. It never touches a school's existing ratings, releases
// or people, and skips (not fails) when no school has a class list.

const RUN_ID = `e2e-${Date.now().toString(36)}`;
const TEACHER_EMAIL = `${RUN_ID}-teacher@buildalphakids.app`;
const PROBE_SPORT = `E2E Probe ${RUN_ID}`;

type Fixture = {
  centreId: string;
  centreName: string;
  termId: string;
  classA: { id: string; name: string };
  classB: { id: string; name: string } | null;
  band: string;
  childA: string;
  childAName: string;
  childB: string | null;
  templateId: string;
  teacherClientUserId: string;
  teacherUserId: string;
  coachRatingChild: string | null;
  releaseCreated: boolean;
  releaseExisted: boolean;
};

let fx: Fixture | null = null;
let skipReason: string | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const admin = adminClient();

  // A school with at least one class that has active, band-known members.
  const { data: schools } = await admin
    .from("centres")
    .select("id, name")
    .eq("type", "school")
    .order("created_at")
    .limit(20);
  const { data: term } = await admin
    .from("terms")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!term) {
    skipReason = "No active term.";
    return;
  }

  for (const school of schools ?? []) {
    const { data: classes } = await admin
      .from("school_classes")
      .select("id, name, school_year")
      .eq("centre_id", school.id);
    if (!classes || classes.length === 0) continue;
    const latest = Math.max(...classes.map((c) => c.school_year));
    const current = classes.filter((c) => c.school_year === latest);
    const { data: members } = await admin
      .from("school_class_children")
      .select("class_id, child_id, children!inner(id, first_name, last_name, age_group, status)")
      .in("class_id", current.map((c) => c.id))
      .is("ended_at", null);
    const active = (members ?? []).filter(
      (m) => (m.children as unknown as { status: string }).status === "active"
    );
    if (active.length === 0) continue;

    // Class A = the class with the most active members; band = its modal band.
    const byClass = new Map<string, typeof active>();
    for (const m of active) byClass.set(m.class_id, [...(byClass.get(m.class_id) ?? []), m]);
    const [classAId, aMembers] = [...byClass.entries()].sort((x, y) => y[1].length - x[1].length)[0];
    const bandCount = new Map<string, number>();
    for (const m of aMembers) {
      const b = (m.children as unknown as { age_group: string }).age_group;
      bandCount.set(b, (bandCount.get(b) ?? 0) + 1);
    }
    const band = [...bandCount.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const childA = aMembers.find(
      (m) => (m.children as unknown as { age_group: string }).age_group === band
    )!;
    const classA = current.find((c) => c.id === classAId)!;
    const otherEntry = [...byClass.entries()].find(([id]) => id !== classAId);
    const classB = otherEntry ? current.find((c) => c.id === otherEntry[0]) ?? null : null;
    const childB = otherEntry ? otherEntry[1][0].child_id : null;

    // The template every task below hangs off: centre-scoped, active term.
    const { data: staff } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "ops"])
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!staff) {
      skipReason = "No active staff profile to own the probe template.";
      return;
    }
    const { data: tpl, error: tplErr } = await admin
      .from("assessment_templates")
      .insert({
        subject: "pdhpe",
        sport: PROBE_SPORT,
        age_group: band,
        skills_json: [
          { name: "Probe skill one", description: "1 emerging – 5 excellent" },
          { name: "Probe skill two", description: "1 emerging – 5 excellent" },
        ],
        term_id: term.id,
        centre_id: school.id,
        created_by: staff.id,
      })
      .select("id")
      .single();
    if (tplErr || !tpl) {
      skipReason = `Could not create the probe template: ${tplErr?.message}`;
      return;
    }

    // The teacher: auth user + client_users row scoped to class A.
    const { data: created, error: userErr } = await admin.auth.admin.createUser({
      email: TEACHER_EMAIL,
      email_confirm: true,
    });
    if (userErr || !created.user) {
      await admin.from("assessment_templates").delete().eq("id", tpl.id);
      skipReason = `Could not create the probe teacher: ${userErr?.message}`;
      return;
    }
    const { data: cu, error: cuErr } = await admin
      .from("client_users")
      .insert({
        user_id: created.user.id,
        centre_id: school.id,
        name: `${RUN_ID} Teacher`,
        email: TEACHER_EMAIL,
        is_primary: false,
        role: "teacher",
        class_ids: [classA.id],
      })
      .select("id")
      .single();
    if (cuErr || !cu) {
      await admin.auth.admin.deleteUser(created.user.id);
      await admin.from("assessment_templates").delete().eq("id", tpl.id);
      skipReason = `Could not create the client_users row: ${cuErr?.message}`;
      return;
    }
    await admin
      .from("client_user_centres")
      .upsert([{ client_user_id: cu.id, centre_id: school.id, is_default: true }], {
        onConflict: "client_user_id,centre_id",
        ignoreDuplicates: true,
      });

    // A coach-authored row on the template for a class-B child: the row a
    // teacher must never be able to rewrite.
    let coachRatingChild: string | null = null;
    if (childB) {
      const { data: coach } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "coach")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (coach) {
        const { error } = await admin.from("skill_ratings").insert({
          assessment_template_id: tpl.id,
          child_id: childB,
          coach_id: coach.id,
          term_id: term.id,
          ratings_json: [{ skill_name: "Probe skill one", rating: 4 }],
        });
        if (!error) coachRatingChild = childB;
      }
    }

    const { data: release } = await admin
      .from("report_card_releases")
      .select("released_at")
      .eq("centre_id", school.id)
      .eq("term_id", term.id)
      .maybeSingle();

    const childRow = childA.children as unknown as { first_name: string; last_name: string };
    fx = {
      centreId: school.id,
      centreName: school.name,
      termId: term.id,
      classA: { id: classA.id, name: classA.name },
      classB: classB ? { id: classB.id, name: classB.name } : null,
      band,
      childA: childA.child_id,
      childAName: `${childRow.first_name} ${childRow.last_name}`,
      childB,
      templateId: tpl.id,
      teacherClientUserId: cu.id,
      teacherUserId: created.user.id,
      coachRatingChild,
      releaseCreated: false,
      releaseExisted: !!release?.released_at,
    };
    return;
  }
  skipReason = "No school has a class list with active students.";
});

test.afterAll(async () => {
  if (!fx) return;
  const admin = adminClient();
  // Template cascade removes every probe rating (teacher's and coach's).
  await admin.from("assessment_templates").delete().eq("id", fx.templateId);
  if (fx.releaseCreated) {
    await admin
      .from("report_card_releases")
      .delete()
      .eq("centre_id", fx.centreId)
      .eq("term_id", fx.termId);
  }
  await admin.from("client_user_centres").delete().eq("client_user_id", fx.teacherClientUserId);
  await admin.from("client_users").delete().eq("id", fx.teacherClientUserId);
  await admin.auth.admin.deleteUser(fx.teacherUserId);
});

async function asTeacher(page: Page, baseURL: string) {
  await signInAs(page, TEACHER_EMAIL, baseURL);
}

test.describe("school portal — the class teacher seam (migrations 088, 090, 091)", () => {
  test("a class teacher sees Assessments (not Invoices) and only their own class", async ({
    page,
    baseURL,
  }) => {
    test.skip(!fx, skipReason ?? "fixture missing");
    await asTeacher(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/assessments`);

    await expect(page.getByRole("heading", { name: "Assessments" })).toBeVisible();
    const nav = page.locator("nav, aside");
    await expect(nav.getByRole("link", { name: "Assessments" }).first()).toBeVisible();
    await expect(nav.getByRole("link", { name: "Invoices" })).toHaveCount(0);

    // One task card for class A on the probe template; none for class B.
    const cards = page.getByText(PROBE_SPORT);
    await expect(cards.first()).toBeVisible();
    const main = page.locator("main");
    await expect(main.getByText(fx!.classA.name, { exact: true }).first()).toBeVisible();
    if (fx!.classB) {
      await expect(main.getByText(fx!.classB.name, { exact: true })).toHaveCount(0);
    }
  });

  test("the class grid saves a teacher-authored rating through the real action", async ({
    page,
    baseURL,
  }) => {
    test.skip(!fx, skipReason ?? "fixture missing");
    await asTeacher(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/assessments/${fx!.classA.id}/${fx!.templateId}`);

    await expect(page.getByRole("heading", { name: new RegExp(`${fx!.classA.name} — `) })).toBeVisible();
    const row = page.locator("tbody tr", { hasText: fx!.childAName }).first();
    await expect(row).toBeVisible();
    const selects = row.locator("select");
    await expect(selects).toHaveCount(2);
    await selects.nth(0).selectOption("4");
    await selects.nth(1).selectOption("5");
    await row.locator("textarea").fill("e2e probe comment (auto-deleted)");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByText("Saved")).toBeVisible();

    const { data } = await adminClient()
      .from("skill_ratings")
      .select("coach_id, client_user_id, ratings_json, notes")
      .eq("assessment_template_id", fx!.templateId)
      .eq("child_id", fx!.childA)
      .eq("term_id", fx!.termId)
      .maybeSingle();
    expect(data, "the grid save wrote no row").toBeTruthy();
    expect(data!.client_user_id).toBe(fx!.teacherClientUserId);
    expect(data!.coach_id).toBeNull();
    expect(data!.notes).toContain("e2e probe");
    expect((data!.ratings_json as Array<{ rating: number }>).map((r) => r.rating).sort()).toEqual([4, 5]);
  });

  test("RLS: a teacher cannot rewrite a coach's rating (migration 088)", async () => {
    test.skip(!fx, skipReason ?? "fixture missing");
    test.skip(!fx!.coachRatingChild, "No coach profile to author the control row.");

    const minted = await mintSession(TEACHER_EMAIL);
    const asClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${minted.access_token}` } },
      }
    );
    const { data: touched, error } = await asClient
      .from("skill_ratings")
      .update({ ratings_json: [{ skill_name: "Probe skill one", rating: 1 }] })
      .eq("assessment_template_id", fx!.templateId)
      .eq("child_id", fx!.coachRatingChild!)
      .eq("term_id", fx!.termId)
      .select("id");
    expect(error, `unexpected error: ${error?.message}`).toBeNull();
    expect(touched?.length ?? 0, "a teacher rewrote a coach's rating").toBe(0);

    const { data: still } = await adminClient()
      .from("skill_ratings")
      .select("ratings_json")
      .eq("assessment_template_id", fx!.templateId)
      .eq("child_id", fx!.coachRatingChild!)
      .single();
    expect((still!.ratings_json as Array<{ rating: number }>)[0].rating).toBe(4);
  });

  test("report cards are gated for a teacher until the principal releases (migration 090)", async ({
    page,
    baseURL,
  }) => {
    // The first report-card PDF on a dev server compiles react-pdf: late
    // in a long run that once took longer than the default 60s budget.
    test.setTimeout(240_000);
    test.skip(!fx, skipReason ?? "fixture missing");
    test.skip(
      fx!.releaseExisted,
      "This school has already released this term — not touching a real release."
    );
    await asTeacher(page, baseURL!);
    const url = `/client/${fx!.centreId}/student-report-pdf?childId=${fx!.childA}`.replace(
      "/client/",
      "/api/client/"
    );

    const gated = await page.request.get(url, { timeout: 180_000 });
    expect(gated.status(), "teacher was not gated before release").toBe(403);

    // The student page explains instead of 403ing.
    await page.goto(`/client/${fx!.centreId}/children/${fx!.childA}`);
    await expect(page.getByText(/Report card not released yet|Not released/).first()).toBeVisible();

    const admin = adminClient();
    const { error } = await admin.from("report_card_releases").upsert(
      {
        centre_id: fx!.centreId,
        term_id: fx!.termId,
        released_at: new Date().toISOString(),
      },
      { onConflict: "centre_id,term_id" }
    );
    expect(error, `could not create the release: ${error?.message}`).toBeNull();
    fx!.releaseCreated = true;

    const open = await page.request.get(url);
    expect(open.status(), "teacher could not open the card after release").toBe(200);
    expect(open.headers()["content-type"]).toContain("pdf");
  });

  test("the lesson generator offers only the teacher's class (migration 091)", async ({
    page,
    baseURL,
  }) => {
    test.skip(!fx, skipReason ?? "fixture missing");
    await asTeacher(page, baseURL!);
    await page.goto(`/client/${fx!.centreId}/programs/generate`);

    await expect(page.getByRole("heading", { name: "Generate a lesson" })).toBeVisible();
    const chips = page.locator('[aria-label="Class"] button');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText(fx!.classA.name);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    // No AI call: the button is the end of the test.
    await expect(page.getByRole("button", { name: /Generate English lesson/ })).toBeVisible();
  });
});
