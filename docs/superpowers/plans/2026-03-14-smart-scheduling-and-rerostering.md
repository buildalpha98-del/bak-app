# Smart Scheduling AI & Rerostering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI scheduling engine that generates optimal weekly coach rosters, a review/publish UI for ops, and an automated rerostering system for coach cancellations.

**Architecture:** Three-layer build: (1) Database migrations for scheduling_preferences, scheduling_runs, rerostering_events + new enums, (2) Pure algorithm layer — constraint solver, travel utils, rerostering suggestions — all deterministic with no LLM calls, (3) API routes and UI components following existing patterns (server actions, tiered notifications, RLS).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS + Realtime), shadcn/ui, Tailwind CSS, recharts, Lucide React icons

**Key existing code to build on:**
- `/lib/utils/scheduling.ts` — has `estimateTravelTime()` (haversine), `checkAvailability()`, `detectClashes()`, `rankReplacements()`, `checkComplianceStatus()`
- `/lib/sessions/actions.ts` — `getSessionsForWeek()`, `updateSession()`, VALID_TRANSITIONS
- `/lib/sessions/scheduling-actions.ts` — `getCoachAvailabilityForSession()`, `getReplacementSuggestions()`
- `/lib/notifications/send.ts` — `triggerNotification(event, recipients[])`, `triggerNotificationForOps(event)`
- `/lib/tasks/auto-create.ts` — `autoCreateTask()` with deduplication
- Migration numbering: next is `027`

**Critical API patterns (must follow exactly):**
- Supabase server client: `import { createSupabaseServerClient } from "@/lib/supabase/server"` (NOT `createClient`)
- Supabase admin client: `import { createSupabaseAdmin } from "@/lib/supabase/admin"`
- Notifications: `triggerNotification(event: NotificationEvent, recipients: NotificationRecipient[])` — event uses camelCase (`entityType`, `entityId`), tier is derived from `EVENT_TIER_MAP`, no supabase param
- `triggerNotificationForOps(event: NotificationEvent)` — no supabase param
- `NotificationRecipient`: `{ userId, email?, name?, role? }`
- Task creation: `autoCreateTask({ title, description?, assigneeId?, priority, linkedEntityType?, linkedEntityId?, source })` — source union must be extended to include `"rerostering"`
- Email: `sendEmail(to: string, subject: string, html: string)` — positional params
- Travel default: 15 min when coordinates unknown (matching existing `scheduling.ts`), minimum 5 min
- Pure algorithm functions must NOT have `"use server"` — only files with Supabase calls need it

---

## Chunk 1: Database & Types (Migration 027 + 028, Enums, Database Types)

### Task 1: Migration 027 — Scheduling tables + enum additions

**Files:**
- Create: `supabase/migrations/027_smart_scheduling.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 027_smart_scheduling.sql
-- Smart Scheduling AI: preferences, runs, session status extension

-- New enum: scheduling preference type
CREATE TYPE scheduling_preference_type AS ENUM ('preferred', 'avoid');

-- New enum: scheduling run status
CREATE TYPE scheduling_run_status AS ENUM ('generated', 'reviewed', 'published', 'discarded');

-- Add 'needs_replacement' to session_status enum
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'needs_replacement' AFTER 'cancelled';

-- 1. scheduling_preferences
CREATE TABLE scheduling_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  centre_id UUID NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  preference_type scheduling_preference_type NOT NULL,
  reason TEXT,
  learned BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, centre_id)
);

-- 2. scheduling_runs
CREATE TABLE scheduling_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  input_summary JSONB NOT NULL DEFAULT '{}',
  output_summary JSONB NOT NULL DEFAULT '{}',
  assignments_json JSONB NOT NULL DEFAULT '[]',
  adjustments_json JSONB NOT NULL DEFAULT '[]',
  status scheduling_run_status NOT NULL DEFAULT 'generated',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_sched_pref_coach ON scheduling_preferences(coach_id);
CREATE INDEX idx_sched_pref_centre ON scheduling_preferences(centre_id);
CREATE INDEX idx_sched_runs_term ON scheduling_runs(term_id);
CREATE INDEX idx_sched_runs_week ON scheduling_runs(week_start, week_end);
CREATE INDEX idx_sched_runs_status ON scheduling_runs(status);

-- RLS
ALTER TABLE scheduling_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_runs ENABLE ROW LEVEL SECURITY;

-- scheduling_preferences: admin/ops full access, coaches read own
CREATE POLICY "Admin/ops manage scheduling preferences"
  ON scheduling_preferences FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

CREATE POLICY "Coaches read own scheduling preferences"
  ON scheduling_preferences FOR SELECT
  USING (coach_id = auth.uid());

-- scheduling_runs: admin/ops full access
CREATE POLICY "Admin/ops manage scheduling runs"
  ON scheduling_runs FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard
Expected: Tables created, enums added

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/027_smart_scheduling.sql
git commit -m "feat: add scheduling_preferences and scheduling_runs tables (migration 027)"
```

### Task 2: Migration 028 — Rerostering tables

**Files:**
- Create: `supabase/migrations/028_rerostering.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 028_rerostering.sql
-- Automated rerostering for coach cancellations

-- New enum: cancellation reason
CREATE TYPE cancellation_reason_type AS ENUM ('sick', 'emergency', 'personal', 'other');

-- New enum: offer status
CREATE TYPE rerostering_offer_status AS ENUM (
  'pending_offer', 'offer_sent', 'accepted', 'declined', 'expired', 'no_replacement'
);

-- rerostering_events
CREATE TABLE rerostering_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  original_coach_id UUID NOT NULL REFERENCES profiles(id),
  cancellation_reason cancellation_reason_type NOT NULL,
  cancellation_details TEXT,
  suggestions_json JSONB NOT NULL DEFAULT '[]',
  selected_replacement_id UUID REFERENCES profiles(id),
  offer_status rerostering_offer_status NOT NULL DEFAULT 'pending_offer',
  offer_sent_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_rerostering_session ON rerostering_events(session_id);
CREATE INDEX idx_rerostering_status ON rerostering_events(offer_status);
CREATE INDEX idx_rerostering_original ON rerostering_events(original_coach_id);
CREATE INDEX idx_rerostering_replacement ON rerostering_events(selected_replacement_id);

-- RLS
ALTER TABLE rerostering_events ENABLE ROW LEVEL SECURITY;

-- Admin/ops full access
CREATE POLICY "Admin/ops manage rerostering"
  ON rerostering_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches can read events where they are original or replacement
CREATE POLICY "Coaches read own rerostering events"
  ON rerostering_events FOR SELECT
  USING (
    original_coach_id = auth.uid() OR selected_replacement_id = auth.uid()
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_rerostering.sql
git commit -m "feat: add rerostering_events table (migration 028)"
```

### Task 3: Update TypeScript enums and database types

**Files:**
- Modify: `lib/types/enums.ts`
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Add new enums to `lib/types/enums.ts`**

Append after existing enums:

```typescript
// Scheduling
export type SchedulingPreferenceType = "preferred" | "avoid";
export type SchedulingRunStatus = "generated" | "reviewed" | "published" | "discarded";

// Rerostering
export type CancellationReasonType = "sick" | "emergency" | "personal" | "other";
export type RerosteringOfferStatus =
  | "pending_offer"
  | "offer_sent"
  | "accepted"
  | "declined"
  | "expired"
  | "no_replacement";
```

Add `"needs_replacement"` to the existing `SessionStatus` type.

Add new notification event types to `NotificationEventType`:
```typescript
  | "rerostering_offer"
  | "rerostering_accepted"
  | "rerostering_declined"
  | "rerostering_expired"
  | "rerostering_escalation"
  | "roster_generated"
  | "roster_published"
```

- [ ] **Step 2: Add new interfaces to `lib/types/database.ts`**

```typescript
// ========================
// 50. scheduling_preferences
// ========================
export interface SchedulingPreference {
  id: string;
  coach_id: string;
  centre_id: string;
  preference_type: import("./enums").SchedulingPreferenceType;
  reason: string | null;
  learned: boolean;
  created_by: string;
  created_at: string;
}

// ========================
// 51. scheduling_runs
// ========================
export interface SchedulingRunInputSummary {
  coaches_count: number;
  sessions_count: number;
  constraints: string[];
}

export interface SchedulingRunOutputSummary {
  assigned_count: number;
  unassigned_count: number;
  confidence_breakdown: { green: number; amber: number; red: number };
}

export interface SchedulingAssignment {
  session_id: string;
  assigned_coach_id: string | null;
  score: number;
  confidence: "green" | "amber" | "red";
  reasoning: string[];
  eligible_coaches: { coach_id: string; score: number; name: string }[];
}

export interface SchedulingAdjustment {
  session_id: string;
  original_coach_id: string | null;
  original_score: number;
  replacement_coach_id: string;
  adjusted_by: string;
  adjusted_at: string;
}

export interface SchedulingRun {
  id: string;
  term_id: string;
  week_start: string;
  week_end: string;
  input_summary: SchedulingRunInputSummary;
  output_summary: SchedulingRunOutputSummary;
  assignments_json: SchedulingAssignment[];
  adjustments_json: SchedulingAdjustment[];
  status: import("./enums").SchedulingRunStatus;
  generated_at: string;
  published_at: string | null;
  created_by: string;
  created_at: string;
}

// ========================
// 52. rerostering_events
// ========================
export interface RerosteringSuggestion {
  coach_id: string;
  coach_name: string;
  coach_phone: string | null;
  availability_status: "confirmed" | "potentially_available";
  score: number;
  score_breakdown: {
    familiarity: number;
    utilisation: number;
    location: number;
    preference: number;
    compliance: number;
  };
  last_at_centre: string | null;
  current_week_hours: number;
}

export interface RerosteringEvent {
  id: string;
  session_id: string;
  original_coach_id: string;
  cancellation_reason: import("./enums").CancellationReasonType;
  cancellation_details: string | null;
  suggestions_json: RerosteringSuggestion[];
  selected_replacement_id: string | null;
  offer_status: import("./enums").RerosteringOfferStatus;
  offer_sent_at: string | null;
  offer_expires_at: string | null;
  approved_by: string | null;
  escalated: boolean;
  created_at: string;
  resolved_at: string | null;
}
```

Add to the `Database` interface map:
```typescript
scheduling_preferences: SchedulingPreference;
scheduling_runs: SchedulingRun;
rerostering_events: RerosteringEvent;
```

- [ ] **Step 3: Update `VALID_TRANSITIONS` in `lib/sessions/actions.ts`**

Add `needs_replacement` transitions:
```typescript
needs_replacement: ["confirmed", "cancelled"], // replacement found → confirmed, or cancel entirely
```

Also add transition to `needs_replacement` from `confirmed` and `pending_confirmation`:
```typescript
confirmed: ["in_progress", "cancelled", "needs_replacement"],
pending_confirmation: ["confirmed", "cancelled", "needs_replacement"],
```

Also extend the `AutoCreateTaskInput.source` union in `/lib/tasks/auto-create.ts` to include `"rerostering"`:
```typescript
source:
  | "equipment_issue"
  | "compliance_expiry"
  | "shift_declined"
  | "invoice_flagged"
  | "low_session_rating"
  | "rerostering";
```

- [ ] **Step 4: Commit**

```bash
git add lib/types/enums.ts lib/types/database.ts lib/sessions/actions.ts
git commit -m "feat: add scheduling and rerostering TypeScript types and enums"
```

---

## Chunk 2: Travel Utilities & Constraint Solver

### Task 4: Travel utility functions

**Files:**
- Create: `lib/utils/scheduling/travel.ts`

**Note:** `/lib/utils/scheduling.ts` already has `estimateTravelTime()` using haversine. We extract and enhance it into a dedicated module.

- [ ] **Step 1: Create travel.ts**

```typescript
/**
 * Travel time estimation between centres using Haversine distance.
 * Road factor 1.4x, average speed 30km/h.
 */

interface LatLng {
  latitude: number | null;
  longitude: number | null;
}

/** Haversine distance in km between two lat/lng points */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Estimated travel minutes between two centres (distance × 1.4 road factor ÷ 30km/h × 60) */
export function estimatedTravelMinutes(
  centreA: LatLng,
  centreB: LatLng
): number {
  if (!centreA.latitude || !centreA.longitude || !centreB.latitude || !centreB.longitude) {
    return 15; // Default 15 min if no coordinates (matches existing scheduling.ts)
  }
  const dist = haversineDistance(
    centreA.latitude, centreA.longitude,
    centreB.latitude, centreB.longitude
  );
  return Math.max(5, (dist * 1.4) / 30 * 60); // Minimum 5 min (matches existing)
}

/** Check if there's >= 30 min gap between two sessions accounting for travel */
export function hasAdequateTravelBuffer(
  session1EndMinutes: number,
  session2StartMinutes: number,
  centreA: LatLng,
  centreB: LatLng
): boolean {
  const travelTime = estimatedTravelMinutes(centreA, centreB);
  const buffer = Math.max(30, travelTime);
  const gap = session2StartMinutes - session1EndMinutes;
  return gap >= buffer;
}

/** Convert HH:mm time string to minutes since midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Get session end time in minutes */
export function sessionEndMinutes(startTime: string, durationMinutes: number): number {
  return timeToMinutes(startTime) + durationMinutes;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils/scheduling/travel.ts
git commit -m "feat: add travel utility functions for scheduling"
```

### Task 5: Solver — data assembly

**Files:**
- Create: `lib/utils/scheduling/solver.ts`
- Create: `lib/utils/scheduling/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
/** Types for the scheduling solver */

export interface SchedulingCoach {
  id: string;
  name: string;
  phone: string | null;
  default_pay_rate: number | null;
  status: string;
  availability_slots: {
    day_of_week: number;
    start_time: string;
    end_time: string;
    location_preferences: string[];
  }[];
  compliance_docs: {
    doc_type: string;
    status: string;
    expiry_date: string | null;
  }[];
  pay_rates: {
    session_type: string;
    rate: number;
    rate_unit: string;
  }[];
}

export interface SchedulingSession {
  id: string;
  date: string;
  time: string;
  duration_minutes: number;
  centre_id: string;
  coach_id: string | null;
  sport: string;
  status: string;
  template_id: string | null;
}

export interface SchedulingCentre {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
}

export interface SchedulingPreferenceInput {
  coach_id: string;
  centre_id: string;
  preference_type: "preferred" | "avoid";
}

export interface SessionHistory {
  coach_id: string;
  centre_id: string;
  session_count: number;
}

export interface SchedulingInput {
  sessions: SchedulingSession[];
  coaches: SchedulingCoach[];
  centres: Map<string, SchedulingCentre>;
  preferences: SchedulingPreferenceInput[];
  history: SessionHistory[];
  currentAssignments: Map<string, SchedulingSession[]>; // coach_id → sessions this week
}

export interface ScoringContext {
  input: SchedulingInput;
  runningAssignments: Map<string, SchedulingSession[]>; // mutable state during assignment
}

export interface AssignmentResult {
  sessionId: string;
  assignedCoachId: string | null;
  score: number;
  confidence: "green" | "amber" | "red";
  reasoning: string[];
  eligibleCoaches: { coachId: string; score: number; name: string }[];
}
```

- [ ] **Step 2: Create solver.ts with assembleSchedulingInput**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  SchedulingInput,
  SchedulingCoach,
  SchedulingSession,
  SchedulingCentre,
  SchedulingPreferenceInput,
  SessionHistory,
  ScoringContext,
  AssignmentResult,
} from "./types";
import {
  timeToMinutes,
  sessionEndMinutes,
  estimatedTravelMinutes,
  hasAdequateTravelBuffer,
} from "./travel";

/**
 * Assemble all data needed for scheduling a week.
 */
export async function assembleSchedulingInput(
  weekStart: string,
  weekEnd: string
): Promise<SchedulingInput> {
  const supabase = await createSupabaseServerClient();

  // 1. Sessions for the week needing assignment
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id")
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .in("status", ["draft", "published"])
    .order("date")
    .order("time");

  // 2. Active coaches with availability, compliance, pay rates
  const { data: coaches } = await supabase
    .from("profiles")
    .select(`
      id, name, phone, default_pay_rate, status,
      availability_slots(day_of_week, start_time, end_time, location_preferences),
      compliance_docs(doc_type, status, expiry_date),
      pay_rates(session_type, rate, rate_unit)
    `)
    .eq("role", "coach")
    .eq("status", "active");

  // 3. Centres with coordinates
  const { data: centreRows } = await supabase
    .from("centres")
    .select("id, name, latitude, longitude, address")
    .eq("contract_status", "active");

  const centres = new Map<string, SchedulingCentre>();
  (centreRows || []).forEach((c) => centres.set(c.id, c));

  // 4. Scheduling preferences
  const { data: prefRows } = await supabase
    .from("scheduling_preferences")
    .select("coach_id, centre_id, preference_type");

  const preferences: SchedulingPreferenceInput[] = (prefRows || []).map((p) => ({
    coach_id: p.coach_id,
    centre_id: p.centre_id,
    preference_type: p.preference_type as "preferred" | "avoid",
  }));

  // 5. Last 4 weeks session history for familiarity
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const { data: historyRows } = await supabase
    .from("sessions")
    .select("coach_id, centre_id")
    .gte("date", fourWeeksAgo.toISOString().split("T")[0])
    .lt("date", weekStart)
    .in("status", ["completed", "confirmed", "in_progress"])
    .not("coach_id", "is", null);

  // Aggregate history
  const historyMap = new Map<string, number>();
  (historyRows || []).forEach((h) => {
    const key = `${h.coach_id}:${h.centre_id}`;
    historyMap.set(key, (historyMap.get(key) || 0) + 1);
  });
  const history: SessionHistory[] = Array.from(historyMap.entries()).map(([key, count]) => {
    const [coach_id, centre_id] = key.split(":");
    return { coach_id, centre_id, session_count: count };
  });

  // 6. Current week existing assignments (confirmed/in_progress)
  const { data: existingAssignments } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id")
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .not("coach_id", "is", null)
    .in("status", ["confirmed", "pending_confirmation", "in_progress"]);

  const currentAssignments = new Map<string, SchedulingSession[]>();
  (existingAssignments || []).forEach((s) => {
    if (!s.coach_id) return;
    const list = currentAssignments.get(s.coach_id) || [];
    list.push(s as SchedulingSession);
    currentAssignments.set(s.coach_id, list);
  });

  return {
    sessions: (sessions || []) as SchedulingSession[],
    coaches: (coaches || []) as unknown as SchedulingCoach[],
    centres,
    preferences,
    history,
    currentAssignments,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/scheduling/types.ts lib/utils/scheduling/solver.ts
git commit -m "feat: add scheduling solver data assembly and types"
```

### Task 6: Solver — eligibility, scoring, assignment algorithm

**Files:**
- Modify: `lib/utils/scheduling/solver.ts`

- [ ] **Step 1: Add eligibility filter**

Append to solver.ts (these are pure functions — NO `"use server"` needed since they don't call Supabase. Move `assembleSchedulingInput` to a separate `lib/utils/scheduling/data-assembly.ts` file with `"use server"`, and keep solver.ts as pure algorithm):

```typescript
/**
 * Get coaches eligible for a session (pass ALL hard constraints).
 */
export function getEligibleCoaches(
  session: SchedulingSession,
  coaches: SchedulingCoach[],
  context: ScoringContext
): SchedulingCoach[] {
  const sessionDay = new Date(session.date).getDay(); // 0=Sun, 1=Mon...
  // Convert to our format (1=Mon...7=Sun to match availability_slots)
  const dayOfWeek = sessionDay === 0 ? 7 : sessionDay;
  const sessionStart = timeToMinutes(session.time);
  const sessionEnd = sessionEndMinutes(session.time, session.duration_minutes);
  const centre = context.input.centres.get(session.centre_id);

  return coaches.filter((coach) => {
    // Hard 1: availability slot covers this day + time
    const hasSlot = coach.availability_slots.some((slot) => {
      if (slot.day_of_week !== dayOfWeek) return false;
      const slotStart = timeToMinutes(slot.start_time);
      const slotEnd = timeToMinutes(slot.end_time);
      return sessionStart >= slotStart && sessionEnd <= slotEnd;
    });
    if (!hasSlot) return false;

    // Get all assignments for this coach on this day (existing + running)
    const existingToday = [
      ...(context.input.currentAssignments.get(coach.id) || []),
      ...(context.runningAssignments.get(coach.id) || []),
    ].filter((s) => s.date === session.date && s.id !== session.id);

    // Hard 2: no overlapping sessions
    const hasOverlap = existingToday.some((other) => {
      const otherStart = timeToMinutes(other.time);
      const otherEnd = sessionEndMinutes(other.time, other.duration_minutes);
      return sessionStart < otherEnd && sessionEnd > otherStart;
    });
    if (hasOverlap) return false;

    // Hard 3: adequate travel buffer (>= 30 min accounting for travel)
    if (centre) {
      const hasTravelConflict = existingToday.some((other) => {
        const otherCentre = context.input.centres.get(other.centre_id);
        if (!otherCentre) return false;
        if (other.centre_id === session.centre_id) return false; // Same centre, no travel

        const otherStart = timeToMinutes(other.time);
        const otherEnd = sessionEndMinutes(other.time, other.duration_minutes);

        // Check both directions: this session before other, or after
        if (sessionEnd <= otherStart) {
          return !hasAdequateTravelBuffer(sessionEnd, otherStart, centre, otherCentre);
        }
        if (otherEnd <= sessionStart) {
          return !hasAdequateTravelBuffer(otherEnd, sessionStart, otherCentre, centre);
        }
        return true; // overlapping
      });
      if (hasTravelConflict) return false;
    }

    return true;
  });
}
```

- [ ] **Step 2: Add scoring function**

```typescript
/**
 * Score a coach for a specific session. Higher is better.
 */
export function scoreCoachForSession(
  coach: SchedulingCoach,
  session: SchedulingSession,
  context: ScoringContext
): { score: number; reasoning: string[] } {
  let score = 0;
  const reasoning: string[] = [];

  // 1. Centre familiarity (+3 recent, +1 ever)
  const historyKey = `${coach.id}:${session.centre_id}`;
  const recentHistory = context.input.history.find(
    (h) => h.coach_id === coach.id && h.centre_id === session.centre_id
  );
  if (recentHistory && recentHistory.session_count > 0) {
    score += 3;
    reasoning.push(`Regular coach (${recentHistory.session_count} sessions in last 4 weeks)`);
  }
  // Check all-time via current assignments as proxy
  // (history only covers 4 weeks, which is sufficient for the +3 check)

  // 2. Utilisation balance
  const coachSessions = [
    ...(context.input.currentAssignments.get(coach.id) || []),
    ...(context.runningAssignments.get(coach.id) || []),
  ];
  const coachHours = coachSessions.reduce((sum, s) => sum + s.duration_minutes / 60, 0);

  // Calculate average hours across all coaches
  const allCoachHours: number[] = [];
  for (const c of context.input.coaches) {
    const sessions = [
      ...(context.input.currentAssignments.get(c.id) || []),
      ...(context.runningAssignments.get(c.id) || []),
    ];
    allCoachHours.push(sessions.reduce((sum, s) => sum + s.duration_minutes / 60, 0));
  }
  const avgHours = allCoachHours.length > 0
    ? allCoachHours.reduce((a, b) => a + b, 0) / allCoachHours.length
    : 0;

  if (coachHours < avgHours) {
    score += 2;
    reasoning.push("Below average hours — balances utilisation");
  } else if (coachHours > avgHours + 2) {
    score -= 1;
    reasoning.push("Above average hours this week");
  }

  // 3. Location preference (+1)
  const centre = context.input.centres.get(session.centre_id);
  if (centre?.address) {
    const matchesLocation = coach.availability_slots.some((slot) =>
      slot.location_preferences.some((pref) =>
        centre.address!.toLowerCase().includes(pref.toLowerCase())
      )
    );
    if (matchesLocation) {
      score += 1;
      reasoning.push("Centre in preferred location");
    }
  }

  // 4. Scheduling preferences (+5 preferred, -10 avoid)
  const pref = context.input.preferences.find(
    (p) => p.coach_id === coach.id && p.centre_id === session.centre_id
  );
  if (pref) {
    if (pref.preference_type === "preferred") {
      score += 5;
      reasoning.push("Preferred coach for this centre");
    } else {
      score -= 10;
      reasoning.push("Marked as avoid for this centre");
    }
  }

  // 5. Compliance penalty (-3 for expired mandatory docs)
  const mandatoryTypes = ["wwcc", "first_aid"];
  const hasExpired = coach.compliance_docs.some((doc) => {
    if (!mandatoryTypes.includes(doc.doc_type)) return false;
    if (doc.status === "expired") return true;
    if (doc.expiry_date && new Date(doc.expiry_date) < new Date()) return true;
    return false;
  });
  if (hasExpired) {
    score -= 3;
    reasoning.push("Expired mandatory compliance documents");
  }

  return { score, reasoning };
}
```

- [ ] **Step 3: Add assignment algorithm with backtracking**

```typescript
/**
 * Generate a full roster: greedy assignment with single-level backtracking.
 */
export function generateRoster(input: SchedulingInput): AssignmentResult[] {
  const context: ScoringContext = {
    input,
    runningAssignments: new Map(),
  };

  // Sort sessions by difficulty (fewest eligible coaches first)
  const sessionDifficulty = input.sessions.map((session) => ({
    session,
    eligibleCount: getEligibleCoaches(session, input.coaches, context).length,
  }));
  sessionDifficulty.sort((a, b) => a.eligibleCount - b.eligibleCount);

  const results: AssignmentResult[] = [];
  const assignmentMap = new Map<string, string>(); // sessionId → coachId

  for (const { session } of sessionDifficulty) {
    const eligible = getEligibleCoaches(session, input.coaches, context);

    // Score each eligible coach
    const scored = eligible
      .map((coach) => {
        const { score, reasoning } = scoreCoachForSession(coach, session, context);
        return { coach, score, reasoning };
      })
      .sort((a, b) => b.score - a.score);

    let assigned = false;

    for (const candidate of scored) {
      // Try assigning this coach
      const coachSessions = context.runningAssignments.get(candidate.coach.id) || [];
      coachSessions.push(session);
      context.runningAssignments.set(candidate.coach.id, coachSessions);

      // Check if this assignment causes downstream issues (simple backtracking)
      const unassignedSessions = sessionDifficulty
        .filter(({ session: s }) => s.id !== session.id && !assignmentMap.has(s.id))
        .map(({ session: s }) => s);

      const causesConflict = unassignedSessions.some((futureSession) => {
        const futureEligible = getEligibleCoaches(futureSession, input.coaches, context);
        return futureEligible.length === 0;
      });

      if (causesConflict && scored.indexOf(candidate) < scored.length - 1) {
        // Backtrack: remove this assignment and try next
        const updated = coachSessions.filter((s) => s.id !== session.id);
        context.runningAssignments.set(candidate.coach.id, updated);
        continue;
      }

      // Accept this assignment
      assignmentMap.set(session.id, candidate.coach.id);
      const eligibleCount = eligible.length;
      const confidence: "green" | "amber" | "red" =
        candidate.score >= 5 && eligibleCount >= 3
          ? "green"
          : candidate.score >= 0 || eligibleCount >= 1
          ? "amber"
          : "red";

      results.push({
        sessionId: session.id,
        assignedCoachId: candidate.coach.id,
        score: candidate.score,
        confidence,
        reasoning: candidate.reasoning,
        eligibleCoaches: scored.map((s) => ({
          coachId: s.coach.id,
          score: s.score,
          name: s.coach.name,
        })),
      });
      assigned = true;
      break;
    }

    if (!assigned) {
      // No eligible coaches
      const reason = eligible.length === 0
        ? "No coaches available at this time"
        : "All eligible coaches already assigned";

      results.push({
        sessionId: session.id,
        assignedCoachId: null,
        score: -1,
        confidence: "red",
        reasoning: [reason],
        eligibleCoaches: [],
      });
    }
  }

  return results;
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/utils/scheduling/solver.ts
git commit -m "feat: add constraint solver with eligibility, scoring, and backtracking"
```

### Task 7: Solver — index file

**Files:**
- Create: `lib/utils/scheduling/index.ts`

- [ ] **Step 1: Create barrel export**

Note: Keep pure algorithm exports separate from server-only exports. Client components can import pure functions; only server actions should import `assembleSchedulingInput` and `suggestReplacements`.

```typescript
// Pure functions (safe for any context)
export { haversineDistance, estimatedTravelMinutes, hasAdequateTravelBuffer, timeToMinutes, sessionEndMinutes } from "./travel";
export { getEligibleCoaches, scoreCoachForSession, generateRoster } from "./solver";
export type * from "./types";

// Server-only (must only be imported in server actions / API routes)
// Import directly: import { assembleSchedulingInput } from "@/lib/utils/scheduling/solver";
// Import directly: import { suggestReplacements } from "@/lib/utils/scheduling/rerostering";
```

- [ ] **Step 2: Commit**

```bash
git add lib/utils/scheduling/index.ts
git commit -m "feat: add scheduling utils barrel export"
```

---

## Chunk 3: Rerostering Engine & API Routes

### Task 8: Rerostering suggestion engine

**Files:**
- Create: `lib/utils/scheduling/rerostering.ts`

- [ ] **Step 1: Create rerostering.ts**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleSchedulingInput, getEligibleCoaches, scoreCoachForSession } from "./solver";
import type { ScoringContext, SchedulingSession, SchedulingCoach } from "./types";
import type { RerosteringSuggestion } from "@/lib/types/database";

/**
 * Suggest ranked replacement coaches for a single session.
 * Reuses the scheduler's eligibility + scoring logic.
 */
export async function suggestReplacements(
  sessionId: string
): Promise<RerosteringSuggestion[]> {
  const supabase = await createSupabaseServerClient();

  // Fetch the session
  const { data: session } = await supabase
    .from("sessions")
    .select("id, date, time, duration_minutes, centre_id, coach_id, sport, status, template_id")
    .eq("id", sessionId)
    .single();

  if (!session) return [];

  // Get the week boundaries for this session
  const sessionDate = new Date(session.date);
  const dayOfWeek = sessionDate.getDay();
  const monday = new Date(sessionDate);
  monday.setDate(sessionDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const weekStart = monday.toISOString().split("T")[0];
  const weekEnd = friday.toISOString().split("T")[0];

  // Assemble full scheduling context
  const input = await assembleSchedulingInput(weekStart, weekEnd);

  const context: ScoringContext = {
    input,
    runningAssignments: new Map(input.currentAssignments),
  };

  // Exclude original coach from eligibility
  const availableCoaches = input.coaches.filter(
    (c) => c.id !== session.coach_id
  );

  const eligible = getEligibleCoaches(
    session as SchedulingSession,
    availableCoaches,
    context
  );

  // Score and rank
  const scored = eligible.map((coach) => {
    const { score, reasoning } = scoreCoachForSession(
      coach,
      session as SchedulingSession,
      context
    );

    // Determine availability confidence
    const coachAssignments = [
      ...(input.currentAssignments.get(coach.id) || []),
    ];
    const availabilityStatus: "confirmed" | "potentially_available" =
      coach.availability_slots.some((slot) => slot.day_of_week === (sessionDate.getDay() === 0 ? 7 : sessionDate.getDay()))
        ? "confirmed"
        : "potentially_available";

    // Find last time at this centre
    const historyEntry = input.history.find(
      (h) => h.coach_id === coach.id && h.centre_id === session.centre_id
    );

    // Current week hours
    const weekHours = coachAssignments.reduce(
      (sum, s) => sum + s.duration_minutes / 60, 0
    );

    // Build score breakdown
    const pref = input.preferences.find(
      (p) => p.coach_id === coach.id && p.centre_id === session.centre_id
    );
    const mandatoryTypes = ["wwcc", "first_aid"];
    const hasExpired = coach.compliance_docs.some((doc) =>
      mandatoryTypes.includes(doc.doc_type) &&
      (doc.status === "expired" || (doc.expiry_date && new Date(doc.expiry_date) < new Date()))
    );

    return {
      coach_id: coach.id,
      coach_name: coach.name,
      coach_phone: coach.phone,
      availability_status: availabilityStatus,
      score,
      score_breakdown: {
        familiarity: historyEntry ? 3 : 0,
        utilisation: weekHours < 10 ? 2 : weekHours > 15 ? -1 : 0,
        location: reasoning.includes("Centre in preferred location") ? 1 : 0,
        preference: pref ? (pref.preference_type === "preferred" ? 5 : -10) : 0,
        compliance: hasExpired ? -3 : 0,
      },
      last_at_centre: historyEntry ? "Within last 4 weeks" : null,
      current_week_hours: weekHours,
    } satisfies RerosteringSuggestion;
  });

  // Sort by score descending, return top 5
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}
```

- [ ] **Step 2: Add to barrel export**

Add to `lib/utils/scheduling/index.ts`:
```typescript
export { suggestReplacements } from "./rerostering";
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/scheduling/rerostering.ts lib/utils/scheduling/index.ts
git commit -m "feat: add rerostering suggestion engine"
```

### Task 9: Scheduling API route

**Files:**
- Create: `app/api/scheduling/generate/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assembleSchedulingInput, generateRoster } from "@/lib/utils/scheduling";
import type { SchedulingRunInputSummary, SchedulingRunOutputSummary, SchedulingAssignment } from "@/lib/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // Auth check: admin/ops only
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "ops"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { weekStart, weekEnd, termId, keepExisting = false } = body;

  if (!weekStart || !weekEnd || !termId) {
    return NextResponse.json(
      { error: "weekStart, weekEnd, and termId are required" },
      { status: 400 }
    );
  }

  try {
    // Assemble input
    const input = await assembleSchedulingInput(weekStart, weekEnd);

    // Optionally filter out sessions that already have coaches
    if (keepExisting) {
      input.sessions = input.sessions.filter((s) => !s.coach_id);
    }

    if (input.sessions.length === 0) {
      return NextResponse.json({
        assignments: [],
        summary: { assigned_count: 0, unassigned_count: 0, confidence_breakdown: { green: 0, amber: 0, red: 0 } },
        message: "No sessions to assign",
      });
    }

    // Run solver
    const assignments = generateRoster(input);

    // Build summaries
    const inputSummary: SchedulingRunInputSummary = {
      coaches_count: input.coaches.length,
      sessions_count: input.sessions.length,
      constraints: [
        "availability_windows",
        "travel_buffer_30min",
        "no_overlaps",
        ...(input.preferences.length > 0 ? ["scheduling_preferences"] : []),
      ],
    };

    const outputSummary: SchedulingRunOutputSummary = {
      assigned_count: assignments.filter((a) => a.assignedCoachId).length,
      unassigned_count: assignments.filter((a) => !a.assignedCoachId).length,
      confidence_breakdown: {
        green: assignments.filter((a) => a.confidence === "green").length,
        amber: assignments.filter((a) => a.confidence === "amber").length,
        red: assignments.filter((a) => a.confidence === "red").length,
      },
    };

    // Map to DB format
    const assignmentsJson: SchedulingAssignment[] = assignments.map((a) => ({
      session_id: a.sessionId,
      assigned_coach_id: a.assignedCoachId,
      score: a.score,
      confidence: a.confidence,
      reasoning: a.reasoning,
      eligible_coaches: a.eligibleCoaches.map((e) => ({
        coach_id: e.coachId,
        score: e.score,
        name: e.name,
      })),
    }));

    // Save scheduling run
    const { data: run, error: runError } = await supabase
      .from("scheduling_runs")
      .insert({
        term_id: termId,
        week_start: weekStart,
        week_end: weekEnd,
        input_summary: inputSummary,
        output_summary: outputSummary,
        assignments_json: assignmentsJson,
        status: "generated",
        created_by: user.id,
      })
      .select()
      .single();

    if (runError) {
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    // Apply assignments to sessions (set coach_id, keep status as draft)
    for (const assignment of assignments) {
      if (assignment.assignedCoachId) {
        await supabase
          .from("sessions")
          .update({ coach_id: assignment.assignedCoachId })
          .eq("id", assignment.sessionId);
      }
    }

    return NextResponse.json({
      runId: run.id,
      assignments: assignmentsJson,
      summary: outputSummary,
    });
  } catch (error) {
    console.error("Scheduling generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/scheduling/generate/route.ts
git commit -m "feat: add scheduling generation API route"
```

### Task 10: Rerostering server actions

**Files:**
- Create: `lib/rerostering/actions.ts`

- [ ] **Step 1: Create rerostering actions**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { suggestReplacements } from "@/lib/utils/scheduling/rerostering";
import { triggerNotification, triggerNotificationForOps } from "@/lib/notifications/send";
import { autoCreateTask } from "@/lib/tasks/auto-create";
import type { CancellationReasonType } from "@/lib/types/enums";

/**
 * Coach cancels a confirmed session — triggers rerostering flow.
 */
export async function cancelSessionAsCoach(
  sessionId: string,
  reason: CancellationReasonType,
  details?: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify coach owns this session
  const { data: session } = await supabase
    .from("sessions")
    .select("id, coach_id, centre_id, date, time, sport, status, duration_minutes, centres(name)")
    .eq("id", sessionId)
    .single();

  if (!session || session.coach_id !== user.id) {
    return { error: "Session not found or not your session" };
  }

  if (!["confirmed", "pending_confirmation"].includes(session.status)) {
    return { error: "Can only cancel confirmed or pending sessions" };
  }

  // Update session status
  await supabase
    .from("sessions")
    .update({
      status: "needs_replacement",
      coach_id: null,
      cancellation_reason: `Coach cancelled: ${reason}${details ? ` - ${details}` : ""}`,
    })
    .eq("id", sessionId);

  // Generate replacement suggestions
  // Temporarily set coach_id back for suggestion engine context
  const suggestions = await suggestReplacements(sessionId);

  // Create rerostering event
  const { data: event } = await supabase
    .from("rerostering_events")
    .insert({
      session_id: sessionId,
      original_coach_id: user.id,
      cancellation_reason: reason,
      cancellation_details: details || null,
      suggestions_json: suggestions,
      offer_status: "pending_offer",
    })
    .select()
    .single();

  // Get coach name for notification
  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const centreName = (session as any).centres?.name || "Unknown Centre";

  // Notify ops (URGENT — tier derived from EVENT_TIER_MAP)
  await triggerNotificationForOps({
    type: "rerostering_escalation",
    title: "Coach Cancellation",
    body: `${coachProfile?.name || "Coach"} cancelled ${session.sport} at ${centreName} on ${session.date} at ${session.time} — ${suggestions.length} replacement options available`,
    entityType: "session",
    entityId: sessionId,
    data: { rerostering_event_id: event?.id },
  });

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "coach_cancelled_session",
    entity_type: "session",
    entity_id: sessionId,
    metadata: { reason, details, suggestions_count: suggestions.length },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  revalidatePath("/coach/schedule");

  return { data: event };
}

/**
 * Ops sends a replacement offer to a coach.
 */
export async function sendReplacementOffer(
  eventId: string,
  coachId: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get the event with session details
  const { data: event } = await supabase
    .from("rerostering_events")
    .select("id, session_id, offer_status")
    .eq("id", eventId)
    .single();

  if (!event) return { error: "Rerostering event not found" };

  const { data: session } = await supabase
    .from("sessions")
    .select("id, date, time, sport, duration_minutes, centre_id, centres(name)")
    .eq("id", event.session_id)
    .single();

  if (!session) return { error: "Session not found" };

  // Set offer expiry (30 minutes)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 30);

  // Update event
  await supabase
    .from("rerostering_events")
    .update({
      selected_replacement_id: coachId,
      offer_status: "offer_sent",
      offer_sent_at: new Date().toISOString(),
      offer_expires_at: expiresAt.toISOString(),
      approved_by: user.id,
    })
    .eq("id", eventId);

  const centreName = (session as any).centres?.name || "Unknown Centre";

  // Send URGENT notification to the coach
  // Get coach details for recipient
  const { data: targetCoach } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .eq("id", coachId)
    .single();

  if (targetCoach) {
    await triggerNotification(
      {
        type: "rerostering_offer",
        title: "Can You Cover?",
        body: `${session.sport} at ${centreName} on ${session.date} at ${session.time} — Accept or Decline (30 min to respond)`,
        entityType: "rerostering_event",
        entityId: eventId,
        data: { session_id: session.id, expires_at: expiresAt.toISOString() },
      },
      [{ userId: targetCoach.id, email: targetCoach.email, name: targetCoach.name, role: targetCoach.role }]
    );
  }

  // Log activity
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "replacement_offer_sent",
    entity_type: "rerostering_event",
    entity_id: eventId,
    metadata: { coach_id: coachId, expires_at: expiresAt.toISOString() },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/coach/schedule");
  return { data: { sent: true } };
}

/**
 * Coach responds to a replacement offer.
 */
export async function respondToReplacementOffer(
  eventId: string,
  accept: boolean
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: event } = await supabase
    .from("rerostering_events")
    .select("id, session_id, selected_replacement_id, offer_status, original_coach_id, offer_expires_at")
    .eq("id", eventId)
    .single();

  if (!event || event.selected_replacement_id !== user.id) {
    return { error: "Event not found or not your offer" };
  }

  if (event.offer_status !== "offer_sent") {
    return { error: "Offer is no longer active" };
  }

  // Check if expired
  if (event.offer_expires_at && new Date(event.offer_expires_at) < new Date()) {
    return { error: "Offer has expired" };
  }

  if (accept) {
    // Update session with new coach
    await supabase
      .from("sessions")
      .update({ coach_id: user.id, status: "confirmed", cancellation_reason: null })
      .eq("id", event.session_id);

    // Resolve event
    await supabase
      .from("rerostering_events")
      .update({
        offer_status: "accepted",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    // Notify ops
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    await triggerNotificationForOps({
      type: "rerostering_accepted",
      title: "Replacement Accepted",
      body: `${coachProfile?.name || "Coach"} accepted the replacement shift`,
      entityType: "session",
      entityId: event.session_id,
    });

    // Notify original coach
    const { data: originalCoach } = await supabase
      .from("profiles")
      .select("id, email, name, role")
      .eq("id", event.original_coach_id)
      .single();

    if (originalCoach) {
      await triggerNotification(
        {
          type: "rerostering_accepted",
          title: "Replacement Found",
          body: `${coachProfile?.name || "A coach"} is covering your cancelled session`,
          entityType: "session",
          entityId: event.session_id,
        },
        [{ userId: originalCoach.id, email: originalCoach.email, name: originalCoach.name, role: originalCoach.role }]
      );
    }
  } else {
    // Declined
    await supabase
      .from("rerostering_events")
      .update({ offer_status: "declined" })
      .eq("id", eventId);

    // Notify ops to try next suggestion
    await triggerNotificationForOps({
      type: "rerostering_declined",
      title: "Replacement Declined",
      body: "Coach declined the replacement offer — select next candidate",
      entityType: "rerostering_event",
      entityId: eventId,
    });
  }

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: accept ? "replacement_accepted" : "replacement_declined",
    entity_type: "rerostering_event",
    entity_id: eventId,
  });

  revalidatePath("/ops/roster");
  revalidatePath("/coach/schedule");
  return { data: { accepted: accept } };
}

/**
 * Check for expired offers and escalations. Called by cron or on page load.
 */
export async function processRerostringEscalations() {
  const supabase = await createSupabaseServerClient();

  // Find expired offers
  const { data: expiredOffers } = await supabase
    .from("rerostering_events")
    .select("id, session_id, selected_replacement_id, suggestions_json")
    .eq("offer_status", "offer_sent")
    .lt("offer_expires_at", new Date().toISOString());

  for (const event of expiredOffers || []) {
    await supabase
      .from("rerostering_events")
      .update({ offer_status: "expired" })
      .eq("id", event.id);

    // Notify ops
    await triggerNotificationForOps({
      type: "rerostering_expired",
      title: "Replacement Offer Expired",
      body: "Coach did not respond in time — select next candidate",
      entityType: "rerostering_event",
      entityId: event.id,
    });
  }

  // Find sessions within 4 hours that still need replacement
  const fourHoursFromNow = new Date();
  fourHoursFromNow.setHours(fourHoursFromNow.getHours() + 4);
  const today = new Date().toISOString().split("T")[0];

  const { data: urgentSessions } = await supabase
    .from("sessions")
    .select("id, date, time, centre_id, sport")
    .eq("status", "needs_replacement")
    .eq("date", today);

  for (const session of urgentSessions || []) {
    const sessionDateTime = new Date(`${session.date}T${session.time}`);
    const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    // Check if already escalated
    const { data: event } = await supabase
      .from("rerostering_events")
      .select("id, escalated")
      .eq("session_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (event?.escalated) continue;

    if (hoursUntil <= 4 && hoursUntil > 2) {
      // Escalate to admin
      await triggerNotificationForOps({
        type: "rerostering_escalation",
        title: "Urgent: No Replacement",
        body: `Session at ${session.time} today still needs a replacement coach — ${Math.round(hoursUntil)} hours remaining`,
        entityType: "session",
        entityId: session.id,
      });
    } else if (hoursUntil <= 2) {
      // Notify centre + create urgent task
      const { data: centre } = await supabase
        .from("centres")
        .select("primary_contact_email, name")
        .eq("id", session.centre_id)
        .single();

      if (centre?.primary_contact_email) {
        // Send email to centre (fire and forget — positional params)
        const { sendEmail } = await import("@/lib/email/send");
        sendEmail(
          centre.primary_contact_email,
          `Update: Today's ${session.sport} Session`,
          `<p>Hi,</p><p>We're arranging a replacement coach for today's session at ${centre.name}. We'll confirm as soon as possible.</p><p>Build Alpha Kids</p>`
        ).catch(console.error);
      }

      // Create urgent task (note: source union in auto-create.ts must be extended to include "rerostering")
      await autoCreateTask({
        title: `No replacement found for ${session.sport} session`,
        description: `Session at ${session.time} on ${session.date} still has no coach. All suggestions exhausted.`,
        priority: "urgent",
        source: "rerostering",
        linkedEntityType: "session",
        linkedEntityId: session.id,
      });

      // Mark escalated
      if (event) {
        await supabase
          .from("rerostering_events")
          .update({ escalated: true })
          .eq("id", event.id);
      }
    }
  }
}

/**
 * Get active rerostering events (for ops command centre widget).
 */
export async function getActiveRerosteringEvents() {
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("rerostering_events")
    .select(`
      id, session_id, original_coach_id, cancellation_reason,
      suggestions_json, selected_replacement_id, offer_status,
      offer_sent_at, offer_expires_at, escalated, created_at
    `)
    .in("offer_status", ["pending_offer", "offer_sent"])
    .order("created_at", { ascending: false });

  if (!events || events.length === 0) return [];

  // Enrich with session + coach details
  const sessionIds = events.map((e) => e.session_id);
  const coachIds = [
    ...events.map((e) => e.original_coach_id),
    ...events.filter((e) => e.selected_replacement_id).map((e) => e.selected_replacement_id!),
  ];

  const [{ data: sessions }, { data: coaches }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, date, time, sport, duration_minutes, centre_id, centres(name)")
      .in("id", sessionIds),
    supabase
      .from("profiles")
      .select("id, name, phone")
      .in("id", coachIds),
  ]);

  const sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
  const coachMap = new Map((coaches || []).map((c) => [c.id, c]));

  return events.map((event) => ({
    ...event,
    session: sessionMap.get(event.session_id),
    original_coach: coachMap.get(event.original_coach_id),
    selected_replacement: event.selected_replacement_id
      ? coachMap.get(event.selected_replacement_id)
      : null,
  }));
}

/**
 * Get rerostering history for reporting.
 */
export async function getRerosteringHistory(limit = 50) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("rerostering_events")
    .select(`
      id, session_id, original_coach_id, cancellation_reason,
      offer_status, escalated, created_at, resolved_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/rerostering/actions.ts
git commit -m "feat: add rerostering server actions with escalation logic"
```

### Task 11: Scheduling server actions (for UI operations)

**Files:**
- Create: `lib/scheduling/actions.ts`

- [ ] **Step 1: Create scheduling actions**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { triggerNotification } from "@/lib/notifications/send";
import type { SchedulingAdjustment } from "@/lib/types/database";

/**
 * Get the latest scheduling run for a week.
 */
export async function getSchedulingRun(weekStart: string, weekEnd: string) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_runs")
    .select("*")
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

/**
 * Record an adjustment when ops overrides an AI assignment.
 */
export async function recordAdjustment(
  runId: string,
  sessionId: string,
  originalCoachId: string | null,
  originalScore: number,
  replacementCoachId: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Get current run
  const { data: run } = await supabase
    .from("scheduling_runs")
    .select("adjustments_json")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Scheduling run not found" };

  const adjustments = (run.adjustments_json || []) as SchedulingAdjustment[];
  adjustments.push({
    session_id: sessionId,
    original_coach_id: originalCoachId,
    original_score: originalScore,
    replacement_coach_id: replacementCoachId,
    adjusted_by: user.id,
    adjusted_at: new Date().toISOString(),
  });

  // Update the run
  await supabase
    .from("scheduling_runs")
    .update({ adjustments_json: adjustments, status: "reviewed" })
    .eq("id", runId);

  // Update the session
  await supabase
    .from("sessions")
    .update({ coach_id: replacementCoachId })
    .eq("id", sessionId);

  // Check for auto-learn: 3+ consistent overrides for same coach-centre
  await checkAutoLearnPreference(user.id, originalCoachId, sessionId);

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "scheduling_adjustment",
    entity_type: "scheduling_run",
    entity_id: runId,
    metadata: {
      session_id: sessionId,
      original_coach_id: originalCoachId,
      replacement_coach_id: replacementCoachId,
    },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  return { data: { adjusted: true } };
}

/**
 * Auto-learn scheduling preferences from repeated overrides.
 */
async function checkAutoLearnPreference(
  userId: string,
  overriddenCoachId: string | null,
  sessionId: string
) {
  if (!overriddenCoachId) return;

  const supabase = await createSupabaseServerClient();

  // Get the session's centre
  const { data: session } = await supabase
    .from("sessions")
    .select("centre_id")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  // Count how many times this coach has been overridden for this centre
  const { data: allRuns } = await supabase
    .from("scheduling_runs")
    .select("adjustments_json")
    .not("adjustments_json", "eq", "[]");

  let overrideCount = 0;
  for (const run of allRuns || []) {
    const adjustments = (run.adjustments_json || []) as SchedulingAdjustment[];
    for (const adj of adjustments) {
      if (adj.original_coach_id === overriddenCoachId) {
        // Check if this adjustment's session was at the same centre
        const { data: adjSession } = await supabase
          .from("sessions")
          .select("centre_id")
          .eq("id", adj.session_id)
          .single();

        if (adjSession?.centre_id === session.centre_id) {
          overrideCount++;
        }
      }
    }
  }

  if (overrideCount >= 3) {
    // Check if preference already exists
    const { data: existing } = await supabase
      .from("scheduling_preferences")
      .select("id")
      .eq("coach_id", overriddenCoachId)
      .eq("centre_id", session.centre_id)
      .single();

    if (!existing) {
      await supabase.from("scheduling_preferences").insert({
        coach_id: overriddenCoachId,
        centre_id: session.centre_id,
        preference_type: "avoid",
        reason: "Auto-learned: consistently overridden by ops",
        learned: true,
        created_by: userId,
      });
    }
  }
}

/**
 * Publish a scheduling run — sets sessions to published and notifies coaches.
 */
export async function publishSchedulingRun(runId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: run } = await supabase
    .from("scheduling_runs")
    .select("id, assignments_json, status")
    .eq("id", runId)
    .single();

  if (!run) return { error: "Run not found" };
  if (run.status === "published") return { error: "Already published" };

  const assignments = run.assignments_json as any[];
  const assignedSessions = assignments.filter((a: any) => a.assigned_coach_id);

  // Publish all assigned sessions
  const sessionIds = assignedSessions.map((a: any) => a.session_id);
  if (sessionIds.length > 0) {
    await supabase
      .from("sessions")
      .update({ status: "published" })
      .in("id", sessionIds)
      .eq("status", "draft");
  }

  // Update run status
  await supabase
    .from("scheduling_runs")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", runId);

  // Notify each assigned coach
  const coachSessionMap = new Map<string, string[]>();
  for (const a of assignedSessions) {
    const list = coachSessionMap.get(a.assigned_coach_id) || [];
    list.push(a.session_id);
    coachSessionMap.set(a.assigned_coach_id, list);
  }

  // Fetch coach details for notifications
  const coachIds = Array.from(coachSessionMap.keys());
  const { data: coachProfiles } = await supabase
    .from("profiles")
    .select("id, email, name, role")
    .in("id", coachIds);

  for (const [coachId, sessions] of coachSessionMap) {
    const coach = coachProfiles?.find((c) => c.id === coachId);
    if (!coach) continue;

    await triggerNotification(
      {
        type: "roster_published",
        title: "New Shifts Available",
        body: `You have ${sessions.length} new shift${sessions.length > 1 ? "s" : ""} to confirm`,
        entityType: "scheduling_run",
        entityId: runId,
      },
      [{ userId: coach.id, email: coach.email, name: coach.name, role: coach.role }]
    );
  }

  // Log
  await supabase.from("activity_log").insert({
    user_id: user.id,
    action: "scheduling_run_published",
    entity_type: "scheduling_run",
    entity_id: runId,
    metadata: { sessions_published: sessionIds.length, coaches_notified: coachSessionMap.size },
  });

  revalidatePath("/ops/roster");
  revalidatePath("/admin/roster");
  revalidatePath("/coach/schedule");

  return { data: { published: true, sessionsCount: sessionIds.length, coachesNotified: coachSessionMap.size } };
}

/**
 * Get scheduling run history.
 */
export async function getSchedulingRunHistory(limit = 20) {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_runs")
    .select("id, term_id, week_start, week_end, input_summary, output_summary, adjustments_json, status, generated_at, published_at, created_by")
    .order("generated_at", { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Get all scheduling preferences.
 */
export async function getSchedulingPreferences() {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("scheduling_preferences")
    .select(`
      id, coach_id, centre_id, preference_type, reason, learned, created_by, created_at,
      coach:profiles!scheduling_preferences_coach_id_fkey(name),
      centre:centres!scheduling_preferences_centre_id_fkey(name)
    `)
    .order("created_at", { ascending: false });

  return data || [];
}

/**
 * Create or update a scheduling preference.
 */
export async function upsertSchedulingPreference(
  coachId: string,
  centreId: string,
  preferenceType: "preferred" | "avoid",
  reason?: string
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("scheduling_preferences")
    .upsert(
      {
        coach_id: coachId,
        centre_id: centreId,
        preference_type: preferenceType,
        reason: reason || null,
        learned: false,
        created_by: user.id,
      },
      { onConflict: "coach_id,centre_id" }
    )
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/admin/settings/scheduling");
  return { data };
}

/**
 * Delete a scheduling preference.
 */
export async function deleteSchedulingPreference(id: string) {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("scheduling_preferences")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings/scheduling");
  return { data: { deleted: true } };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/scheduling/actions.ts
git commit -m "feat: add scheduling server actions for UI operations"
```

---

## Chunk 4: Scheduling UI — Generate & Review

### Task 12: AI Generate dialog component

**Files:**
- Create: `components/roster/ai-generate-dialog.tsx`

- [ ] **Step 1: Create the dialog**

Build a shadcn Dialog with:
- Week date picker (defaults to next Monday)
- Preview stats: "{X} sessions to assign, {Y} coaches available" — fetched on week change
- Checkbox: "Keep existing assignments"
- Checkbox: "Include unconfirmed coaches"
- "Generate" button with loading spinner
- On success: close dialog and trigger page refresh with the runId

Key props: `termId: string`, `onGenerated: (runId: string) => void`

Uses `fetch("/api/scheduling/generate", { method: "POST", body: ... })` to trigger generation.

- [ ] **Step 2: Commit**

```bash
git add components/roster/ai-generate-dialog.tsx
git commit -m "feat: add AI generate roster dialog component"
```

### Task 13: Confidence badge and summary bar

**Files:**
- Create: `components/roster/confidence-badge.tsx`
- Create: `components/roster/ai-summary-bar.tsx`

- [ ] **Step 1: Create confidence badge**

Small dot component with tooltip:
- Green dot + tooltip showing reasoning array joined
- Amber dot + tooltip
- Red dot + tooltip
- Props: `confidence: "green" | "amber" | "red"`, `reasoning: string[]`

Uses shadcn Tooltip, Lucide Circle icon with fill colors.

- [ ] **Step 2: Create AI summary bar**

Sticky bar below header during review:
- "AI assigned {X} of {Y} sessions — {G} high confidence, {A} moderate, {R} needs attention"
- "Needs Attention" filter toggle button
- "Publish Week" button (right side)
- Props: summary data from scheduling run

- [ ] **Step 3: Commit**

```bash
git add components/roster/confidence-badge.tsx components/roster/ai-summary-bar.tsx
git commit -m "feat: add confidence badge and AI summary bar components"
```

### Task 14: Session review actions (swap coach panel)

**Files:**
- Create: `components/roster/coach-swap-panel.tsx`

- [ ] **Step 1: Create coach swap panel**

Sheet/dialog that opens from a session card during AI review:
- Shows current AI assignment with score
- Lists all eligible coaches with score breakdowns (from assignments_json.eligible_coaches)
- One-click swap: calls `recordAdjustment()` server action
- "Leave Unassigned" button: removes coach from session
- "Regenerate" button: calls API for single session re-solve (optional — can be deferred)

- [ ] **Step 2: Commit**

```bash
git add components/roster/coach-swap-panel.tsx
git commit -m "feat: add coach swap panel for AI roster review"
```

### Task 15: Integrate AI generation into existing roster page

**Files:**
- Modify: `components/roster/roster-page.tsx` (or equivalent existing roster component)

- [ ] **Step 1: Add AI Generate button to roster toolbar**

- Import and render `AIGenerateDialog` next to existing "Generate Week" button
- After generation, store the `runId` in state to activate review mode
- In review mode: show `AISummaryBar`, render `ConfidenceBadge` on each session card
- Clicking a session card in review mode opens `CoachSwapPanel`
- "Publish Week" in summary bar calls `publishSchedulingRun()`

- [ ] **Step 2: Update session cards to show confidence dots**

When a scheduling run is active, overlay confidence badges on session cards using the assignments_json data.

- [ ] **Step 3: Commit**

```bash
git add components/roster/roster-page.tsx
git commit -m "feat: integrate AI scheduling into roster page"
```

---

## Chunk 5: Scheduling Settings, History, Rerostering UI

### Task 16: Scheduling preferences page

**Files:**
- Create: `app/(dashboard)/admin/settings/scheduling/page.tsx`

- [ ] **Step 1: Create the page**

Server component that:
- Fetches `getSchedulingPreferences()` and active coaches + centres for select dropdowns
- Renders table: Coach Name, Centre Name, Preference (preferred/avoid badge), Reason, Source (manual/learned badge), Created date
- "Add Preference" button opens dialog with coach select, centre select, preference type toggle, optional reason
- Edit/Delete actions per row
- Learned preferences tagged with "Auto-learned" badge

- [ ] **Step 2: Commit**

```bash
git add app/(dashboard)/admin/settings/scheduling/page.tsx
git commit -m "feat: add scheduling preferences management page"
```

### Task 17: Scheduling run history

**Files:**
- Create: `components/roster/ai-history-view.tsx`

- [ ] **Step 1: Create history view**

Can be rendered as a tab on the roster page or standalone at `/admin/roster/ai-history`:
- Table: Week, Sessions Assigned, Confidence (G/A/R), Adjustments Count, Status, Published Date
- Click row → detail view showing:
  - What AI suggested vs what was published (diff of assignments vs adjustments)
  - Adjustment details: original coach → replacement coach, session info
- Over time shows whether AI is improving (fewer adjustments)

- [ ] **Step 2: Commit**

```bash
git add components/roster/ai-history-view.tsx
git commit -m "feat: add AI scheduling history view"
```

### Task 18: Coach "Can't Make It" button and cancellation flow

**Files:**
- Create: `components/roster/cancel-session-dialog.tsx`
- Modify: coach session detail page to add the button

- [ ] **Step 1: Create cancellation dialog**

Dialog with:
- Reason select: Sick, Emergency, Personal, Other
- Optional details textarea
- "Cancel Session" button (destructive variant)
- On submit: calls `cancelSessionAsCoach()` server action
- Shows confirmation with "Ops has been notified and is finding a replacement"

- [ ] **Step 2: Add to coach session detail**

On confirmed sessions, add "Can't Make It" button next to existing actions. Only visible for future sessions.

- [ ] **Step 3: Commit**

```bash
git add components/roster/cancel-session-dialog.tsx
git commit -m "feat: add coach cancellation flow for rerostering"
```

### Task 19: Ops replacement review UI

**Files:**
- Create: `components/roster/replacement-panel.tsx`

- [ ] **Step 1: Create replacement panel**

Rendered on the session detail page when status = "needs_replacement":
- Cancellation info: original coach name, reason, time of cancellation
- Time pressure indicator (red banner if session within 4 hours)
- "Replacement Suggestions" list with ranked coach cards:
  - Coach name, phone, score, key reasons
  - Score breakdown bars (familiarity, utilisation, location, preference, compliance)
  - "Send Offer" button per suggestion
- Current status indicator: Awaiting Selection / Offer Sent (with countdown) / Declined / Expired

- [ ] **Step 2: Commit**

```bash
git add components/roster/replacement-panel.tsx
git commit -m "feat: add ops replacement review panel for rerostering"
```

### Task 20: Active Rerostering ops widget

**Files:**
- Create: `components/ops/active-rerostering-widget.tsx`
- Modify: ops dashboard to include the widget

- [ ] **Step 1: Create widget**

Dashboard card showing:
- Count of active rerostering events
- Each event: session sport + centre + time, hours until session, offer status
- Quick action: link to session detail for full replacement panel
- Red badge for escalated events

Uses `getActiveRerosteringEvents()` server action.

- [ ] **Step 2: Add to ops dashboard**

Import and render alongside existing widgets (pending-swaps, compliance-alerts, etc.)

- [ ] **Step 3: Commit**

```bash
git add components/ops/active-rerostering-widget.tsx
git commit -m "feat: add active rerostering widget to ops dashboard"
```

### Task 21: Update notification events for new types

**Files:**
- Modify: `lib/notifications/events.ts`

- [ ] **Step 1: Add new event types to tier mapping**

```typescript
// Add to urgent tier:
"rerostering_offer",
"rerostering_escalation",
"roster_published",

// Add to important tier:
"rerostering_accepted",
"rerostering_declined",
"rerostering_expired",
"roster_generated",
```

- [ ] **Step 2: Commit**

```bash
git add lib/notifications/events.ts
git commit -m "feat: add scheduling and rerostering notification event types"
```

---

## Chunk 6: Tests

### Task 22: Solver unit tests

**Files:**
- Create: `lib/utils/scheduling/__tests__/solver.test.ts`

- [ ] **Step 1: Write tests**

Test groups:
1. **Travel calculations:**
   - `haversineDistance` returns correct km for known coordinates (e.g. Bankstown to Liverpool ≈ 8km)
   - `estimatedTravelMinutes` applies 1.4x factor and 30km/h speed
   - `hasAdequateTravelBuffer` returns false when gap < travel time, true when adequate
   - Falls back to 30 min default when coordinates missing

2. **Eligibility filtering:**
   - Coach with matching availability slot passes
   - Coach without availability for session day fails
   - Coach with overlapping session fails
   - Coach with inadequate travel buffer fails
   - Coach at same centre (no travel needed) passes even with tight schedule

3. **Scoring:**
   - Familiarity: +3 for recent history at centre
   - Utilisation: +2 when below average, -1 when above
   - Location preference: +1 when centre address matches
   - Scheduling preference: +5 preferred, -10 avoid
   - Compliance: -3 for expired mandatory docs

4. **Assignment algorithm:**
   - Assigns highest-scored coach
   - Handles unassignable sessions (returns null with reason)
   - Backtracking: when first choice blocks a harder session, tries second choice
   - Confidence levels: green (score>=5, 3+ eligible), amber (score>=0 or 1-2 eligible), red (negative or none)

5. **Performance:**
   - 50 sessions × 15 coaches completes in under 2 seconds

All tests use mock data (no Supabase calls) — test the pure functions `getEligibleCoaches`, `scoreCoachForSession`, `generateRoster` directly.

- [ ] **Step 2: Run tests**

Run: `npx jest lib/utils/scheduling/__tests__/solver.test.ts` (or vitest equivalent)

- [ ] **Step 3: Commit**

```bash
git add lib/utils/scheduling/__tests__/solver.test.ts
git commit -m "test: add smart scheduling solver unit tests"
```

---

## Implementation Notes

### Dependencies
- No new npm packages required — uses existing shadcn/ui, Lucide, Supabase, recharts
- `@dnd-kit/core` already in project if needed for drag-drop in preferences

### Performance
- Solver is pure TypeScript, no LLM calls — should handle 50+ sessions in <2s
- Data assembly makes ~7 parallel Supabase queries (can be optimised with Promise.all)
- Rerostering suggestions reuse solver context assembly

### Migration Safety
- `ALTER TYPE ... ADD VALUE IF NOT EXISTS` is safe for adding enum values
- New tables only — no existing table modifications except adding `needs_replacement` to session status
- RLS follows existing patterns

### Notification Integration
- New event types added to existing tier mapping
- Uses same `triggerNotification` / `triggerNotificationForOps` infrastructure
- Coach offer notifications use "urgent" tier for immediate delivery

### Cron Job
- Add `app/api/cron/rerostering-escalation/route.ts` to call `processRerosteringEscalations()` every 15 minutes via Vercel Cron
- Add to `vercel.json` cron config: `{ "path": "/api/cron/rerostering-escalation", "schedule": "*/15 * * * *" }`

### Existing Code Impact
- `VALID_TRANSITIONS` updated to support `needs_replacement` status
- `AutoCreateTaskInput.source` extended with `"rerostering"`
- Roster page gets new AI button and review mode overlay
- Ops dashboard gets new widget
- Coach session detail gets "Can't Make It" button
- `EVENT_TIER_MAP` extended with new notification types
