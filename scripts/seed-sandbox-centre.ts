/**
 * Seed a fully-populated "Sandbox" centre so every client-portal tab
 * shows rich, realistic data when you log in as a centre director.
 *
 * Idempotent: re-running won't duplicate. It looks up by a fixed
 * centre name ("Sandbox — Honeybee Childcare") and seeds children,
 * sessions, feedback, report, and invoice only if they don't already
 * exist for that centre.
 *
 * Run with: npx tsx scripts/seed-sandbox-centre.ts
 *
 * After running, hand-create a client_users row for whichever email
 * you want to log in as (via /admin/centres/<id> → Portal Access).
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SANDBOX_CENTRE_NAME = "Sandbox — Honeybee Childcare";

const SAMPLE_CHILDREN = [
  { first_name: "Emma",   last_name: "Mitchell", age_group: "3-5", gender: "female" },
  { first_name: "Jack",   last_name: "Reilly",   age_group: "5-8", gender: "male"   },
  { first_name: "Sofia",  last_name: "Lin",      age_group: "3-5", gender: "female" },
  { first_name: "Noah",   last_name: "Kowal",    age_group: "3-5", gender: "male"   },
  { first_name: "Aria",   last_name: "Taylor",   age_group: "5-8", gender: "female" },
  { first_name: "Liam",   last_name: "Patel",    age_group: "3-5", gender: "male"   },
  { first_name: "Mia",    last_name: "Singh",    age_group: "5-8", gender: "female" },
  { first_name: "Oliver", last_name: "Wong",     age_group: "3-5", gender: "male"   },
];

const SESSION_PLAN = [
  // Past sessions (completed) — give feedback + activity history
  { daysOffset: -28, time: "09:30", sport: "Soccer",      duration: 45, status: "completed" },
  { daysOffset: -25, time: "10:00", sport: "Yoga",        duration: 30, status: "completed" },
  { daysOffset: -21, time: "09:30", sport: "Multi-Sport", duration: 45, status: "completed" },
  { daysOffset: -18, time: "09:30", sport: "Basketball",  duration: 45, status: "completed" },
  { daysOffset: -14, time: "10:00", sport: "Yoga",        duration: 30, status: "completed" },
  { daysOffset: -11, time: "09:30", sport: "Multi-Sport", duration: 45, status: "completed" },
  { daysOffset:  -7, time: "09:30", sport: "Soccer",      duration: 45, status: "completed" },
  { daysOffset:  -4, time: "10:00", sport: "Yoga",        duration: 30, status: "completed" },
  // Upcoming sessions (published) — fill schedule + next-session card
  { daysOffset:   2, time: "09:30", sport: "Multi-Sport", duration: 45, status: "published" },
  { daysOffset:   5, time: "10:00", sport: "Yoga",        duration: 30, status: "published" },
  { daysOffset:   9, time: "09:30", sport: "Basketball",  duration: 45, status: "published" },
  { daysOffset:  12, time: "09:30", sport: "Soccer",      duration: 45, status: "published" },
];

const SAMPLE_FEEDBACK = [
  { offset: -28, rating: 5, comment: "Kids loved the dribbling games — Marcus was great!" },
  { offset: -25, rating: 5, comment: "Calm and engaged after yoga. Perfect after-lunch session." },
  { offset: -21, rating: 4, comment: "Good variety. Could use more cool-down time at the end." },
  { offset: -18, rating: 5, comment: "Best basketball session yet — kids asked for more." },
  { offset: -14, rating: 4, comment: "Lovely as always. Some kids needed prompting to focus." },
  { offset:  -7, rating: 5, comment: "Soccer skills are really showing now. Thank you team!" },
];

function isoDate(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetFromToday);
  return d.toISOString().split("T")[0];
}

async function ensureSandboxCentre() {
  const { data: existing } = await supabase
    .from("centres")
    .select("id, name")
    .eq("name", SANDBOX_CENTRE_NAME)
    .maybeSingle();

  if (existing) {
    console.log(`✓ Centre exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("centres")
    .insert({
      name: SANDBOX_CENTRE_NAME,
      type: "childcare",
      address: "123 Sample Street, Liverpool NSW 2170",
      primary_contact_name: "Sarah Director",
      primary_contact_email: "sandbox-director@example.com",
      primary_contact_phone: "0400000000",
      primary_contact_role: "Centre Director",
      group_size: 12,
      age_groups: ["3-5", "5-8"],
      pricing_model: "centre_funded",
      agreed_rate: 165,
      contract_status: "active",
      health_score: 92,
      health_status: "healthy",
      profile_checklist_complete: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`+ Created centre: ${data.id}`);
  return data.id;
}

async function ensureCurrentTerm(): Promise<string> {
  const today = isoDate(0);
  const { data: current } = await supabase
    .from("terms")
    .select("id, name")
    .lte("start_date", today)
    .gte("end_date", today)
    .maybeSingle();

  if (current) {
    console.log(`✓ Term exists: ${current.name}`);
    return current.id;
  }

  // No active term — bootstrap "Term 2 2026" so sessions + reports have an FK.
  const { data, error } = await supabase
    .from("terms")
    .insert({
      name: "Term 2 2026",
      start_date: "2026-04-28",
      end_date: "2026-07-04",
      year: 2026,
    })
    .select("id")
    .single();

  if (error) throw error;
  console.log(`+ Created term: Term 2 2026 (${data.id})`);
  return data.id;
}

async function getFirstActiveCoach(): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("role", "coach")
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error("No active coach found — seed one via /admin/staff first.");
  }
  console.log(`✓ Using coach: ${data.name} (${data.id})`);
  return data.id;
}

async function seedChildren(centreId: string): Promise<string[]> {
  const { data: existing } = await supabase
    .from("centre_children")
    .select("child_id")
    .eq("centre_id", centreId);

  if ((existing ?? []).length >= SAMPLE_CHILDREN.length) {
    console.log(`✓ ${existing!.length} children already linked to centre`);
    return existing!.map((c) => c.child_id);
  }

  const childIds: string[] = [];
  for (const child of SAMPLE_CHILDREN) {
    const { data, error } = await supabase
      .from("children")
      .insert(child)
      .select("id")
      .single();
    if (error) throw error;
    childIds.push(data.id);

    await supabase.from("centre_children").insert({
      child_id: data.id,
      centre_id: centreId,
    });
  }
  console.log(`+ Created ${childIds.length} children + centre links`);
  return childIds;
}

async function seedSessions(
  centreId: string,
  termId: string,
  coachId: string
): Promise<Array<{ id: string; daysOffset: number; sport: string }>> {
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("centre_id", centreId);

  if ((existing ?? []).length >= SESSION_PLAN.length) {
    console.log(`✓ ${existing!.length} sessions already exist for centre`);
    // Return what's there, mapped — won't have offset/sport but feedback step
    // skips if these sessions already have feedback rows.
    return (existing ?? []).map((s) => ({ id: s.id, daysOffset: 0, sport: "" }));
  }

  const rows = SESSION_PLAN.map((s) => ({
    term_id: termId,
    date: isoDate(s.daysOffset),
    time: s.time,
    duration_minutes: s.duration,
    centre_id: centreId,
    coach_id: coachId,
    sport: s.sport,
    status: s.status,
    headcount: s.status === "completed" ? Math.floor(8 + Math.random() * 4) : null,
    completed_at:
      s.status === "completed" ? new Date(isoDate(s.daysOffset) + "T11:00:00Z").toISOString() : null,
  }));

  const { data, error } = await supabase
    .from("sessions")
    .insert(rows)
    .select("id");
  if (error) throw error;

  console.log(`+ Created ${data.length} sessions (mix of completed + upcoming)`);
  return data.map((row, i) => ({
    id: row.id,
    daysOffset: SESSION_PLAN[i].daysOffset,
    sport: SESSION_PLAN[i].sport,
  }));
}

async function seedFeedback(
  centreId: string,
  sessions: Array<{ id: string; daysOffset: number; sport: string }>,
  coachId: string
) {
  const { count } = await supabase
    .from("feedback_ratings")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId);

  if ((count ?? 0) >= SAMPLE_FEEDBACK.length) {
    console.log(`✓ ${count} feedback ratings already exist for centre`);
    return;
  }

  const rows = SAMPLE_FEEDBACK.map((fb) => {
    const session = sessions.find((s) => s.daysOffset === fb.offset);
    if (!session) return null;
    return {
      session_id: session.id,
      centre_id: centreId,
      coach_id: coachId,
      sport: session.sport,
      rating: fb.rating,
      comment: fb.comment,
      submitted_at: new Date(isoDate(fb.offset) + "T16:00:00Z").toISOString(),
    };
  }).filter(Boolean);

  if (rows.length === 0) {
    console.log("• No feedback offsets matched seeded sessions — skipping");
    return;
  }

  const { error } = await supabase.from("feedback_ratings").insert(rows);
  if (error) throw error;
  console.log(`+ Created ${rows.length} feedback ratings`);
}

async function seedReport(centreId: string, termId: string, coachId: string) {
  const { data: existing } = await supabase
    .from("centre_reports")
    .select("id")
    .eq("centre_id", centreId)
    .eq("term_id", termId)
    .maybeSingle();

  if (existing) {
    console.log(`✓ Report exists for centre × term`);
    return;
  }

  const { error } = await supabase.from("centre_reports").insert({
    centre_id: centreId,
    term_id: termId,
    title: "Term summary — Sandbox centre",
    content_json: {
      summary: "Strong progression across throwing, agility, and listening skills this term.",
      highlights: [
        "12 sessions delivered, 100% on-time",
        "Average feedback 4.8/5",
        "All children engaged in at least 8 sessions",
      ],
      next_term_focus: "Team play + cooperative games",
    },
    status: "sent",
    generated_by: coachId,
    sent_at: new Date().toISOString(),
  });
  if (error) throw error;
  console.log(`+ Created centre report`);
}

async function seedInvoice(centreId: string) {
  const { data: existing } = await supabase
    .from("outbound_invoices")
    .select("id")
    .eq("centre_id", centreId)
    .limit(1);

  if ((existing ?? []).length > 0) {
    console.log(`✓ Invoice exists for centre`);
    return;
  }

  const periodStart = isoDate(-28);
  const periodEnd = isoDate(-1);
  const subtotalCents = 154000; // $1,540
  const gstCents = Math.round(subtotalCents * 0.1);
  const totalCents = subtotalCents + gstCents;

  const { error } = await supabase.from("outbound_invoices").insert({
    centre_id: centreId,
    period_start: periodStart,
    period_end: periodEnd,
    line_items_json: [
      { description: "Multi-sport sessions × 8", quantity: 8, rate_cents: 16500, total_cents: 132000 },
      { description: "Yoga sessions × 4 @ shorter rate", quantity: 4, rate_cents: 5500, total_cents: 22000 },
    ],
    amount: totalCents / 100,
    subtotal_cents: subtotalCents,
    gst_amount_cents: gstCents,
    total_cents: totalCents,
    status: "paid",
    due_date: isoDate(7),
    payment_date: isoDate(-2),
    payment_method: "bank_transfer",
    paid_amount_cents: totalCents,
    sent_at: new Date(isoDate(-3) + "T10:00:00Z").toISOString(),
  });
  if (error) throw error;
  console.log(`+ Created paid invoice ($${(totalCents / 100).toFixed(2)})`);
}

async function main() {
  console.log("Seeding sandbox centre…\n");

  const centreId = await ensureSandboxCentre();
  const termId = await ensureCurrentTerm();
  const coachId = await getFirstActiveCoach();

  await seedChildren(centreId);
  const sessions = await seedSessions(centreId, termId, coachId);
  await seedFeedback(centreId, sessions, coachId);
  await seedReport(centreId, termId, coachId);
  await seedInvoice(centreId);

  console.log(`\nDone. Sandbox centre id: ${centreId}`);
  console.log(
    `Next step: open /admin/centres/${centreId} → Portal Access → invite a client user with your +director alias email.`
  );
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
