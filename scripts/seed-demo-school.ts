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
  const coachId = await getFirstActiveCoach();
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
  await seedTesterAccount(centreId);

  console.log(`\nDone. Demo school id: ${centreId}`);
  console.log(`Sign in at /client-login as ${TESTER_EMAIL} (magic link).`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
