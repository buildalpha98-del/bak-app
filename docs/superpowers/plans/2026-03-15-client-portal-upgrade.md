# Client Portal Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the client portal from a read-only data viewer into a compelling selling point that proves BAK's value to centres/schools through visual impact dashboards, curriculum-aligned programs, compliance documents, AI-generated reflections, and interactive feedback.

**Architecture:** 9 features split into 5 parallel chunks. No new database tables needed — we leverage existing `programs`, `documents`, `profiles`, `compliance_docs`, `sessions`, `feedback_ratings`, `centre_reports`, and `health_scores` tables. AI features use the existing Anthropic Claude integration. New server actions in `lib/client/` serve the client portal. Curriculum outcomes (EYLF for childcare, PDHPE for schools) are added to the AI program generation prompt and stored in the existing `content_json` field.

**Tech Stack:** Next.js App Router, TypeScript, recharts (charts), @react-pdf/renderer (PDF reports), Anthropic Claude API (reflections), Supabase (data), Tailwind v4

---

## File Structure

### New Files
```
lib/client/impact-actions.ts          — Impact dashboard data aggregation
lib/client/curriculum-actions.ts       — Scope & sequence, outcomes, reflections
lib/client/staff-actions.ts            — Staff verification data
lib/client/feedback-actions.ts         — Centre feedback submission
lib/client/calendar-actions.ts         — iCal export generation

app/(dashboard)/client/[centreId]/impact/page.tsx         — Impact dashboard
app/(dashboard)/client/[centreId]/curriculum/page.tsx      — Scope & sequence
app/(dashboard)/client/[centreId]/resources/page.tsx       — Risk assessments & documents
app/(dashboard)/client/[centreId]/staff/page.tsx           — Staff verification
app/(dashboard)/client/[centreId]/feedback/page.tsx        — Session feedback

app/api/client/[centreId]/calendar/route.ts               — iCal endpoint
app/api/client/[centreId]/report-pdf/route.ts              — PDF report endpoint

components/client/impact-charts.tsx     — recharts wrappers for impact dashboard
components/client/scope-sequence.tsx    — Week-by-week curriculum view
components/client/session-reflection.tsx — AI reflection prompt with copy button
components/client/outcome-badges.tsx    — EYLF/PDHPE curriculum badges
components/client/staff-card.tsx        — Coach card with WWCC verification
components/client/feedback-form.tsx     — Session rating + comment form
components/client/report-pdf-template.tsx — React-PDF term report template
```

### Modified Files
```
lib/ai/generate-program.ts            — Add EYLF/PDHPE outcomes to AI prompt
lib/ai/types.ts                        — Add outcomes fields to ProgramContentJson
components/shared/navigation/nav-config.ts — Add new client nav items
```

---

## Chunk 1: Data Layer & AI Outcomes

### Task 1: Add Curriculum Outcomes to AI Program Generation

**Files:**
- Modify: `lib/ai/types.ts`
- Modify: `lib/ai/generate-program.ts`

**Context:** The AI already generates programs via Claude. We need to add EYLF outcomes (childcare: 3-5 age group) and PDHPE/HPE outcomes (schools: 5-8, 8-12 age groups) to the generated content_json. These get stored in the existing `content_json` field of the `programs` table — no schema change needed.

- [ ] **Step 1: Add outcome types to ProgramContentJson**

In `lib/ai/types.ts`, add to the `ProgramContentJson` interface:

```typescript
// Add these fields to ProgramContentJson:
curriculumOutcomes?: CurriculumOutcome[];
reflectionPrompt?: string;  // AI-generated reflection prompt for educators

// Add this new interface:
export interface CurriculumOutcome {
  framework: "eylf" | "pdhpe" | "hpe";
  code: string;        // e.g., "EYLF 3.2" or "PDHPE S3.8"
  title: string;       // e.g., "Children take increasing responsibility for their own health and physical wellbeing"
  description: string;  // How this session addresses the outcome
}
```

- [ ] **Step 2: Update the AI generation prompt**

In `lib/ai/generate-program.ts`, update the system prompt to include curriculum alignment. Add after the existing age-appropriate guidance:

```
## Curriculum Alignment

Based on the age group, include relevant curriculum outcomes:

### For ages 3-5 (Early Childhood / Childcare):
Use the Early Years Learning Framework (EYLF) V2.0 outcomes:
- Outcome 1: Children have a strong sense of identity (1.1-1.4)
- Outcome 2: Children are connected with and contribute to their world (2.1-2.4)
- Outcome 3: Children have a strong sense of wellbeing (3.1-3.2)
- Outcome 4: Children are confident and involved learners (4.1-4.5)
- Outcome 5: Children are effective communicators (5.1-5.5)

Most sports sessions will align with Outcome 3 (wellbeing/physical), Outcome 1 (identity/confidence), and Outcome 4 (learning dispositions). Select 2-4 specific sub-outcomes that genuinely apply.

### For ages 5-8 and 8-12 (Schools):
Use NSW PDHPE syllabus outcomes. Select 2-3 that apply:
- PDe-1 / PD1-6 / PD2-6: Movement skill and performance
- PDe-3 / PD1-7 / PD2-7: Active lifestyle and fitness
- PDe-6 / PD1-9 / PD2-9: Safe practices
- PDe-2 / PD1-3 / PD2-3: Interpersonal relationships / teamwork

### Reflection Prompt
Also generate a "reflectionPrompt" field: a 2-3 sentence paragraph that an educator could use as a starting point for their daily reflection or learning journal entry about this session. Write it in first person as if the educator is reflecting. Reference specific activities from the session and the curriculum outcomes addressed.

Include these in the JSON response as:
- "curriculumOutcomes": [{ "framework": "eylf"|"pdhpe", "code": "...", "title": "...", "description": "..." }]
- "reflectionPrompt": "..."
```

Also add `centreType?: "childcare_centre" | "school"` to `GenerateProgramRequest` so the AI knows which framework to use.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/types.ts lib/ai/generate-program.ts
git commit -m "feat: add EYLF and PDHPE curriculum outcomes to AI program generation"
```

---

### Task 2: Impact Dashboard Server Actions

**Files:**
- Create: `lib/client/impact-actions.ts`

**Context:** Aggregates data from existing tables for the impact dashboard charts. No new tables.

- [ ] **Step 1: Create impact data actions**

Create `lib/client/impact-actions.ts`:

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ImpactStats {
  sessionsThisTerm: number;
  sessionsLastTerm: number;
  totalChildren: number;
  uniqueSportsDelivered: number;
  averageRating: number;
  attendanceRate: number;
  totalSessionsAllTime: number;
}

export interface AttendanceTrend {
  week: string;       // "Week 1", "Week 2"...
  date: string;       // ISO date of Monday
  headcount: number;
  sessions: number;
}

export interface RatingTrend {
  month: string;      // "Jan", "Feb"...
  rating: number;
}

export interface SportBreakdown {
  sport: string;
  sessions: number;
  percentage: number;
}

export async function getImpactDashboard(centreId: string) {
  const supabase = await createSupabaseServerClient();

  // Get active term
  const { data: activeTerm } = await supabase
    .from("terms")
    .select("id, name, start_date, end_date")
    .eq("status", "active")
    .single();

  // Get previous term
  const { data: prevTerm } = await supabase
    .from("terms")
    .select("id")
    .eq("status", "completed")
    .order("end_date", { ascending: false })
    .limit(1)
    .single();

  // Sessions this term
  const { count: sessionsThisTerm } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .eq("term_id", activeTerm?.id ?? "");

  // Sessions last term
  const { count: sessionsLastTerm } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .eq("term_id", prevTerm?.id ?? "");

  // Total children
  const { count: totalChildren } = await supabase
    .from("centre_children")
    .select("id", { count: "exact", head: true })
    .eq("centre_id", centreId)
    .eq("status", "active");

  // All completed sessions for this centre (for trends)
  const { data: allSessions } = await supabase
    .from("sessions")
    .select("id, date, sport, headcount, status")
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .order("date", { ascending: true });

  // Average rating (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const { data: ratings } = await supabase
    .from("feedback_ratings")
    .select("rating, created_at")
    .eq("centre_id", centreId)
    .not("rating", "is", null)
    .gte("created_at", sixMonthsAgo.toISOString());

  const avgRating = ratings && ratings.length > 0
    ? ratings.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratings.length
    : 0;

  // Attendance rate
  const { data: attendances } = await supabase
    .from("session_attendances")
    .select("present, session_id, sessions!inner(centre_id, status)")
    .eq("sessions.centre_id", centreId)
    .eq("sessions.status", "completed");

  const attendanceRate = attendances && attendances.length > 0
    ? (attendances.filter((a) => a.present).length / attendances.length) * 100
    : 0;

  // Sport breakdown
  const sportCounts: Record<string, number> = {};
  for (const s of allSessions ?? []) {
    sportCounts[s.sport] = (sportCounts[s.sport] || 0) + 1;
  }
  const totalSessions = allSessions?.length ?? 0;
  const sportBreakdown: SportBreakdown[] = Object.entries(sportCounts)
    .map(([sport, sessions]) => ({
      sport,
      sessions,
      percentage: totalSessions > 0 ? Math.round((sessions / totalSessions) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // Weekly attendance trend (current term)
  const attendanceTrend: AttendanceTrend[] = [];
  if (activeTerm && allSessions) {
    const termSessions = allSessions.filter((s) => s.date >= activeTerm.start_date && s.date <= activeTerm.end_date);
    const termStart = new Date(activeTerm.start_date);
    let weekNum = 1;
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(termStart);
      weekStart.setDate(termStart.getDate() + i * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekSessions = termSessions.filter((s) => s.date >= weekStart.toISOString().slice(0, 10) && s.date <= weekEnd.toISOString().slice(0, 10));
      if (weekSessions.length > 0) {
        attendanceTrend.push({
          week: `Week ${weekNum}`,
          date: weekStart.toISOString().slice(0, 10),
          headcount: weekSessions.reduce((sum, s) => sum + (s.headcount ?? 0), 0),
          sessions: weekSessions.length,
        });
      }
      weekNum++;
    }
  }

  // Monthly rating trend (last 6 months)
  const ratingTrend: RatingTrend[] = [];
  if (ratings) {
    const monthBuckets: Record<string, number[]> = {};
    for (const r of ratings) {
      const month = new Date(r.created_at).toLocaleString("en-AU", { month: "short" });
      if (!monthBuckets[month]) monthBuckets[month] = [];
      monthBuckets[month].push(r.rating ?? 0);
    }
    for (const [month, vals] of Object.entries(monthBuckets)) {
      ratingTrend.push({
        month,
        rating: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      });
    }
  }

  return {
    stats: {
      sessionsThisTerm: sessionsThisTerm ?? 0,
      sessionsLastTerm: sessionsLastTerm ?? 0,
      totalChildren: totalChildren ?? 0,
      uniqueSportsDelivered: Object.keys(sportCounts).length,
      averageRating: Math.round(avgRating * 10) / 10,
      attendanceRate: Math.round(attendanceRate),
      totalSessionsAllTime: totalSessions,
    },
    attendanceTrend,
    ratingTrend,
    sportBreakdown,
    termName: activeTerm?.name ?? "Current Term",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/client/impact-actions.ts
git commit -m "feat: add impact dashboard server actions for client portal"
```

---

### Task 3: Staff Verification Server Actions

**Files:**
- Create: `lib/client/staff-actions.ts`

- [ ] **Step 1: Create staff verification actions**

Create `lib/client/staff-actions.ts`:

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface VerifiedCoach {
  id: string;
  name: string;
  photo_url: string | null;
  date_of_birth: string | null;
  sports: string[];
  wwcc: {
    status: string;      // "verified" | "pending" | "expired"
    expiry_date: string | null;
    document_number?: string;  // Last 4 chars only for privacy
  } | null;
  firstAid: {
    status: string;
    expiry_date: string | null;
  } | null;
  sessionsAtCentre: number;
  lastSessionDate: string | null;
}

export async function getCentreCoaches(centreId: string): Promise<VerifiedCoach[]> {
  const supabase = await createSupabaseServerClient();

  // Get all coaches who have had sessions at this centre
  const { data: sessions } = await supabase
    .from("sessions")
    .select("coach_id, sport, date")
    .eq("centre_id", centreId)
    .not("coach_id", "is", null)
    .in("status", ["completed", "confirmed", "published", "pending_confirmation"]);

  if (!sessions || sessions.length === 0) return [];

  // Group by coach
  const coachMap: Record<string, { sports: Set<string>; count: number; lastDate: string }> = {};
  for (const s of sessions) {
    if (!s.coach_id) continue;
    if (!coachMap[s.coach_id]) {
      coachMap[s.coach_id] = { sports: new Set(), count: 0, lastDate: s.date };
    }
    coachMap[s.coach_id].sports.add(s.sport);
    coachMap[s.coach_id].count++;
    if (s.date > coachMap[s.coach_id].lastDate) {
      coachMap[s.coach_id].lastDate = s.date;
    }
  }

  const coachIds = Object.keys(coachMap);

  // Get profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, photo_url, date_of_birth")
    .in("id", coachIds);

  // Get compliance docs
  const { data: compDocs } = await supabase
    .from("compliance_docs")
    .select("coach_id, doc_type, status, expiry_date, document_number")
    .in("coach_id", coachIds)
    .in("doc_type", ["wwcc", "first_aid"]);

  // Build results
  const coaches: VerifiedCoach[] = [];
  for (const profile of profiles ?? []) {
    const info = coachMap[profile.id];
    if (!info) continue;

    const wwccDoc = compDocs?.find((d) => d.coach_id === profile.id && d.doc_type === "wwcc");
    const firstAidDoc = compDocs?.find((d) => d.coach_id === profile.id && d.doc_type === "first_aid");

    coaches.push({
      id: profile.id,
      name: profile.name,
      photo_url: profile.photo_url,
      date_of_birth: profile.date_of_birth,
      sports: Array.from(info.sports),
      wwcc: wwccDoc
        ? {
            status: wwccDoc.status,
            expiry_date: wwccDoc.expiry_date,
            document_number: wwccDoc.document_number
              ? `...${wwccDoc.document_number.slice(-4)}`
              : null,
          }
        : null,
      firstAid: firstAidDoc
        ? { status: firstAidDoc.status, expiry_date: firstAidDoc.expiry_date }
        : null,
      sessionsAtCentre: info.count,
      lastSessionDate: info.lastDate,
    });
  }

  return coaches.sort((a, b) => {
    const dateA = a.lastSessionDate ?? "";
    const dateB = b.lastSessionDate ?? "";
    return dateB.localeCompare(dateA);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/client/staff-actions.ts
git commit -m "feat: add staff verification server actions for client portal"
```

---

### Task 4: Curriculum, Reflection & Feedback Actions

**Files:**
- Create: `lib/client/curriculum-actions.ts`
- Create: `lib/client/feedback-actions.ts`
- Create: `lib/client/calendar-actions.ts`

- [ ] **Step 1: Create curriculum/reflection actions**

Create `lib/client/curriculum-actions.ts`:

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export interface WeeklyProgramEntry {
  weekNumber: number;
  weekStartDate: string;
  sessions: {
    id: string;
    date: string;
    sport: string;
    coach_name: string;
    duration_minutes: number;
    program_title: string | null;
    program_content: Record<string, unknown> | null;
    outcomes: { framework: string; code: string; title: string; description: string }[];
    status: string;
  }[];
}

export async function getScopeAndSequence(
  centreId: string,
  termId?: string
): Promise<{ termName: string; weeks: WeeklyProgramEntry[] }> {
  const supabase = await createSupabaseServerClient();

  // Get term
  let termQuery = supabase.from("terms").select("id, name, start_date, end_date");
  if (termId) {
    termQuery = termQuery.eq("id", termId);
  } else {
    termQuery = termQuery.eq("status", "active");
  }
  const { data: term } = await termQuery.single();
  if (!term) return { termName: "No active term", weeks: [] };

  // Get sessions with programs and coaches
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, date, sport, duration_minutes, status, coach_id,
      program_id, programs(content_json, skill_focus),
      profiles!sessions_coach_id_fkey(name)
    `)
    .eq("centre_id", centreId)
    .eq("term_id", term.id)
    .not("status", "eq", "cancelled")
    .order("date", { ascending: true });

  // Group into weeks
  const weeks: WeeklyProgramEntry[] = [];
  const termStart = new Date(term.start_date);

  for (const session of sessions ?? []) {
    const sessionDate = new Date(session.date);
    const daysDiff = Math.floor((sessionDate.getTime() - termStart.getTime()) / (86400000));
    const weekNum = Math.floor(daysDiff / 7) + 1;

    let week = weeks.find((w) => w.weekNumber === weekNum);
    if (!week) {
      const weekStart = new Date(termStart);
      weekStart.setDate(termStart.getDate() + (weekNum - 1) * 7);
      week = { weekNumber: weekNum, weekStartDate: weekStart.toISOString().slice(0, 10), sessions: [] };
      weeks.push(week);
    }

    const content = (session as any).programs?.content_json as Record<string, unknown> | null;
    const outcomes = content?.curriculumOutcomes as any[] ?? [];

    week.sessions.push({
      id: session.id,
      date: session.date,
      sport: session.sport,
      coach_name: (session as any).profiles?.name ?? "TBC",
      duration_minutes: session.duration_minutes,
      program_title: content?.title as string ?? (session as any).programs?.skill_focus ?? null,
      program_content: content,
      outcomes,
      status: session.status,
    });
  }

  weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  return { termName: term.name, weeks };
}

export async function generateSessionReflection(
  sessionId: string,
  centreType: "childcare_centre" | "school"
): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select(`
      sport, date, duration_minutes, headcount, coach_notes,
      program_id, programs(content_json, skill_focus)
    `)
    .eq("id", sessionId)
    .single();

  if (!session) return "Session not found.";

  const content = (session as any).programs?.content_json as Record<string, unknown> | null;
  const outcomes = content?.curriculumOutcomes as any[] ?? [];
  const existingReflection = content?.reflectionPrompt as string | undefined;

  // If AI already generated a reflection prompt, return it
  if (existingReflection) return existingReflection;

  // Otherwise generate one now
  const framework = centreType === "childcare_centre" ? "EYLF" : "PDHPE";
  const outcomesText = outcomes.length > 0
    ? outcomes.map((o: any) => `${o.code}: ${o.title}`).join("\n")
    : `General ${framework} physical development outcomes`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    system: "You are an Australian early childhood / primary school educator writing a brief reflection for your learning journal. Write in first person, past tense, 3-4 sentences. Reference specific activities and curriculum outcomes. Use Australian English.",
    messages: [{
      role: "user",
      content: `Write a reflection prompt for a ${session.sport} session (${session.duration_minutes} min) with ${session.headcount ?? "a group of"} children.

Program: ${content?.title ?? session.sport}
Activities: ${content ? JSON.stringify({ warmUp: (content as any).warmUp?.name, drills: ((content as any).skillDevelopment ?? []).map((d: any) => d.name), game: (content as any).modifiedGame?.name }) : "Standard session"}
Coach notes: ${session.coach_notes ?? "None"}
Outcomes addressed:
${outcomesText}

Write the reflection as if the educator observed the session and is documenting it.`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text;
}
```

- [ ] **Step 2: Create feedback actions**

Create `lib/client/feedback-actions.ts`:

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionForFeedback {
  id: string;
  date: string;
  sport: string;
  coach_name: string;
  existingRating: number | null;
  existingComment: string | null;
  feedbackId: string | null;
}

export async function getSessionsForFeedback(centreId: string): Promise<SessionForFeedback[]> {
  const supabase = await createSupabaseServerClient();

  // Get recent completed sessions (last 30 days) with any existing feedback
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id, date, sport, coach_id,
      profiles!sessions_coach_id_fkey(name),
      feedback_ratings(id, rating, comment)
    `)
    .eq("centre_id", centreId)
    .eq("status", "completed")
    .gte("date", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("date", { ascending: false });

  return (sessions ?? []).map((s) => {
    const feedback = Array.isArray((s as any).feedback_ratings)
      ? (s as any).feedback_ratings[0]
      : null;
    return {
      id: s.id,
      date: s.date,
      sport: s.sport,
      coach_name: (s as any).profiles?.name ?? "Unknown",
      existingRating: feedback?.rating ?? null,
      existingComment: feedback?.comment ?? null,
      feedbackId: feedback?.id ?? null,
    };
  });
}

export async function submitSessionFeedback(
  sessionId: string,
  centreId: string,
  rating: number,
  comment: string
) {
  const supabase = await createSupabaseServerClient();

  // Check if feedback exists
  const { data: existing } = await supabase
    .from("feedback_ratings")
    .select("id")
    .eq("session_id", sessionId)
    .eq("centre_id", centreId)
    .single();

  if (existing) {
    await supabase
      .from("feedback_ratings")
      .update({ rating, comment, submitted_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    // Get session coach
    const { data: session } = await supabase
      .from("sessions")
      .select("coach_id, sport")
      .eq("id", sessionId)
      .single();

    await supabase.from("feedback_ratings").insert({
      session_id: sessionId,
      centre_id: centreId,
      coach_id: session?.coach_id ?? null,
      sport: session?.sport ?? null,
      rating,
      comment,
      feedback_token: crypto.randomUUID(),
      submitted_at: new Date().toISOString(),
    });
  }

  return { success: true };
}
```

- [ ] **Step 3: Create calendar export action**

Create `lib/client/calendar-actions.ts`:

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateICalFeed(centreId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data: centre } = await supabase
    .from("centres")
    .select("name")
    .eq("id", centreId)
    .single();

  // Get upcoming sessions (next 3 months)
  const now = new Date().toISOString().slice(0, 10);
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, sport, status, profiles!sessions_coach_id_fkey(name)")
    .eq("centre_id", centreId)
    .not("status", "in", '("cancelled","draft")')
    .gte("date", now)
    .lte("date", threeMonths.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const centreName = centre?.name ?? "Build Alpha Kids";

  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Build Alpha Kids//Sports Coaching//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:${centreName} — BAK Sports
X-WR-TIMEZONE:Australia/Sydney
`;

  for (const session of sessions ?? []) {
    const coach = (session as any).profiles?.name ?? "TBC";
    const startDt = `${session.date.replace(/-/g, "")}T${session.time.replace(/:/g, "")}00`;
    const startDate = new Date(`${session.date}T${session.time}`);
    const endDate = new Date(startDate.getTime() + session.duration_minutes * 60000);
    const endDt = endDate.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");

    ical += `BEGIN:VEVENT
UID:${session.id}@buildalphakids.com.au
DTSTART;TZID=Australia/Sydney:${startDt}
DTEND;TZID=Australia/Sydney:${endDt}
SUMMARY:${session.sport} — Build Alpha Kids
DESCRIPTION:Coach: ${coach}\\nSport: ${session.sport}\\nDuration: ${session.duration_minutes}min
STATUS:${session.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}
END:VEVENT
`;
  }

  ical += "END:VCALENDAR";
  return ical;
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/client/curriculum-actions.ts lib/client/feedback-actions.ts lib/client/calendar-actions.ts
git commit -m "feat: add curriculum, feedback, and calendar server actions"
```

---

## Chunk 2: Client Portal Pages (Part 1)

### Task 5: Impact Dashboard Page

**Files:**
- Create: `components/client/impact-charts.tsx`
- Create: `app/(dashboard)/client/[centreId]/impact/page.tsx`

- [ ] **Step 1: Create impact chart components**

Create `components/client/impact-charts.tsx` using `recharts` (already installed). Include:
- `AttendanceChart` — Area chart of weekly headcount with BAK orange fill
- `RatingChart` — Bar chart of monthly average ratings (green for 4+, orange for 3-4, red for <3)
- `SportPieChart` — Pie chart of sport distribution with sport colour palette
- All charts responsive, 300px height, use design system colours

- [ ] **Step 2: Create impact dashboard page**

Create `app/(dashboard)/client/[centreId]/impact/page.tsx`:
- 6-stat hero row: Sessions This Term (with % change from last term), Total Children, Sports Delivered, Average Rating (star display), Attendance Rate (%), All-Time Sessions
- 3-chart grid below: Attendance Trend, Rating Trend, Sport Breakdown
- Each stat card uses `stat-card` CSS class with sport-coloured left stripe
- Page title: "Impact Dashboard"

- [ ] **Step 3: Commit**

```bash
git add components/client/impact-charts.tsx app/(dashboard)/client/[centreId]/impact/page.tsx
git commit -m "feat: add impact dashboard with charts to client portal"
```

---

### Task 6: Scope & Sequence Page

**Files:**
- Create: `components/client/scope-sequence.tsx`
- Create: `components/client/outcome-badges.tsx`
- Create: `components/client/session-reflection.tsx`
- Create: `app/(dashboard)/client/[centreId]/curriculum/page.tsx`

- [ ] **Step 1: Create outcome badges component**

Create `components/client/outcome-badges.tsx`:
- Renders EYLF outcomes as teal badges (e.g., "EYLF 3.2")
- Renders PDHPE outcomes as blue badges (e.g., "PDHPE PD2-6")
- Tooltip on hover shows the full outcome title
- Compact mode for inline use in tables

- [ ] **Step 2: Create session reflection component**

Create `components/client/session-reflection.tsx`:
- Shows AI-generated reflection text in a styled card
- "Copy Reflection" button that copies text to clipboard with toast confirmation
- "Generate Reflection" button for sessions without one (calls `generateSessionReflection`)
- Loading state while AI generates
- Only visible for completed sessions

- [ ] **Step 3: Create scope & sequence view**

Create `components/client/scope-sequence.tsx`:
- Accordion-style week-by-week view
- Each week header: "Week N — {date range}" with session count badge
- Each session row: Date, Sport badge (colour-coded), Program title, Coach name, Duration, Status badge
- Expandable: shows program objectives, activities, and curriculum outcome badges
- Current week auto-expanded
- Below each completed session: reflection prompt component

- [ ] **Step 4: Create curriculum page**

Create `app/(dashboard)/client/[centreId]/curriculum/page.tsx`:
- Server component that fetches scope & sequence data
- Term selector dropdown (if multiple terms available)
- Page title: "Scope & Sequence" for schools, "Weekly Program Overview" for childcare
- Renders `<ScopeSequenceView>` component
- Determines `centreType` from centre query to pass to reflection generator

- [ ] **Step 5: Commit**

```bash
git add components/client/outcome-badges.tsx components/client/session-reflection.tsx components/client/scope-sequence.tsx app/(dashboard)/client/[centreId]/curriculum/page.tsx
git commit -m "feat: add scope and sequence with curriculum outcomes and reflections"
```

---

### Task 7: Staff Verification Page

**Files:**
- Create: `components/client/staff-card.tsx`
- Create: `app/(dashboard)/client/[centreId]/staff/page.tsx`

- [ ] **Step 1: Create staff card component**

Create `components/client/staff-card.tsx`:
- Coach photo (or initials avatar), name, DOB (formatted as "DD MMM YYYY")
- Sports they've coached at this centre (as coloured badges)
- WWCC status: green shield "Verified" with expiry date, or red "Expired"/"Not on file"
- First Aid status: similar to WWCC
- "X sessions at your centre" count
- Last session date
- Card uses `card-hover` CSS class for lift effect

- [ ] **Step 2: Create staff verification page**

Create `app/(dashboard)/client/[centreId]/staff/page.tsx`:
- Page title: "Our Coaches" with subtitle "Staff verification and compliance"
- Grid of staff cards (2 cols desktop, 1 col mobile)
- Info banner at top: "All Build Alpha Kids coaches hold verified Working With Children Checks and current First Aid certificates."
- If no coaches found, show empty state

- [ ] **Step 3: Commit**

```bash
git add components/client/staff-card.tsx app/(dashboard)/client/[centreId]/staff/page.tsx
git commit -m "feat: add staff verification page to client portal"
```

---

## Chunk 3: Client Portal Pages (Part 2)

### Task 8: Resources / Risk Assessments Page

**Files:**
- Create: `app/(dashboard)/client/[centreId]/resources/page.tsx`

- [ ] **Step 1: Create resources page**

Create `app/(dashboard)/client/[centreId]/resources/page.tsx`:
- Server component
- Queries `documents` table filtered by:
  - `category` in `["risk_assessment", "policy", "centre_doc"]`
  - `visibility` in `["all"]` (public documents only)
- Groups documents by category with section headers:
  - "Risk Assessments" (risk_assessment) — with Shield icon
  - "Policies & Procedures" (policy) — with FileText icon
  - "Centre Documents" (centre_doc) — with Building2 icon
- Each document: title, file type badge (PDF/DOC), download button linking to `file_url`
- Tags shown as small badges
- If admin has uploaded centre-specific docs (future: add `centre_id` filter), show those too
- Empty state per section if no documents: "No risk assessments uploaded yet"

**Note for admin:** To populate this, admin uploads documents at `/admin/documents` with category "risk_assessment" and visibility "all". One risk assessment per sport (Soccer Risk Assessment, Basketball Risk Assessment, etc.) covers all centres.

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/client/[centreId]/resources/page.tsx
git commit -m "feat: add resources page with risk assessments for client portal"
```

---

### Task 9: Session Feedback Page

**Files:**
- Create: `components/client/feedback-form.tsx`
- Create: `app/(dashboard)/client/[centreId]/feedback/page.tsx`

- [ ] **Step 1: Create feedback form component**

Create `components/client/feedback-form.tsx`:
- Star rating (1-5) with clickable stars — uses large touch targets (44px)
- Comment textarea with placeholder "How was the session? Any feedback for our coach?"
- Submit button
- Shows existing rating/comment if already submitted (editable)
- Success state after submission: "Thanks for your feedback!"
- Session info header: date, sport, coach name

- [ ] **Step 2: Create feedback page**

Create `app/(dashboard)/client/[centreId]/feedback/page.tsx`:
- Server component, fetches `getSessionsForFeedback(centreId)`
- Page title: "Session Feedback"
- List of recent sessions (last 30 days) grouped by week
- Sessions without feedback have a prominent "Rate this session" button
- Sessions with feedback show rating stars + "Edit" link
- Clicking opens inline feedback form (no separate page needed)
- Summary at top: "X of Y sessions rated" with progress bar

- [ ] **Step 3: Commit**

```bash
git add components/client/feedback-form.tsx app/(dashboard)/client/[centreId]/feedback/page.tsx
git commit -m "feat: add session feedback page to client portal"
```

---

### Task 10: Term Report PDF Download & Calendar Sync

**Files:**
- Create: `components/client/report-pdf-template.tsx`
- Create: `app/api/client/[centreId]/report-pdf/route.ts`
- Create: `app/api/client/[centreId]/calendar/route.ts`
- Modify: `app/(dashboard)/client/[centreId]/reports/page.tsx` (add PDF download button)

- [ ] **Step 1: Create report PDF template**

Create `components/client/report-pdf-template.tsx` using `@react-pdf/renderer`:
- BAK branded header: logo, "Build Alpha Kids", centre name, term name
- Executive summary section
- Key stats: sessions delivered, children, average rating, attendance
- Sports covered list with session counts
- Highlights as bullet points
- Coach observations if available
- Footer: "Generated by Build Alpha Kids · buildalphakids.com.au"
- Orange accent colour (#E8712A) for headers and borders

- [ ] **Step 2: Create PDF API route**

Create `app/api/client/[centreId]/report-pdf/route.ts`:
- GET handler with `reportId` search param
- Fetches report data from `centre_reports` table
- Renders PDF using React-PDF `renderToBuffer`
- Returns with `Content-Type: application/pdf` and `Content-Disposition: attachment`
- Auth check: verify requesting user has access to this centre

- [ ] **Step 3: Create calendar API route**

Create `app/api/client/[centreId]/calendar/route.ts`:
- GET handler
- Calls `generateICalFeed(centreId)`
- Returns with `Content-Type: text/calendar` and filename header
- Auth check required

- [ ] **Step 4: Add download buttons to reports page**

Modify `app/(dashboard)/client/[centreId]/reports/page.tsx`:
- Add "Download PDF" button to each report card
- Add "Sync Calendar" button in the page header area
- PDF button links to `/api/client/${centreId}/report-pdf?reportId=${report.id}`
- Calendar button links to `/api/client/${centreId}/calendar` with copy-to-clipboard for the URL

- [ ] **Step 5: Commit**

```bash
git add components/client/report-pdf-template.tsx app/api/client/[centreId]/report-pdf/route.ts app/api/client/[centreId]/calendar/route.ts app/(dashboard)/client/[centreId]/reports/page.tsx
git commit -m "feat: add PDF report download and iCal calendar sync"
```

---

## Chunk 4: Navigation & Loading States

### Task 11: Update Client Navigation

**Files:**
- Modify: `components/shared/navigation/nav-config.ts`
- Create: loading.tsx files for new pages

- [ ] **Step 1: Add new nav items for client portal**

The client portal doesn't use `nav-config.ts` (it has its own navigation). Find and update the client portal's navigation component. Search for the client sidebar/nav in `app/(dashboard)/client/` layout or components.

Add these nav items (in this order):
1. Dashboard (existing)
2. **Impact** — BarChart3 icon — `/client/[centreId]/impact`
3. Schedule (existing)
4. **Curriculum** — BookOpen icon — `/client/[centreId]/curriculum`
5. Children (existing)
6. **Our Coaches** — Users icon — `/client/[centreId]/staff`
7. **Resources** — Shield icon — `/client/[centreId]/resources`
8. **Feedback** — Star icon — `/client/[centreId]/feedback`
9. Reports (existing)
10. Invoices (existing)
11. Messages (existing)
12. Settings (existing)

Mobile bottom tabs (5): Dashboard, Impact, Curriculum, Messages, Feedback

- [ ] **Step 2: Create loading.tsx files**

Create skeleton loading states for:
- `app/(dashboard)/client/[centreId]/impact/loading.tsx`
- `app/(dashboard)/client/[centreId]/curriculum/loading.tsx`
- `app/(dashboard)/client/[centreId]/staff/loading.tsx`
- `app/(dashboard)/client/[centreId]/resources/loading.tsx`
- `app/(dashboard)/client/[centreId]/feedback/loading.tsx`

Use `SkeletonPageHeader`, `SkeletonStatsRow`, `SkeletonCardGrid`, `SkeletonList` from `components/shared/skeleton-patterns.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/shared/navigation/nav-config.ts app/(dashboard)/client/
git commit -m "feat: update client portal navigation with new pages and loading states"
```

---

## Summary

| Chunk | Tasks | New Files | Modified Files |
|-------|-------|-----------|----------------|
| 1: Data Layer | T1 AI Outcomes, T2 Impact Actions, T3 Staff Actions, T4 Curriculum/Feedback/Calendar Actions | 5 | 2 |
| 2: Pages Part 1 | T5 Impact Dashboard, T6 Scope & Sequence, T7 Staff Verification | 7 | 0 |
| 3: Pages Part 2 | T8 Resources, T9 Feedback, T10 PDF & Calendar | 5 | 1 |
| 4: Navigation | T11 Nav + Loading States | 5 | 1 |

**Total: ~22 new files, ~4 modified files, 11 commits**

Chunks 1-4 have dependencies: Chunk 1 (data layer) must complete first, then Chunks 2+3 can run in parallel, then Chunk 4 (nav) last.
