import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { adminClient, mintSession, signInAs } from "./fixtures/auth";

// Run only after Jayden applies 103–108. Never applies migrations. Every write
// targets fixtures created here; cleanup runs even when a regression is found.
// For action IDs, run against the local webpack production build being tested.
test("Phase 1: real coach/client sessions cannot cross authorisation boundaries", async ({ page, baseURL }) => {
  const admin = adminClient();
  const run = `audit-p1-${Date.now()}`;
  const undo: Array<() => Promise<unknown>> = [];
  async function insert(table: string, row: Record<string, unknown>) {
    const { data, error } = await admin.from(table).insert(row).select("id").single();
    expect(error, `${table} fixture`).toBeNull();
    expect(data).not.toBeNull();
    undo.push(async () => { const { error } = await admin.from(table).delete().eq("id", data!.id); expect(error).toBeNull(); });
    return data!.id as string;
  }
  async function user(label: string) {
    const email = `${run}-${label}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(error).toBeNull();
    const id = data.user!.id;
    undo.push(async () => { const { error } = await admin.auth.admin.deleteUser(id); expect(error).toBeNull(); });
    return { id, email };
  }
  async function client(email: string) {
    const session = await mintSession(email);
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  try {
    const coach = await user("coach");
    const portal = await user("client");
    const { error: profileError } = await admin.from("profiles").upsert({ id: coach.id, email: coach.email, name: run, role: "coach", status: "active" });
    expect(profileError).toBeNull();
    const centre = await insert("centres", { name: run, type: "school", contract_status: "trial" });
    const otherCentre = await insert("centres", { name: `${run}-other`, type: "school", contract_status: "trial" });
    const cu = await insert("client_users", { user_id: portal.id, centre_id: centre, email: portal.email, name: run, role: "teacher", is_primary: false, class_ids: [] });
    const session = await insert("sessions", { centre_id: centre, date: "2031-02-12", time: "10:00", duration_minutes: 45, sport: "Netball", status: "draft" });
    const invoice = await insert("coach_invoices", { coach_id: coach.id, period_start: "2031-02-01", period_end: "2031-02-07", status: "ready", total_amount: 50 });
    const coachDb = await client(coach.email);
    const clientDb = await client(portal.email);

    const { error: invoiceError } = await coachDb.from("coach_invoices").update({ total_amount: 999 }).eq("id", invoice);
    expect(invoiceError, "§2.10 submitted invoice cannot be rewritten").not.toBeNull();
    for (const patch of [{ role: "admin" }, { also_coaches: true }, { financial_access: true }, { default_pay_rate: 999 }, { status: "inactive" }]) {
      const { error } = await coachDb.from("profiles").update(patch).eq("id", coach.id);
      expect(error, `§2.6 ${Object.keys(patch)[0]}`).not.toBeNull();
    }
    for (const patch of [{ centre_id: otherCentre }, { role: "primary" }, { is_primary: true }]) {
      const { error } = await clientDb.from("client_users").update(patch).eq("id", cu);
      expect(error, `§2.7 ${Object.keys(patch)[0]}`).not.toBeNull();
    }
    const { error: rosterError } = await coachDb.rpc("set_session_coaches", { p_session_id: session, p_coaches: [{ user_id: coach.id, is_primary: true }], p_assigned_by: coach.id });
    expect(rosterError, "§2.8 coach RPC refused").not.toBeNull();
    const { data: crew, error: crewError } = await admin.from("session_coaches").select("user_id").eq("session_id", session);
    expect(crewError).toBeNull();
    expect(crew).toEqual([]);

    await signInAs(page, coach.email, baseURL!);
    await page.context().addCookies([{ name: "bak-role", value: `${coach.id}:admin:active:1:0`, url: baseURL! }]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    const prefetch = await page.request.get("/admin", { headers: { purpose: "prefetch", "next-router-prefetch": "1" } });
    expect(await prefetch.text()).not.toContain("Admin Dashboard");

    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
    const endpoints = Object.values(manifest.node).map(value => (value as { exportedName?: string }).exportedName);
    for (const name of ["sendEmail", "createNotification", "generateReferralCode", "createReferralRecord", "markReferralRegistered", "processReferralConversion", "generateDiscountCode", "redeemDiscountCode", "handleLeadStageChange", "processRerosteringEscalations", "sendPushToUser", "sendUrgentNotificationViaSms"]) {
      expect(endpoints, `§2.13 ${name} is not a public action`).not.toContain(name);
    }
    const action = Object.entries(manifest.node).find(([, value]) => (value as { exportedName?: string }).exportedName === "adminResetStaffPassword");
    expect(action, "Build must expose the actual reset action ID; do not skip this check").toBeDefined();
    const denied = await page.request.post("/admin/staff/" + coach.id, {
      headers: { "Next-Action": action![0], "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL! },
      data: JSON.stringify([coach.id, "attacker-supplied-password"]),
    });
    expect(denied.status(), "§2.1 action rejects coach before password operations").toBe(500);
    expect(await denied.text()).not.toContain("tempPassword");

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error: notificationError } = await anon.from("notifications").insert({ user_id: coach.id, title: run, body: "probe", type: "system", tier: "informational" });
    expect(notificationError?.code, "§2.16 privileges, not invalid fixture data").toBe("42501");
    const child = await insert("children", { first_name: run, last_name: "Fixture", age_group: "5-8" });
    const insight = await insert("child_insights", { child_id: child, centre_id: otherCentre, summary: run });
    const schoolClass = await insert("school_classes", { centre_id: otherCentre, name: run, year_group: "3", school_year: 2031 });
    const { error: classLinkError } = await admin.from("school_class_children").insert({ class_id: schoolClass, child_id: child });
    expect(classLinkError).toBeNull(); // class deletion cascades this membership
    const { data: insights, error: insightError } = await coachDb.from("child_insights").select("id").eq("id", insight);
    expect(insightError).toBeNull();
    expect(insights, "§2.17 unrelated child insights hidden").toEqual([]);
    const { data: classes, error: classError } = await coachDb.from("school_class_children").select("class_id").eq("class_id", schoolClass);
    expect(classError).toBeNull();
    expect(classes, "§2.17 unrelated class list hidden").toEqual([]);
    const note = await insert("centre_notes", { centre_id: otherCentre, created_by: coach.id, category: "safety", content: run });
    const { data: notes, error: notesError } = await coachDb.from("centre_notes").select("id").eq("id", note);
    expect(notesError).toBeNull();
    expect(notes, "§2.17 unrelated centre notes hidden").toEqual([]);
  } finally {
    const errors: unknown[] = [];
    for (const clean of undo.reverse()) { try { await clean(); } catch (error) { errors.push(error); } }
    expect(errors, "All throwaway records must be removed").toEqual([]);
  }
});
