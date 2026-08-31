/**
 * Seed a fully-populated demo SCHOOL so the client portal can be shown
 * to prospective schools with realistic data on every tab — including
 * the 2026-08 build-out features: per-student AI insights, two terms of
 * skill assessments (Progression tab), and shared coach observations.
 *
 * Idempotent: keyed on the fixed school name. Re-running tops up only
 * what's missing.
 *
 * Run with:  npx tsx scripts/seed-demo-school.ts [tester-email]
 * Default tester email: jayden+schooldemo@amanaoshc.com.au
 *
 * The tester signs in at /client-login with that email (magic link) —
 * no password. Re-invite from /admin/centres/<id> → Portal Access to
 * change the email later.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

// `vercel env pull` writes trailing newlines into some values — trim.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SCHOOL_NAME = "Greenhill Public School (Demo)";
const TESTER_EMAIL = (process.argv[2] ?? "jayden+schooldemo@amanaoshc.com.au")
  .trim()
  .toLowerCase();
const TESTER_NAME = "Demo Principal";

// NSW-style 2026 terms. Term 1 already exists in production; 2 and 3
// are bootstrapped so the demo has a live term plus a previous one for
// the Progression tab.
const TERMS = [
  { name: "Term 2 2026", start_date: "2026-04-27", end_date: "2026-07-03", year: 2026 },
  { name: "Term 3 2026", start_date: "2026-07-20", end_date: "2026-09-25", year: 2026 },
];
const PREVIOUS_TERM = "Term 2 2026";
const CURRENT_TERM = "Term 3 2026";

const STUDENTS = [
  { first_name: "Ava",     last_name: "Nguyen",   age_group: "8-12", gender: "female" },
  { first_name: "Lucas",   last_name: "Haddad",   age_group: "8-12", gender: "male"   },
  { first_name: "Zara",    last_name: "El-Cheikh", age_group: "8-12", gender: "female" },
  { first_name: "Ethan",   last_name: "Roberts",  age_group: "8-12", gender: "male"   },
  { first_name: "Layla",   last_name: "Ibrahim",  age_group: "8-12", gender: "female" },
  { first_name: "Cooper",  last_name: "Marsh",    age_group: "8-12", gender: "male"   },
  { first_name: "Isla",    last_name: "Tran",     age_group: "5-8",  gender: "female" },
  { first_name: "Harrison", last_name: "Bourke",  age_group: "5-8",  gender: "male"   },
  { first_name: "Maryam",  last_name: "Khan",     age_group: "5-8",  gender: "female" },
  { first_name: "Jayden",  last_name: "Cole",     age_group: "5-8",  gender: "male"   },
  { first_name: "Ruby",    last_name: "Petrou",   age_group: "5-8",  gender: "female" },
  { first_name: "Xavier",  last_name: "Lopez",    age_group: "5-8",  gender: "male"   },
];

// Friday-ish delivery across Term 3, plus the next two weeks.
const SESSION_PLAN = [
  { daysOffset: -35, time: "09:15", sport: "Athletics",  duration: 60, status: "completed" },
  { daysOffset: -28, time: "09:15", sport: "Soccer",     duration: 60, status: "completed" },
  { daysOffset: -21, time: "09:15", sport: "Athletics",  duration: 60, status: "completed" },
  { daysOffset: -14, time: "09:15", sport: "Basketball", duration: 60, status: "completed" },
  { daysOffset:  -7, time: "09:15", sport: "Soccer",     duration: 60, status: "completed" },
  { daysOffset:  -2, time: "09:15", sport: "Cricket",    duration: 60, status: "completed" },
  { daysOffset:   3, time: "09:15", sport: "Athletics",  duration: 60, status: "published" },
  { daysOffset:  10, time: "09:15", sport: "Netball",    duration: 60, status: "published" },
  { daysOffset:  17, time: "09:15", sport: "Soccer",     duration: 60, status: "published" },
];

const FEEDBACK = [
  { offset: -35, rating: 5, comment: "Great energy — Year 3 were talking about the relay drills all afternoon." },
  { offset: -28, rating: 5, comment: "Well structured and the coach knew every student's name by week two." },
  { offset: -21, rating: 4, comment: "Good session. A little rushed at pack-up before the bell." },
  { offset: -14, rating: 5, comment: "Basketball was a hit — teachers noticed the sportsmanship focus." },
  { offset:  -7, rating: 5, comment: "The PDHPE mapping in the portal made our programming meeting easy." },
];

const SKILLS_BY_SPORT: Record<string, string[]> = {
  Athletics: ["Sprint technique", "Relay changeover", "Standing jump", "Pacing", "Listening & instructions"],
  Soccer: ["Dribbling control", "Passing accuracy", "First touch", "Spatial awareness", "Teamwork"],
};

// Term-over-term improvement: previous-term rating, current-term rating.
function ratingPair(seed: number, skillIdx: number): [number, number] {
  const prev = 2 + ((seed + skillIdx) % 3); // 2..4
  const bump = (seed + skillIdx) % 3 === 0 ? 0 : 1; // most skills improve
  return [prev, Math.min(5, prev + bump)];
}

const INSIGHTS: Array<{
  studentIdx: number;
  summary: string;
  strengths: string[];
  areas_for_growth: string[];
  recommendations: string[];
}> = [
  {
    studentIdx: 0,
    summary:
      "Ava has grown into a confident all-rounder this term. Her sprint technique improved markedly and she has started leading warm-ups, showing responsibility beyond her years.",
    strengths: ["Consistent effort across every sport", "Natural leadership in group activities", "Quick to apply coach corrections"],
    areas_for_growth: ["Pacing over longer distances", "Staying patient when teammates are learning"],
    recommendations: ["Give Ava a buddy role with younger students", "Introduce interval-based running games"],
  },
  {
    studentIdx: 1,
    summary:
      "Lucas started the term reluctant to join ball sports but his first touch and passing have improved two full levels. His confidence shift is the standout story of the term.",
    strengths: ["Big improvement in ball control", "Responds well to one-on-one coaching"],
    areas_for_growth: ["Confidence in competitive games", "Communication with teammates"],
    recommendations: ["Keep him in small-sided games where he gets frequent touches", "Celebrate effort publicly — it lands well with him"],
  },
  {
    studentIdx: 6,
    summary:
      "Isla brings full energy to every session. Her fundamental movement skills are ahead of her age band and she thrives on new challenges.",
    strengths: ["Excellent balance and coordination", "First to volunteer for demonstrations"],
    areas_for_growth: ["Waiting for instructions before starting", "Sharing equipment during rotations"],
    recommendations: ["Channel her energy into demonstration roles", "Pair structured turn-taking games"],
  },
  {
    studentIdx: 9,
    summary:
      "Jayden's listening and instruction-following have improved steadily. He needed reminders early in the term; by week six he was helping others follow the drill sequence.",
    strengths: ["Improved focus over the term", "Kind and encouraging to classmates"],
    areas_for_growth: ["Sprint technique fundamentals", "Confidence in front of the group"],
    recommendations: ["Short, clear instruction cues work best", "Low-pressure demonstration opportunities"],
  },
];

const OBSERVATIONS: Array<{ studentIdx: number; sessionOffset: number; text: string }> = [
  { studentIdx: 0, sessionOffset: -7, text: "Ava organised her team's positions unprompted and coached two classmates through the passing drill. Real leadership moment." },
  { studentIdx: 1, sessionOffset: -28, text: "Lucas scored his first goal in a match-play game and his whole demeanour changed — engaged for the entire session afterwards." },
  { studentIdx: 6, sessionOffset: -21, text: "Isla nailed the standing jump progression on the second attempt — ahead of the year group. Gave her the demo role." },
  { studentIdx: 8, sessionOffset: -14, text: "Maryam was hesitant at the start but joined fully after the small-group rotation. Buddying with Ruby is working well." },
];

function isoDate(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetFromToday);
  return d.toISOString().split("T")[0];
}

async function ensureTerms(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const term of TERMS) {
    const { data: existing } = await supabase
      .from("terms")
      .select("id")
      .eq("name", term.name)
      .maybeSingle();
    if (existing) {
      ids[term.name] = existing.id;
      console.log(`✓ Term exists: ${term.name}`);
      continue;
    }
    const { data, error } = await supabase
      .from("terms")
      .insert(term)
      .select("id")
      .single();
    if (error) throw error;
    ids[term.name] = data.id;
    console.log(`+ Created term: ${term.name}`);
  }

  // Exactly ONE active term, chosen by today's date — the Scope &
  // Sequence page selects `status='active'` with .single(), so a stale
  // or duplicated active term breaks the curriculum page platform-wide.
  const today = isoDate(0);
  await supabase.from("terms").update({ status: "completed" }).lt("end_date", today).neq("status", "completed");
  await supabase.from("terms").update({ status: "active" }).lte("start_date", today).gte("end_date", today).neq("status", "active");
  return ids;
}

async function ensureSchool(): Promise<string> {
  const { data: existing } = await supabase
    .from("centres")
    .select("id")
    .eq("name", SCHOOL_NAME)
    .maybeSingle();
  if (existing) {
    console.log(`✓ School exists: ${existing.id}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("centres")
    .insert({
      name: SCHOOL_NAME,
      type: "school",
      address: "45 Greenhill Road, Prestons NSW 2170",
      primary_contact_name: TESTER_NAME,
      primary_contact_email: TESTER_EMAIL,
      primary_contact_phone: "0400000001",
      primary_contact_role: "Principal",
      group_size: 24,
      age_groups: ["5-8", "8-12"],
      pricing_model: "centre_funded",
      agreed_rate: 180,
      contract_status: "active",
      health_score: 94,
      health_status: "green",
      profile_checklist_complete: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`+ Created school: ${data.id}`);
  return data.id;
}

// Demo coaches — the portal's "Our Coaches" page is the compliance
// pitch, so the demo school runs on its own coach identities with
// verified WWCC + first-aid on file. Real coaches never appear in (or
// get polluted by) the demo.
const DEMO_COACHES = [
  {
    email: "demo-coach-marcus@buildalphakids.app",
    name: "Marcus Rivera",
    wwcc: "WWC1846302E",
    firstAid: "HLTAID011-284615",
  },
  {
    email: "demo-coach-sophie@buildalphakids.app",
    name: "Sophie Tran",
    wwcc: "WWC2093417E",
    firstAid: "HLTAID011-391208",
  },
  {
    email: "demo-coach-ali@buildalphakids.app",
    name: "Ali Haddad",
    wwcc: "WWC1758226E",
    firstAid: "HLTAID011-176542",
  },
];

async function ensureDemoCoaches(): Promise<string[]> {
  const { data: userList } = await supabase.auth.admin.listUsers();
  const ids: string[] = [];

  for (const coach of DEMO_COACHES) {
    let authUserId = userList?.users?.find((u) => u.email === coach.email)?.id;
    if (!authUserId) {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: coach.email,
        email_confirm: true,
      });
      if (error || !created?.user) throw error ?? new Error("createUser failed");
      authUserId = created.user.id;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", authUserId)
      .maybeSingle();
    if (!profile) {
      const { error } = await supabase.from("profiles").insert({
        id: authUserId,
        email: coach.email,
        name: coach.name,
        role: "coach",
        status: "active",
      });
      if (error) throw error;
      console.log(`+ Created demo coach: ${coach.name}`);
    }

    const { count } = await supabase
      .from("compliance_docs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUserId);
    if ((count ?? 0) === 0) {
      const { error } = await supabase.from("compliance_docs").insert([
        {
          user_id: authUserId,
          doc_type: "wwcc",
          doc_number: coach.wwcc,
          status: "verified",
          expiry_date: "2029-03-31",
        },
        {
          user_id: authUserId,
          doc_type: "first_aid",
          doc_number: coach.firstAid,
          status: "verified",
          expiry_date: "2027-11-30",
        },
      ]);
      if (error) throw error;
      console.log(`+ Compliance on file for ${coach.name} (WWCC + first aid)`);
    }
    ids.push(authUserId);
  }
  console.log(`✓ ${ids.length} demo coaches ready`);
  return ids;
}

async function seedStudents(centreId: string): Promise<string[]> {
  const { data: existing } = await supabase
    .from("centre_children")
    .select("child_id, children!inner(first_name, last_name)")
    .eq("centre_id", centreId);
  if ((existing ?? []).length >= STUDENTS.length) {
    console.log(`✓ ${existing!.length} students already linked`);
    // Return in STUDENTS order — later steps (assessments, classes)
    // index into this array by cohort position.
    const byName = new Map(
      existing!.map((row) => {
        const c = row.children as unknown as { first_name: string; last_name: string };
        return [`${c.first_name} ${c.last_name}`, row.child_id];
      })
    );
    return STUDENTS.map((s) => byName.get(`${s.first_name} ${s.last_name}`)).filter(
      (id): id is string => !!id
    );
  }

  const ids: string[] = [];
  for (const s of STUDENTS) {
    const { data, error } = await supabase
      .from("children")
      .insert(s)
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id);
    await supabase.from("centre_children").insert({
      child_id: data.id,
      centre_id: centreId,
      status: "active",
    });
  }
  console.log(`+ Created ${ids.length} students + enrolments`);
  return ids;
}

async function seedSessions(
  centreId: string,
  termId: string,
  coachId: string
): Promise<Array<{ id: string; daysOffset: number; sport: string; status: string }>> {
  const { data: existing } = await supabase
    .from("sessions")
    .select("id, date, sport, status")
    .eq("centre_id", centreId);
  if ((existing ?? []).length >= SESSION_PLAN.length) {
    console.log(`✓ ${existing!.length} sessions already exist`);
    const today = new Date(isoDate(0));
    return existing!.map((s) => ({
      id: s.id,
      daysOffset: Math.round((new Date(s.date).getTime() - today.getTime()) / 86400000),
      sport: s.sport,
      status: s.status,
    }));
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
    headcount: s.status === "completed" ? STUDENTS.length - 1 : null,
    completed_at:
      s.status === "completed"
        ? new Date(isoDate(s.daysOffset) + "T00:30:00Z").toISOString()
        : null,
  }));
  const { data, error } = await supabase.from("sessions").insert(rows).select("id");
  if (error) throw error;
  console.log(`+ Created ${data.length} sessions`);
  return data.map((row, i) => ({
    id: row.id,
    daysOffset: SESSION_PLAN[i].daysOffset,
    sport: SESSION_PLAN[i].sport,
    status: SESSION_PLAN[i].status,
  }));
}

async function seedAttendance(
  sessions: Array<{ id: string; status: string }>,
  studentIds: string[]
) {
  const completed = sessions.filter((s) => s.status === "completed");
  if (completed.length === 0) return;

  const { count } = await supabase
    .from("session_attendances")
    .select("id", { count: "exact", head: true })
    .in("session_id", completed.map((s) => s.id));
  if ((count ?? 0) > 0) {
    console.log(`✓ Attendance already recorded (${count} rows)`);
    return;
  }

  const rows: Array<{ session_id: string; child_id: string; present: boolean }> = [];
  completed.forEach((session, si) => {
    studentIds.forEach((childId, ci) => {
      // Deterministic pattern: most students ~85-100%; student 3 misses
      // more, so the roster shows attendance variance.
      const absent = (si + ci) % 7 === 3 || (ci === 3 && si % 2 === 0);
      rows.push({ session_id: session.id, child_id: childId, present: !absent });
    });
  });
  const { error } = await supabase.from("session_attendances").insert(rows);
  if (error) throw error;
  console.log(`+ Recorded attendance: ${rows.length} rows across ${completed.length} sessions`);
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
  if ((count ?? 0) >= FEEDBACK.length) {
    console.log(`✓ ${count} feedback ratings already exist`);
    return;
  }

  const rows = FEEDBACK.map((fb) => {
    const session = sessions.find((s) => s.daysOffset === fb.offset);
    if (!session) return null;
    return {
      session_id: session.id,
      centre_id: centreId,
      coach_id: coachId,
      sport: session.sport,
      rating: fb.rating,
      comment: fb.comment,
      submitted_at: new Date(isoDate(fb.offset) + "T06:00:00Z").toISOString(),
      acknowledged_at: new Date(isoDate(fb.offset + 1) + "T00:00:00Z").toISOString(),
    };
  }).filter(Boolean);
  if (rows.length === 0) return;

  const { error } = await supabase.from("feedback_ratings").insert(rows);
  if (error) throw error;
  console.log(`+ Created ${rows.length} feedback ratings (acknowledged)`);
}

async function seedAssessments(
  centreId: string,
  termIds: Record<string, string>,
  studentIds: string[],
  coachId: string
) {
  const { count } = await supabase
    .from("skill_ratings")
    .select("id", { count: "exact", head: true })
    .in("child_id", studentIds);
  if ((count ?? 0) > 0) {
    console.log(`✓ Skill ratings already exist (${count})`);
    return;
  }

  for (const [sport, skills] of Object.entries(SKILLS_BY_SPORT)) {
    const ageGroup = sport === "Athletics" ? "8-12" : "5-8";
    const { data: template, error: tplErr } = await supabase
      .from("assessment_templates")
      .insert({
        sport,
        age_group: ageGroup,
        centre_id: centreId,
        term_id: termIds[CURRENT_TERM],
        skills_json: skills.map((skill_name) => ({ skill_name })),
        created_by: coachId,
      })
      .select("id")
      .single();
    if (tplErr) throw tplErr;

    const cohort = studentIds.filter((_, i) =>
      ageGroup === "8-12" ? i < 6 : i >= 6
    );

    const rows: object[] = [];
    cohort.forEach((childId, seed) => {
      const prevRatings = skills.map((skill_name, idx) => ({
        skill_name,
        rating: ratingPair(seed, idx)[0],
      }));
      const currRatings = skills.map((skill_name, idx) => ({
        skill_name,
        rating: ratingPair(seed, idx)[1],
      }));
      rows.push(
        {
          assessment_template_id: template.id,
          child_id: childId,
          coach_id: coachId,
          term_id: termIds[PREVIOUS_TERM],
          ratings_json: prevRatings,
          assessed_at: "2026-06-26T00:00:00Z",
        },
        {
          assessment_template_id: template.id,
          child_id: childId,
          coach_id: coachId,
          term_id: termIds[CURRENT_TERM],
          ratings_json: currRatings,
          assessed_at: new Date(isoDate(-3) + "T00:00:00Z").toISOString(),
        }
      );
    });

    const { error } = await supabase.from("skill_ratings").insert(rows);
    if (error) throw error;
    console.log(`+ ${sport}: assessed ${cohort.length} students across two terms`);
  }
}

async function seedInsights(
  centreId: string,
  termIds: Record<string, string>,
  studentIds: string[]
) {
  const { count } = await supabase
    .from("child_insights")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId);
  if ((count ?? 0) > 0) {
    console.log(`✓ Insights already exist (${count})`);
    return;
  }

  const rows = INSIGHTS.map((i) => ({
    child_id: studentIds[i.studentIdx],
    term_id: termIds[PREVIOUS_TERM],
    centre_id: centreId,
    insight_type: "term_end",
    summary: i.summary,
    strengths: i.strengths,
    areas_for_growth: i.areas_for_growth,
    recommendations: i.recommendations,
    generated_by: "demo",
    content_json: {},
  }));
  const { error } = await supabase.from("child_insights").insert(rows);
  if (error) throw error;
  console.log(`+ Created ${rows.length} development insights`);
}

async function seedObservations(
  sessions: Array<{ id: string; daysOffset: number }>,
  studentIds: string[],
  coachId: string
) {
  const sessionIds = sessions.map((s) => s.id);
  const { count } = await supabase
    .from("child_observations")
    .select("id", { count: "exact", head: true })
    .in("session_id", sessionIds);
  if ((count ?? 0) > 0) {
    console.log(`✓ Observations already exist (${count})`);
    return;
  }

  const rows = OBSERVATIONS.map((o) => {
    const session = sessions.find((s) => s.daysOffset === o.sessionOffset);
    if (!session) return null;
    return {
      session_id: session.id,
      child_id: studentIds[o.studentIdx],
      coach_id: coachId,
      observation: o.text,
      visible_to_centre: true,
    };
  }).filter(Boolean);
  if (rows.length === 0) return;

  const { error } = await supabase.from("child_observations").insert(rows);
  if (error) throw error;
  console.log(`+ Created ${rows.length} shared coach observations`);
}

async function seedReport(
  centreId: string,
  termIds: Record<string, string>,
  coachId: string
) {
  const { data: existing } = await supabase
    .from("centre_reports")
    .select("id")
    .eq("centre_id", centreId)
    .eq("term_id", termIds[PREVIOUS_TERM])
    .maybeSingle();
  if (existing) {
    console.log(`✓ Term report exists`);
    return;
  }

  const { error } = await supabase.from("centre_reports").insert({
    centre_id: centreId,
    term_id: termIds[PREVIOUS_TERM],
    title: `${SCHOOL_NAME} — Term 2 Report`,
    content_json: {
      summary:
        "10 sessions delivered across 4 sports during Term 2. Attendance held above 90% and teacher feedback averaged 4.8/5, with the strongest engagement in athletics and soccer. Skill assessments show measurable improvement for every assessed student.",
      sessions_delivered: 10,
      total_children: 12,
      sports_covered: ["Athletics", "Soccer", "Basketball", "Cricket"],
      average_rating: 4.8,
      highlights: [
        "100% of scheduled sessions delivered on time",
        "Every session mapped to NSW PDHPE outcomes in the portal",
        "12 students formally assessed across 10 fundamental skills",
        "Teacher feedback averaged 4.8/5 across the term",
      ],
      coach_notes: [
        "Year 3-4 group is ready for competitive small-sided formats next term",
        "K-2 group responds best to station rotations — continue the format",
      ],
      attendance_summary: { total_attendances: 108, average_per_session: 11 },
      assessment_summary: { children_assessed: 12, average_improvement: 0.8 },
    },
    status: "sent",
    generated_by: coachId,
    sent_at: new Date("2026-07-03T02:00:00Z").toISOString(),
  });
  if (error) throw error;
  console.log(`+ Created sent term report`);
}

async function seedInvoices(centreId: string) {
  const { data: existing } = await supabase
    .from("outbound_invoices")
    .select("id")
    .eq("centre_id", centreId)
    .limit(1);
  if ((existing ?? []).length > 0) {
    console.log(`✓ Invoices exist`);
    return;
  }

  const subtotalCents = 108000; // 6 sessions × $180
  const gstCents = Math.round(subtotalCents * 0.1);
  const totalCents = subtotalCents + gstCents;

  const { error } = await supabase.from("outbound_invoices").insert([
    {
      centre_id: centreId,
      period_start: isoDate(-35),
      period_end: isoDate(-1),
      line_items_json: [
        { description: "School sport sessions × 6", quantity: 6, rate_cents: 18000, total_cents: subtotalCents },
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
      sent_at: new Date(isoDate(-5) + "T00:00:00Z").toISOString(),
    },
  ]);
  if (error) throw error;
  console.log(`+ Created paid invoice ($${(totalCents / 100).toFixed(2)})`);
}

// ============================================================
// Programs — full session plans mapped to NSW PDHPE outcomes.
// These drive the Scope & Sequence outcome badges, the session-detail
// "program for the day", and the Programs library.
// ============================================================

const PDHPE = {
  PD2_4: { framework: "pdhpe", code: "PD2-4", title: "Performs and refines movement skills", description: "Performs and refines movement skills in a variety of sequences and situations." },
  PD2_5: { framework: "pdhpe", code: "PD2-5", title: "Solves movement challenges", description: "Demonstrates a range of movement skills and solutions to movement challenges." },
  PD2_10: { framework: "pdhpe", code: "PD2-10", title: "Works collaboratively in physical activity", description: "Demonstrates a range of interpersonal skills that build and enhance relationships in physical activity." },
  PD2_11: { framework: "pdhpe", code: "PD2-11", title: "Applies fair play and inclusion", description: "Combines movement skills and concepts while displaying fair play and cooperation." },
  PD1_4: { framework: "pdhpe", code: "PD1-4", title: "Performs fundamental movement skills", description: "Performs movement skills in a variety of climates and physical activity contexts." },
  PD1_5: { framework: "pdhpe", code: "PD1-5", title: "Proposes movement solutions", description: "Proposes a range of alternatives to solve movement challenges through participation in physical activities." },
  PD3_4: { framework: "pdhpe", code: "PD3-4", title: "Adapts movement in dynamic situations", description: "Adapts movement skills in a variety of physical activity contexts." },
} as const;

const PROGRAMS: Array<{
  sport: string;
  age_group: string;
  skill_focus: string;
  content_json: Record<string, unknown>;
}> = [
  {
    sport: "Netball",
    age_group: "8-12",
    skill_focus: "Passing, footwork & finding space",
    content_json: {
      title: "Netball — Passing, Footwork & Finding Space",
      sport: "Netball",
      ageGroup: "8-12",
      duration: 60,
      objectives: [
        "Execute chest and bounce passes with accurate technique under light pressure",
        "Apply the one-two landing and pivot without stepping",
        "Move into space to receive, calling for the ball with confidence",
      ],
      equipmentNeeded: ["Size 4 netballs", "Cones", "Bibs (2 colours)", "Portable ring"],
      warmUp: { name: "Traffic Lights", duration: 8, description: "Students dribble-free move around the court reacting to colour calls — green jog, amber side-step, red jump-stop with netball landing. Builds the stop-on-a-whistle habit the landing rule needs.", coachingTips: "Praise the first three clean jump-stops loudly — the rest of the group copies what gets noticed." },
      skillDevelopment: [
        { name: "Partner Passing Ladder", duration: 12, description: "Pairs progress chest pass → bounce pass → shoulder pass, taking one step back after 5 clean catches. Restart the count on a drop.", progressions: ["Add a defender shadowing at half pressure", "Non-dominant hand only for the last round"], coachingTips: "Watch for thumbs-behind-the-ball on chest passes — it's the one cue that fixes most wobbly throws." },
        { name: "Pivot Boxes", duration: 10, description: "Four-cone squares. Receive on the move, jump-stop inside the box, pivot to face a new corner and release within three seconds.", progressions: ["Coach calls the corner AFTER the catch", "Two balls circulating per box"], coachingTips: "Grounded foot glued — narrate 'stick, spin, sling' as a rhythm the group can chant." },
        { name: "Space Invaders", duration: 10, description: "3v1 keep-away in thirds of the court. Attackers may not stand still for more than two seconds — constant re-offering into space.", progressions: ["3v2 once attackers hit 6 straight passes", "Add a no-return-pass rule"], coachingTips: "Freeze the game when someone makes a brilliant lead into space and ask the group what made it work." },
      ],
      modifiedGame: { name: "Fast5 Thirds", duration: 15, description: "5-a-side across one third, everyone may shoot from anywhere inside the circle. Rolling subs every 2 minutes so nobody stands cold.", rules: ["Standard footwork and obstruction rules", "Every teammate must touch the ball before a shot", "Defence starts one metre off"], variations: ["Bonus point for a bounce-pass assist", "Silent minute — hand signals only"], coachingTips: "Referee loosely on contact, strictly on footwork — that's the skill of the day." },
      coolDown: { name: "Ring Circle Stretch", duration: 5, description: "Guided stretch circle around the ring; each student names one thing a teammate did well while holding the stretch." },
      curriculumOutcomes: [PDHPE.PD2_4, PDHPE.PD2_10, PDHPE.PD2_11],
    },
  },
  {
    sport: "Athletics",
    age_group: "8-12",
    skill_focus: "Sprint technique & relay changeovers",
    content_json: {
      title: "Athletics — Sprints & Relay Changeovers",
      sport: "Athletics",
      ageGroup: "8-12",
      duration: 60,
      objectives: [
        "Demonstrate tall running posture with relaxed shoulders and driving arms",
        "Perform an upsweep baton changeover inside a marked zone",
        "Pace a 200m effort rather than sprinting the first 50m",
      ],
      equipmentNeeded: ["Relay batons", "Cones", "Agility ladder", "Stopwatch"],
      warmUp: { name: "Form Runs", duration: 10, description: "Ladder drills into 20m build-ups: A-skips, high knees, butt-kicks, then three runs building from 60% to 90% effort.", coachingTips: "One cue per run only — 'tall', then 'arms', then 'relax the face'. Stacking cues overloads Stage 2." },
      skillDevelopment: [
        { name: "Falling Starts", duration: 10, description: "From standing lean, fall forward and drive out for 15m. Teaches acceleration angle without blocks.", progressions: ["Two-point crouch start", "React to a clap instead of 'go'"], coachingTips: "Push the ground BACK, not down — draw the arrow on the grass with a cone if it isn't landing." },
        { name: "Changeover Corridors", duration: 12, description: "Pairs practise upsweep changeovers walking, jogging, then at speed through a 20m marked zone. Outgoing runner starts when incoming hits the 'go' cone.", progressions: ["Full-speed with a 15m flying start", "Blind changeover on the call of 'stick!'"], coachingTips: "The receiver's hand stays a still target — chase the wobble away before you chase speed." },
        { name: "Pace Clock 200s", duration: 10, description: "Two 200m runs with a target band. Students predict their time first, then compare — teaches pacing as a solvable puzzle.", progressions: ["Negative-split challenge: second 100m faster than the first"], coachingTips: "Celebrate accurate predictions louder than fast times — that's the learning objective." },
      ],
      modifiedGame: { name: "Continuous Relay", duration: 13, description: "Teams of four spread around a 200m loop, running continuous relay legs for 8 minutes. Most completed changeovers wins — not fastest laps.", rules: ["Changeovers only inside marked zones", "Dropped baton: return to the zone and re-run the exchange"], variations: ["Reverse direction halfway", "Mystery leg length draw"], coachingTips: "Score changeovers, not speed — it flips who the stars of the session are." },
      coolDown: { name: "Walking Lap Debrief", duration: 5, description: "Slow lap in pairs; each pair agrees the one thing that made their best changeover work and reports it back." },
      curriculumOutcomes: [PDHPE.PD2_4, PDHPE.PD2_5, PDHPE.PD3_4],
    },
  },
  {
    sport: "Soccer",
    age_group: "5-8",
    skill_focus: "Dribbling control & first touch",
    content_json: {
      title: "Soccer — Dribbling Control & First Touch",
      sport: "Soccer",
      ageGroup: "5-8",
      duration: 60,
      objectives: [
        "Keep the ball within one step while dribbling through traffic",
        "Cushion a rolled ball with the inside of either foot",
        "Look up at least once before passing",
      ],
      equipmentNeeded: ["Size 3 balls (one each)", "Cones", "Mini goals", "Bibs"],
      warmUp: { name: "Toe Taps & Traffic", duration: 8, description: "Everyone with a ball: toe taps, sole rolls, then free dribbling in a shrinking square — the space gets smaller, the touches get softer.", coachingTips: "Shrink the square slowly and silently — the game does the coaching." },
      skillDevelopment: [
        { name: "Red Light, Green Light", duration: 10, description: "Dribble towards the coach; on 'red' the ball must stop dead under the sole. Last-moving ball restarts.", progressions: ["'Yellow' = dribble backwards", "Coach shows colours silently on cards"], coachingTips: "Little touches win this game — say 'baby touches' and demonstrate the difference big vs small." },
        { name: "Gate Dribbling", duration: 10, description: "Score a point for each cone gate dribbled through in 60 seconds. Two rounds — beat your own score.", progressions: ["Weak foot only", "Carry a second ball in hands"], coachingTips: "Pair the score chase with heads-up scanning: gates 'close' if another player is in them." },
        { name: "Cushion Catch", duration: 10, description: "Partners roll the ball in; receiver cushions with the inside of the foot so it stops within a hoop.", progressions: ["Receive on the move", "Cushion then pass back through a gate"], coachingTips: "'Soft like catching an egg' lands better than any technical cue at this age." },
      ],
      modifiedGame: { name: "Four Goals Chaos", duration: 17, description: "3v3 with four mini goals — any team can score in any goal. Rewards heads-up dribbling and quick direction changes.", rules: ["No goalkeepers", "Kick-ins instead of throw-ins", "All-touch rule: everyone touches before a goal counts"], variations: ["Two balls at once for one chaotic minute", "Champions stay on, two-minute games"], coachingTips: "Referee almost nothing — count touches and celebrate the quietest kid's first goal loudest." },
      coolDown: { name: "Ball-Balance Stretch", duration: 5, description: "Seated stretches with the ball held overhead / behind the back; finish with each student's 'best touch of the day'." },
      curriculumOutcomes: [PDHPE.PD1_4, PDHPE.PD1_5, PDHPE.PD2_10],
    },
  },
  {
    sport: "Basketball",
    age_group: "8-12",
    skill_focus: "Ball handling & give-and-go",
    content_json: {
      title: "Basketball — Ball Handling & Give-and-Go",
      sport: "Basketball",
      ageGroup: "8-12",
      duration: 60,
      objectives: [
        "Dribble with eyes up using both hands",
        "Execute a give-and-go cut at game speed",
        "Use a two-foot jump stop to avoid travelling under pressure",
      ],
      equipmentNeeded: ["Size 5 basketballs", "Cones", "Bibs", "Portable hoops"],
      warmUp: { name: "Dribble Tag", duration: 8, description: "Everyone dribbles; three taggers try to tip loose balls. Tipped? Do five crossovers and rejoin.", coachingTips: "Rotate taggers fast — 90 seconds each keeps intensity honest." },
      skillDevelopment: [
        { name: "Mirror Dribbling", duration: 10, description: "Pairs face off; the leader changes hands, height and speed, the mirror copies. Swap on the whistle.", progressions: ["Add a between-the-legs option", "Mirror while walking the sideline"], coachingTips: "Eyes on your partner's eyes — the drill silently forces heads-up handling." },
        { name: "Give-and-Go Lanes", duration: 12, description: "Pass to the coach or a wall-player, cut hard to the hoop, receive the return for a lay-up. Both sides of the floor.", progressions: ["Add a trailing defender", "Finish with the non-dominant hand"], coachingTips: "The cut sells it: 'walk, then GO' — change of pace beats change of direction at this level." },
        { name: "Jump-Stop Finishing", duration: 10, description: "Speed dribble to the elbow, two-foot jump stop, pump fake, finish. Cycles of six per hoop.", progressions: ["Defender closes out on the catch", "One-dribble euro after the stop"], coachingTips: "Land like a ninja — quiet feet mean balanced feet." },
      ],
      modifiedGame: { name: "3v3 No-Dribble Zones", duration: 15, description: "Half-court 3v3 with taped zones where dribbling is banned — passing and cutting take over inside them.", rules: ["Make-it-take-it to 6", "Every basket preceded by a cut", "Defence must touch the key between possessions"], variations: ["All-passing final round", "Give-and-go baskets worth double"], coachingTips: "Call out every give-and-go by name — the pattern spreads within minutes." },
      coolDown: { name: "Free-Throw Wind-Down", duration: 5, description: "Two calm free-throws each while the group stretches; session recap between shooters." },
      curriculumOutcomes: [PDHPE.PD2_4, PDHPE.PD2_5, PDHPE.PD2_11],
    },
  },
  {
    sport: "Cricket",
    age_group: "5-8",
    skill_focus: "Throwing, catching & striking",
    content_json: {
      title: "Cricket — Throwing, Catching & Striking",
      sport: "Cricket",
      ageGroup: "5-8",
      duration: 60,
      objectives: [
        "Throw overarm at a target with a side-on stance",
        "Catch a looped ball with soft 'crocodile' hands",
        "Strike a stationary ball off a tee with a straight bat swing",
      ],
      equipmentNeeded: ["Kanga balls", "Plastic bats", "Batting tees", "Cones", "Stumps"],
      warmUp: { name: "Rob the Nest", duration: 8, description: "Teams race to collect balls from a centre hoop one at a time — sprinting, bending, carrying. Sneaky fielding fitness.", coachingTips: "Ban throwing in the warm-up round; add underarm throws to teammates in round two." },
      skillDevelopment: [
        { name: "Target Bowling Alley", duration: 10, description: "Overarm throws at stumps from 5m, stepping back one cone per hit. Side-on, point, pull.", progressions: ["Bounce the ball into a hoop before the stumps", "Moving target: coach walks the stumps"], coachingTips: "'Point at the stumps with your front hand' fixes 80% of front-on throwing." },
        { name: "Crocodile Catches", duration: 10, description: "Partners loop underarm catches; hands together like a crocodile mouth that snaps shut. Five catches, take a step back.", progressions: ["One-hand catches on the strong side", "Catch after one bounce off a cone"], coachingTips: "Watch the ball INTO the hands — ask them to tell you the ball's colour as they catch." },
        { name: "Tee Strike Stations", duration: 12, description: "Three tee stations: hit through a gate, hit over a rope, hit and run to a cone. Rotate every four hits.", progressions: ["Drop-feed instead of tee at station one", "Call the gate before the swing"], coachingTips: "Straight swings beat big swings — 'chop the tree, don't swat the fly'." },
      ],
      modifiedGame: { name: "Continuous Kanga Cricket", duration: 15, description: "Everyone bats in pairs for two overs regardless of dismissals; fielders rotate through every position. Runs minus wickets is the pair score.", rules: ["Batters swap ends every hit", "Everyone bowls one over (underarm allowed)", "No LBW, no arguments"], variations: ["Double runs for hits through the V", "Fielding team earns a run per clean catch-and-return"], coachingTips: "Keep the game moving — a bored fielder at this age is a cartwheeling fielder." },
      coolDown: { name: "Circle Catch Countdown", duration: 5, description: "Whole-group circle: 20 catches without a drop, counting down out loud, then stretch." },
      curriculumOutcomes: [PDHPE.PD1_4, PDHPE.PD1_5, PDHPE.PD2_10],
    },
  },
];

async function seedPrograms(coachId: string): Promise<Map<string, string>> {
  const bySport = new Map<string, string>();
  for (const prog of PROGRAMS) {
    const { data: existing } = await supabase
      .from("programs")
      .select("id")
      .eq("sport", prog.sport)
      .eq("skill_focus", prog.skill_focus)
      .maybeSingle();
    if (existing) {
      bySport.set(prog.sport, existing.id);
      continue;
    }
    const { data, error } = await supabase
      .from("programs")
      .insert({
        sport: prog.sport,
        age_group: prog.age_group,
        duration_minutes: 60,
        skill_focus: prog.skill_focus,
        content_json: prog.content_json,
        created_by: coachId,
      })
      .select("id")
      .single();
    if (error) throw error;
    bySport.set(prog.sport, data.id);
  }
  console.log(`✓ ${bySport.size} PDHPE-mapped programs ready`);
  return bySport;
}

// Wire every demo session to a demo coach (via session_coaches — the
// P5 single write path; the trigger maintains sessions.coach_id) and
// to the program for its sport. Also repoints historical rows that an
// earlier seed attached to a real coach.
async function wireSessionsToCoachesAndPrograms(
  centreId: string,
  coachIds: string[],
  programsBySport: Map<string, string>
) {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, sport, coach_id, program_id")
    .eq("centre_id", centreId)
    .order("date");

  let wired = 0;
  for (const [i, s] of (sessions ?? []).entries()) {
    const coachId = coachIds[i % coachIds.length];
    if (!coachIds.includes(s.coach_id ?? "")) {
      await supabase
        .from("session_coaches")
        .delete()
        .eq("session_id", s.id);
      const { error } = await supabase
        .from("session_coaches")
        .insert({ session_id: s.id, user_id: coachId, is_primary: true });
      if (error) throw error;
      wired++;
    }
    const programId = programsBySport.get(s.sport);
    if (programId && s.program_id !== programId) {
      await supabase.from("sessions").update({ program_id: programId }).eq("id", s.id);
    }
  }
  if (wired > 0) console.log(`+ Reassigned ${wired} sessions to demo coaches`);

  // Repoint history rows so no real coach carries demo data.
  const { data: wiredSessions } = await supabase
    .from("sessions")
    .select("id, coach_id")
    .eq("centre_id", centreId);
  for (const s of wiredSessions ?? []) {
    if (!s.coach_id) continue;
    await supabase
      .from("feedback_ratings")
      .update({ coach_id: s.coach_id })
      .eq("session_id", s.id)
      .neq("coach_id", s.coach_id);
    await supabase
      .from("child_observations")
      .update({ coach_id: s.coach_id })
      .eq("session_id", s.id)
      .neq("coach_id", s.coach_id);
  }
  await supabase
    .from("skill_ratings")
    .update({ coach_id: coachIds[0] })
    .in(
      "child_id",
      (
        await supabase.from("centre_children").select("child_id").eq("centre_id", centreId)
      ).data?.map((r) => r.child_id) ?? []
    )
    .not("coach_id", "in", `(${coachIds.join(",")})`);
  await supabase
    .from("assessment_templates")
    .update({ created_by: coachIds[0] })
    .eq("centre_id", centreId)
    .not("created_by", "in", `(${coachIds.join(",")})`);
  await supabase
    .from("centre_reports")
    .update({ generated_by: coachIds[0] })
    .eq("centre_id", centreId)
    .not("generated_by", "in", `(${coachIds.join(",")})`);
  console.log("✓ Sessions, programs and history wired to demo coaches");
}

// Keep the demo evergreen: completed sessions never sit in the future,
// stale published sessions get completed with attendance, and the next
// seven days ALWAYS include a Netball session — the proposal's "click
// this week's session" moment. Run before sending any proposal.
async function refreshSchedule(
  centreId: string,
  termId: string,
  coachIds: string[],
  programsBySport: Map<string, string>,
  studentIds: string[]
) {
  const today = isoDate(0);

  // 1. Complete anything published that's now in the past.
  const { data: stale } = await supabase
    .from("sessions")
    .select("id")
    .eq("centre_id", centreId)
    .eq("status", "published")
    .lt("date", today);
  for (const s of stale ?? []) {
    await supabase
      .from("sessions")
      .update({
        status: "completed",
        headcount: STUDENTS.length - 1,
        completed_at: new Date().toISOString(),
      })
      .eq("id", s.id);
    const { count } = await supabase
      .from("session_attendances")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id);
    if ((count ?? 0) === 0) {
      await supabase.from("session_attendances").insert(
        studentIds.map((childId, ci) => ({
          session_id: s.id,
          child_id: childId,
          present: ci % 8 !== 5,
        }))
      );
    }
  }
  if ((stale ?? []).length > 0) {
    console.log(`+ Completed ${stale!.length} stale sessions with attendance`);
  }

  // 2. Guarantee upcoming sessions: Netball within 7 days, then two more.
  const nextWednesday = (() => {
    const d = new Date();
    const add = (3 - d.getDay() + 7) % 7 || 7; // next Wed, never today
    return isoDate(add);
  })();
  const upcomingPlan = [
    { date: nextWednesday, sport: "Netball" },
    { date: isoDate(9), sport: "Basketball" },
    { date: isoDate(16), sport: "Athletics" },
  ];
  const { data: upcoming } = await supabase
    .from("sessions")
    .select("id, sport, date")
    .eq("centre_id", centreId)
    .eq("status", "published")
    .gte("date", today);

  for (const plan of upcomingPlan) {
    const existing = (upcoming ?? []).find((s) => s.sport === plan.sport);
    if (existing) {
      if (existing.date !== plan.date) {
        await supabase.from("sessions").update({ date: plan.date }).eq("id", existing.id);
      }
      continue;
    }
    const { data: created, error } = await supabase
      .from("sessions")
      .insert({
        term_id: termId,
        date: plan.date,
        time: "09:15",
        duration_minutes: 60,
        centre_id: centreId,
        sport: plan.sport,
        status: "published",
        program_id: programsBySport.get(plan.sport) ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    await supabase
      .from("session_coaches")
      .insert({ session_id: created.id, user_id: coachIds[0], is_primary: true });
  }

  // 3. Class-targeted scheduling demo: the Netball session targets 3B +
  //    5/6M so the portal shows class badges and the coach sheet shows
  //    the teachers. The other upcoming sessions stay whole-school on
  //    purpose — the contrast is part of the demo.
  const { data: targetClasses } = await supabase
    .from("school_classes")
    .select("id")
    .eq("centre_id", centreId)
    .in("name", ["3B", "5/6M"]);
  if ((targetClasses ?? []).length > 0) {
    await supabase
      .from("sessions")
      .update({ school_class_ids: targetClasses!.map((c) => c.id) })
      .eq("centre_id", centreId)
      .eq("sport", "Netball")
      .eq("status", "published")
      .gte("date", today)
      .is("school_class_ids", null);
  }

  console.log(`✓ Upcoming schedule fresh — Netball on ${nextWednesday}`);
}

const DEMO_VIEWER_EMAIL = "demo-viewer@buildalphakids.app";

// The account behind the shareable /demo/school link: non-primary, so
// visiting principals get the full read/feedback/messaging experience
// with no settings powers.
async function seedDemoViewer(centreId: string) {
  const { data: existing } = await supabase
    .from("client_users")
    .select("id")
    .eq("centre_id", centreId)
    .eq("email", DEMO_VIEWER_EMAIL)
    .maybeSingle();
  if (existing) {
    console.log(`✓ Demo viewer account exists`);
    return;
  }
  const { data: userList } = await supabase.auth.admin.listUsers();
  let authUserId = userList?.users?.find((u) => u.email === DEMO_VIEWER_EMAIL)?.id;
  if (!authUserId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: DEMO_VIEWER_EMAIL,
      email_confirm: true,
    });
    if (error || !created?.user) throw error ?? new Error("createUser failed");
    authUserId = created.user.id;
  }
  const { error } = await supabase.from("client_users").insert({
    user_id: authUserId,
    centre_id: centreId,
    name: "Visiting Principal",
    email: DEMO_VIEWER_EMAIL,
    is_primary: false,
    welcomed_at: new Date().toISOString(),
  });
  if (error) throw error;
  console.log(`+ Created demo viewer (non-primary): ${DEMO_VIEWER_EMAIL}`);
}

// Class list (migration 080): students 0-5 are the 8-12 cohort, 6-11
// the 5-8 cohort — split across four classes incl. a composite.
const CLASSES: Array<{
  name: string;
  year_group: string;
  teacher_name: string;
  studentIdxs: number[];
}> = [
  { name: "KM", year_group: "K", teacher_name: "Ms Morrison", studentIdxs: [6, 7, 8] },
  { name: "1G", year_group: "1", teacher_name: "Mr Georgiou", studentIdxs: [9, 10, 11] },
  { name: "3B", year_group: "3", teacher_name: "Mrs Bennett", studentIdxs: [0, 1, 2] },
  { name: "5/6M", year_group: "5/6", teacher_name: "Mr Malouf", studentIdxs: [3, 4, 5] },
];

async function seedClasses(centreId: string, studentIds: string[]) {
  const { count } = await supabase
    .from("school_classes")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId);
  if ((count ?? 0) > 0) {
    console.log(`✓ Classes already exist (${count})`);
    return;
  }

  for (const cls of CLASSES) {
    const { data: created, error } = await supabase
      .from("school_classes")
      .insert({
        centre_id: centreId,
        name: cls.name,
        year_group: cls.year_group,
        school_year: 2026,
        teacher_name: cls.teacher_name,
      })
      .select("id")
      .single();
    if (error) throw error;
    const { error: memberErr } = await supabase.from("school_class_children").insert(
      cls.studentIdxs.map((i) => ({ class_id: created.id, child_id: studentIds[i] }))
    );
    if (memberErr) throw memberErr;
  }
  console.log(`+ Created ${CLASSES.length} classes with memberships`);
}

async function seedTesterAccount(centreId: string) {
  const { data: existing } = await supabase
    .from("client_users")
    .select("id, email")
    .eq("centre_id", centreId)
    .eq("email", TESTER_EMAIL)
    .maybeSingle();
  if (existing) {
    console.log(`✓ Tester account exists: ${existing.email}`);
    return;
  }

  // Find-or-create the auth user (magic-link only, no password).
  const { data: userList } = await supabase.auth.admin.listUsers();
  let authUserId = userList?.users?.find((u) => u.email === TESTER_EMAIL)?.id;
  if (!authUserId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: TESTER_EMAIL,
      email_confirm: true,
    });
    if (error || !created?.user) throw error ?? new Error("createUser failed");
    authUserId = created.user.id;
    console.log(`+ Created auth user for ${TESTER_EMAIL}`);
  }

  const { error: insertErr } = await supabase.from("client_users").insert({
    user_id: authUserId,
    centre_id: centreId,
    name: TESTER_NAME,
    email: TESTER_EMAIL,
    is_primary: true,
  });
  if (insertErr) throw insertErr;
  console.log(`+ Created portal login (primary): ${TESTER_EMAIL}`);
}

async function main() {
  console.log(`Seeding demo school "${SCHOOL_NAME}"…\n`);

  const termIds = await ensureTerms();
  const centreId = await ensureSchool();
  const coachIds = await ensureDemoCoaches();
  const coachId = coachIds[0];
  const studentIds = await seedStudents(centreId);
  const sessions = await seedSessions(centreId, termIds[CURRENT_TERM], coachId);
  await seedAttendance(sessions, studentIds);
  await seedFeedback(centreId, sessions, coachId);
  await seedAssessments(centreId, termIds, studentIds, coachId);
  await seedInsights(centreId, termIds, studentIds);
  await seedObservations(sessions, studentIds, coachId);
  await seedReport(centreId, termIds, coachId);
  await seedInvoices(centreId);
  await seedClasses(centreId, studentIds);
  const programsBySport = await seedPrograms(coachId);
  await wireSessionsToCoachesAndPrograms(centreId, coachIds, programsBySport);
  await refreshSchedule(
    centreId,
    termIds[CURRENT_TERM],
    coachIds,
    programsBySport,
    studentIds
  );
  await seedDemoViewer(centreId);
  await seedTesterAccount(centreId);

  console.log(`\nDone. Demo school id: ${centreId}`);
  console.log(`Shareable demo link: https://buildalphakids.app/demo/school`);
  console.log(`Primary tester (magic link): ${TESTER_EMAIL}`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
