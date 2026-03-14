# Coach Performance & Training LMS Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build coach performance metrics engine with dashboards, badge system, and a Training LMS module builder for Build Alpha Kids.

**Architecture:** Three independent subsystems sharing the same DB layer: (1) Performance calculation engine — pure functions aggregating data from sessions, feedback, attendance, forms, equipment, and scheduling into weighted 0–100 scores with trend analysis. (2) Performance UI — admin team overview, individual coach detail with sparklines/radar charts, coach self-view with motivational design, badge display. (3) Training LMS foundation — module CRUD with four content types (video, document, quiz, checklist), pathway builder, assignment tracking.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS), shadcn/ui, Tailwind CSS, recharts (sparklines, radar, bar charts), Lucide React icons, @react-pdf/renderer (PDF export), Vercel Cron

**Critical API patterns (must follow exactly):**
- Supabase server client: `import { createSupabaseServerClient } from "@/lib/supabase/server"`
- Supabase admin client: `import { createSupabaseAdmin } from "@/lib/supabase/admin"`
- Notifications: `triggerNotification(event, recipients[])` — event uses camelCase (`entityType`, `entityId`), tier from `EVENT_TIER_MAP`
- Australian English in all UI text (centre, organisation, programme)
- Navigation config: `components/shared/navigation/nav-config.ts` — add items to `NAV_CONFIG` arrays
- Cron routes: GET handler, verify `authorization` header against `process.env.CRON_SECRET`, use admin client
- Recharts: `ResponsiveContainer`, branded colours `#E8712A` (orange), `#6B7280` (grey)
- CSV export: build string, create anchor with `download` attribute
- PDF export: `@react-pdf/renderer` with `renderToBuffer()`
- Widget pattern (ops): use `WidgetWrapper` from `@/components/ops/widget-wrapper`
- Migration numbering: next is `029`

---

## Chunk 1: Database Migrations & TypeScript Types

### Task 1: Migration 029 — Performance tables + enums

**Files:**
- Create: `supabase/migrations/029_coach_performance.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 029_coach_performance.sql
-- Coach Performance: snapshots and badges

-- coach_performance_snapshots
CREATE TABLE IF NOT EXISTS coach_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metrics_json jsonb NOT NULL DEFAULT '{}',
  overall_score decimal(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perf_snapshots_coach ON coach_performance_snapshots(coach_id);
CREATE INDEX idx_perf_snapshots_period ON coach_performance_snapshots(period_start, period_end);

-- coach_badges
CREATE TABLE IF NOT EXISTS coach_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_coach_badges_unique ON coach_badges(coach_id, badge_key);

-- RLS
ALTER TABLE coach_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_badges ENABLE ROW LEVEL SECURITY;

-- Admin/ops: full access to snapshots
CREATE POLICY "admin_ops_snapshots_all" ON coach_performance_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read own snapshots
CREATE POLICY "coach_own_snapshots" ON coach_performance_snapshots
  FOR SELECT USING (coach_id = auth.uid());

-- Admin/ops: full access to badges
CREATE POLICY "admin_ops_badges_all" ON coach_badges
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read own badges
CREATE POLICY "coach_own_badges" ON coach_badges
  FOR SELECT USING (coach_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/029_coach_performance.sql
git commit -m "feat: add coach performance snapshots and badges tables"
```

### Task 2: Migration 030 — Training LMS tables + enums

**Files:**
- Create: `supabase/migrations/030_training_lms.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- 030_training_lms.sql
-- Training LMS: modules, pathways, assignments, completions

-- Enums
CREATE TYPE training_module_type AS ENUM ('video', 'document', 'quiz', 'checklist');
CREATE TYPE training_category AS ENUM ('onboarding', 'sport_specific', 'compliance', 'professional_development');
CREATE TYPE training_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE training_assignment_status AS ENUM ('assigned', 'in_progress', 'completed', 'overdue');

-- training_modules
CREATE TABLE IF NOT EXISTS training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type training_module_type NOT NULL,
  category training_category NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}',
  estimated_minutes int,
  is_mandatory boolean NOT NULL DEFAULT false,
  required_for_sports jsonb DEFAULT NULL,
  status training_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- training_pathways
CREATE TABLE IF NOT EXISTS training_pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category training_category NOT NULL,
  is_mandatory_onboarding boolean NOT NULL DEFAULT false,
  status training_status NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- training_pathway_modules (join table with ordering)
CREATE TABLE IF NOT EXISTS training_pathway_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pathway_id uuid NOT NULL REFERENCES training_pathways(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- training_assignments
CREATE TABLE IF NOT EXISTS training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid REFERENCES training_modules(id) ON DELETE CASCADE,
  pathway_id uuid REFERENCES training_pathways(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id),
  due_date date,
  status training_assignment_status NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT exactly_one_target CHECK (
    (module_id IS NOT NULL AND pathway_id IS NULL)
    OR (module_id IS NULL AND pathway_id IS NOT NULL)
  )
);

CREATE INDEX idx_training_assignments_coach ON training_assignments(coach_id);
CREATE INDEX idx_training_assignments_status ON training_assignments(status);

-- training_completions
CREATE TABLE IF NOT EXISTS training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES training_assignments(id) ON DELETE SET NULL,
  score decimal(5,2),
  passed boolean,
  attempt_number int NOT NULL DEFAULT 1,
  completion_data jsonb DEFAULT '{}',
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_completions_coach ON training_completions(coach_id);
CREATE INDEX idx_training_completions_module ON training_completions(module_id);

-- RLS
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_pathway_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_completions ENABLE ROW LEVEL SECURITY;

-- Admin/ops: full access to modules, pathways, pathway_modules
CREATE POLICY "admin_ops_modules_all" ON training_modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "admin_ops_pathways_all" ON training_pathways
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "admin_ops_pw_modules_all" ON training_pathway_modules
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );

-- Coaches: read published modules
CREATE POLICY "coach_read_published_modules" ON training_modules
  FOR SELECT USING (
    status = 'published' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );
CREATE POLICY "coach_read_published_pathways" ON training_pathways
  FOR SELECT USING (
    status = 'published' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );
CREATE POLICY "coach_read_pw_modules" ON training_pathway_modules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );

-- Assignments: admin/ops full, coaches read own
CREATE POLICY "admin_ops_assignments_all" ON training_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "coach_own_assignments" ON training_assignments
  FOR SELECT USING (coach_id = auth.uid());

-- Completions: admin/ops read all, coaches insert+read own
CREATE POLICY "admin_ops_completions_read" ON training_completions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'ops'))
  );
CREATE POLICY "coach_own_completions" ON training_completions
  FOR ALL USING (coach_id = auth.uid());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/030_training_lms.sql
git commit -m "feat: add training LMS tables with modules, pathways, assignments, completions"
```

### Task 3: TypeScript types and enums

**Files:**
- Modify: `lib/types/enums.ts`
- Modify: `lib/types/database.ts`

- [ ] **Step 1: Add enums to `lib/types/enums.ts`**

```typescript
// Training LMS
export type TrainingModuleType = "video" | "document" | "quiz" | "checklist";
export type TrainingCategory = "onboarding" | "sport_specific" | "compliance" | "professional_development";
export type TrainingStatus = "draft" | "published" | "archived";
export type TrainingAssignmentStatus = "assigned" | "in_progress" | "completed" | "overdue";
```

- [ ] **Step 2: Add interfaces to `lib/types/database.ts`**

```typescript
// ========================
// Performance
// ========================
export interface CoachPerformanceSnapshot {
  id: string;
  coach_id: string;
  period_start: string;
  period_end: string;
  metrics_json: CoachMetrics;
  overall_score: number;
  created_at: string;
}

export interface CoachMetrics {
  session_volume: { count: number; trend: number; previous_count: number };
  feedback_rating: { average: number; team_average: number; trend: number; count: number };
  attendance_consistency: { average_per_session: number; trend: "growing" | "stable" | "declining" };
  form_completion: { rate: number; expected: number; actual: number };
  punctuality: { average_minutes: number; late_count: number; total_tracked: number };
  shift_reliability: { rate: number; completed: number; total: number; cancellations: number };
  assessment_thoroughness: { std_dev: number; avg_rating: number; total_ratings: number; flagged: boolean };
  equipment_responsibility: { issue_rate: number; issues: number; checkins: number };
}

export interface CoachBadge {
  id: string;
  coach_id: string;
  badge_key: string;
  earned_at: string;
  metadata: Record<string, unknown>;
}

// ========================
// Training LMS
// ========================
export interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  type: import("./enums").TrainingModuleType;
  category: import("./enums").TrainingCategory;
  content_json: VideoContent | DocumentContent | QuizContent | ChecklistContent;
  estimated_minutes: number | null;
  is_mandatory: boolean;
  required_for_sports: string[] | null;
  status: import("./enums").TrainingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoContent {
  video_url: string;
  video_type: "upload" | "youtube" | "vimeo";
  duration_seconds: number;
  require_full_watch: boolean;
}

export interface DocumentContent {
  file_url: string;
  file_name: string;
  file_type: "pdf" | "docx";
  require_acknowledgement: boolean;
}

export interface QuizContent {
  pass_mark: number;
  allow_retries: boolean;
  max_retries: number;
  randomise_order: boolean;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
}

export interface ChecklistContent {
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  requires_note: boolean;
}

export interface TrainingPathway {
  id: string;
  title: string;
  description: string | null;
  category: import("./enums").TrainingCategory;
  is_mandatory_onboarding: boolean;
  status: import("./enums").TrainingStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingPathwayModule {
  id: string;
  pathway_id: string;
  module_id: string;
  order_index: number;
  created_at: string;
}

export interface TrainingAssignment {
  id: string;
  coach_id: string;
  module_id: string | null;
  pathway_id: string | null;
  assigned_by: string | null;
  due_date: string | null;
  status: import("./enums").TrainingAssignmentStatus;
  assigned_at: string;
  completed_at: string | null;
}

export interface TrainingCompletion {
  id: string;
  coach_id: string;
  module_id: string;
  assignment_id: string | null;
  score: number | null;
  passed: boolean | null;
  attempt_number: number;
  completion_data: Record<string, unknown>;
  completed_at: string;
  created_at: string;
}
```

Also add to the `Database` interface map:
```typescript
coach_performance_snapshots: CoachPerformanceSnapshot;
coach_badges: CoachBadge;
training_modules: TrainingModule;
training_pathways: TrainingPathway;
training_pathway_modules: TrainingPathwayModule;
training_assignments: TrainingAssignment;
training_completions: TrainingCompletion;
```

- [ ] **Step 3: Commit**

```bash
git add lib/types/enums.ts lib/types/database.ts
git commit -m "feat: add performance and training LMS TypeScript types and enums"
```

---

## Chunk 2: Performance Calculation Engine

### Task 4: Core performance calculator

**Files:**
- Create: `lib/utils/performance/calculate.ts`

- [ ] **Step 1: Create the calculation engine**

Server-only module. Uses admin client since it needs cross-coach data.

Implements `calculateCoachPerformance(coachId, periodStart, periodEnd)` which:
1. Fetches completed sessions for the coach in the period
2. Calculates all 8 metrics (session volume, feedback, attendance, form completion, punctuality, reliability, assessment thoroughness, equipment)
3. Computes weighted overall score (feedback 25%, reliability 20%, form completion 15%, punctuality 15%, volume 10%, attendance 10%, equipment 5%)
4. Returns `CoachMetrics` + `overall_score`

Also implements `calculateTeamBenchmarks(periodStart, periodEnd)` which runs the calculation for all active coaches and computes average, median, top/bottom quartile for each metric.

Each metric calculation should be a separate pure function for testability.

Key metric implementations:
- **Session Volume**: COUNT sessions WHERE coach_id AND status='completed' AND date BETWEEN period. Trend = (current - previous) / previous.
- **Feedback Rating**: AVG of feedback_ratings.rating WHERE session coach_id matches. Compare to team avg.
- **Attendance Consistency**: AVG of session_attendances COUNT per session (or headcount fallback). Trend: split period in half, compare halves.
- **Form Completion**: Expected = completed_sessions * 2. Actual = COUNT form_submissions WHERE coach's sessions. Rate = actual/expected*100, capped at 100.
- **Punctuality**: For sessions with started_at: diff from scheduled time. Avg minutes, count >5min late.
- **Shift Reliability**: completed / (completed + cancelled_by_coach via rerostering_events). Factor in cancellation_reason.
- **Assessment Thoroughness**: StdDev of skill_ratings values given by this coach. Low StdDev (<0.5) = flagged.
- **Equipment**: equipment_logs with action='issue_flagged' / total 'check_in' actions.

- [ ] **Step 2: Commit**

```bash
git add lib/utils/performance/calculate.ts
git commit -m "feat: add coach performance calculation engine with 8 metrics"
```

### Task 5: Badge system

**Files:**
- Create: `lib/utils/performance/badges.ts`

- [ ] **Step 1: Create badge definitions and checker**

Define all badge types with their criteria:
```typescript
export const BADGE_DEFINITIONS = {
  fifty_sessions: { name: "50 Sessions Club", description: "Completed 50+ sessions", icon: "trophy" },
  century_coach: { name: "Century Coach", description: "Completed 100+ sessions", icon: "award" },
  five_star: { name: "Five Star", description: "Average rating >= 4.8 over 20+ sessions", icon: "star" },
  perfect_punctuality: { name: "Perfect Punctuality", description: "Zero late starts in a calendar month", icon: "clock" },
  form_champion: { name: "Form Champion", description: "100% form completion for 3 consecutive months", icon: "clipboard-check" },
  reliability_rock: { name: "Reliability Rock", description: "100% shift completion for 3 consecutive months", icon: "shield-check" },
  multi_sport_master: { name: "Multi-Sport Master", description: "Delivered 5+ different sports", icon: "medal" },
} as const;
```

Implement `checkBadgeEligibility(coachId)` that:
1. Queries cumulative data (not just one period)
2. Checks each badge criterion
3. Returns list of newly earned badges (not already in coach_badges)

Implement `awardBadges(coachId, badges[])` that:
1. Inserts new badges into coach_badges
2. Sends INFORMATIONAL notification for each new badge

Implement `getCoachBadges(coachId)` that returns all earned badges.

- [ ] **Step 2: Commit**

```bash
git add lib/utils/performance/badges.ts
git commit -m "feat: add badge definitions and eligibility checker"
```

### Task 6: Performance helper functions and index

**Files:**
- Create: `lib/utils/performance/helpers.ts`
- Create: `lib/utils/performance/index.ts`

- [ ] **Step 1: Create helper functions**

```typescript
// helpers.ts
"use server";

// getCoachPerformance(coachId, periodStart, periodEnd)
// Returns current metrics + previous period for comparison

// getTeamRanking(metric, periodStart, periodEnd)
// Returns sorted coaches by specific metric

// getCoachPercentile(coachId, metric, periodStart, periodEnd)
// Returns what percentile the coach is in for a given metric
```

- [ ] **Step 2: Create barrel export**

```typescript
// index.ts — barrel export
export { calculateCoachPerformance, calculateTeamBenchmarks } from "./calculate";
export { BADGE_DEFINITIONS, checkBadgeEligibility, awardBadges, getCoachBadges } from "./badges";
export { getCoachPerformance, getTeamRanking, getCoachPercentile } from "./helpers";
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/performance/helpers.ts lib/utils/performance/index.ts
git commit -m "feat: add performance helper functions and barrel export"
```

### Task 7: Performance snapshot cron API route

**Files:**
- Create: `app/api/cron/performance-snapshot/route.ts`
- Modify: `vercel.json` — add cron entry

- [ ] **Step 1: Create the cron route**

GET handler that:
1. Verifies CRON_SECRET auth header
2. Uses admin client
3. Gets all active coaches
4. Calculates performance for each for the past month
5. Inserts coach_performance_snapshots records
6. Checks badge eligibility for each coach and awards new badges
7. Returns summary

- [ ] **Step 2: Add to vercel.json**

```json
{ "path": "/api/cron/performance-snapshot", "schedule": "0 22 1 * *" }
```

Runs 1st of each month at 22:00 UTC (08:00 AEST next day).

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/performance-snapshot/route.ts vercel.json
git commit -m "feat: add monthly performance snapshot cron job"
```

### Task 8: Performance calculation tests

**Files:**
- Create: `lib/utils/performance/__tests__/calculate.test.ts`

- [ ] **Step 1: Write tests**

Test groups:
1. **Metric normalisation**: weighted score calculation with known inputs
2. **Trend calculation**: positive, negative, zero trends
3. **Punctuality scoring**: early, on-time, late sessions
4. **Assessment thoroughness**: high variance (good), low variance (flagged)
5. **Shift reliability**: with and without cancellations
6. **Overall score**: verify weights sum to 100%, boundary values

All tests use mock data — no Supabase calls.

- [ ] **Step 2: Run tests**

```bash
npx vitest run lib/utils/performance/__tests__/calculate.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils/performance/__tests__/calculate.test.ts
git commit -m "test: add performance calculation unit tests"
```

---

## Chunk 3: Performance Dashboard UI — Admin & Coach Views

### Task 9: Team performance page (admin + ops)

**Files:**
- Create: `app/(dashboard)/admin/performance/page.tsx`
- Create: `components/performance/team-performance-view.tsx`

- [ ] **Step 1: Create server page**

Server component fetching team data for current month. Uses `getCoachPerformance` for all active coaches, `calculateTeamBenchmarks`.

- [ ] **Step 2: Create client view**

`TeamPerformanceView` — "use client" component with:
- Period selector (month picker, "Last 3 months", "Last 6 months")
- Summary cards: team avg overall score, total sessions, avg feedback, avg form completion
- Coach performance table: sortable columns (name, overall score colour-coded, session count, avg rating with stars, form %, punctuality, reliability %, actions)
- Click row → inline expand with full metrics + trend arrows + badge count
- Click coach name → link to `/admin/performance/[coachId]`
- Filters: period, minimum session count
- Export button (CSV download)

- [ ] **Step 3: Create ops mirror page**

```typescript
// app/(dashboard)/ops/performance/page.tsx
// Same server component, different basePath
```

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/admin/performance/page.tsx components/performance/team-performance-view.tsx app/(dashboard)/ops/performance/page.tsx
git commit -m "feat: add team performance page for admin and ops"
```

### Task 10: Individual coach performance page

**Files:**
- Create: `app/(dashboard)/admin/performance/[coachId]/page.tsx`
- Create: `components/performance/coach-performance-detail.tsx`

- [ ] **Step 1: Create server page**

Fetches coach profile, current metrics, historical snapshots (last 6 months), badges, recent sessions with ratings.

- [ ] **Step 2: Create detail view**

`CoachPerformanceDetail` — "use client" component with:
- Header: coach name, avatar, large colour-coded overall score, badge icons
- Metric cards grid: 8 cards, each showing current value, team avg comparison, trend arrow + delta, mini sparkline (recharts LineChart from snapshots)
- Detailed breakdown sections:
  - Session history: recent sessions with individual ratings
  - Centre performance: rating by centre (bar chart)
  - Sport performance: rating by sport (bar chart)
  - Feedback comments: recent feedback text
- "Compare" button: select other coaches for side-by-side

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/admin/performance/[coachId]/page.tsx components/performance/coach-performance-detail.tsx
git commit -m "feat: add individual coach performance detail page"
```

### Task 11: Coach comparison view

**Files:**
- Create: `components/performance/coach-comparison.tsx`

- [ ] **Step 1: Create comparison component**

Dialog or page that:
- Select 2-3 coaches from dropdown
- Side-by-side metric cards
- Radar chart (recharts RadarChart) with all metrics as axes, each coach as coloured polygon
- Useful text: "Best for..." recommendation based on metrics

- [ ] **Step 2: Commit**

```bash
git add components/performance/coach-comparison.tsx
git commit -m "feat: add coach comparison view with radar chart"
```

### Task 12: Coach self-view performance page

**Files:**
- Create: `app/(dashboard)/coach/performance/page.tsx`
- Create: `components/performance/coach-self-view.tsx`

- [ ] **Step 1: Create server page**

Fetches own metrics (RLS enforces), team benchmarks (anonymised), own badges.

- [ ] **Step 2: Create self-view**

`CoachSelfView` — motivational design using green/emerald tones:
- Same metric cards but with team benchmarks instead of names: "Your rating: 4.6 — Team average: 4.3"
- Percentile: "Top 20% of coaches"
- Earned badges prominently displayed
- "Recent highlights": best-rated sessions, positive feedback
- Monthly trend chart for overall score
- Celebration language: "Great work!", "Keep it up!", achievement framing

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/coach/performance/page.tsx components/performance/coach-self-view.tsx
git commit -m "feat: add coach self-view performance page"
```

### Task 13: Badge display component

**Files:**
- Create: `components/performance/badge-display.tsx`

- [ ] **Step 1: Create reusable badge component**

`BadgeDisplay` — renders badges as circular icons:
- Earned: full colour with gold border, date earned
- Unearned: greyed out with progress indicator ("38/50 sessions")
- Tap → popover showing name, description, date earned or progress
- Props: `badges: CoachBadge[]`, `showUnearned?: boolean`, `coachStats?: { totalSessions, avgRating, ... }`

- [ ] **Step 2: Commit**

```bash
git add components/performance/badge-display.tsx
git commit -m "feat: add badge display component"
```

### Task 14: Admin dashboard widget + navigation updates

**Files:**
- Create: `components/admin/performance-widget.tsx`
- Modify: `app/(dashboard)/admin/page.tsx` — add widget
- Modify: `components/shared/navigation/nav-config.ts` — add Performance nav items

- [ ] **Step 1: Create admin performance widget**

Widget card showing:
- Team average overall score with trend arrow
- Top 3 performers this month (name + score)
- Coaches with scores below 60 (flagged red)
- "View All" link to /admin/performance

- [ ] **Step 2: Add to admin dashboard page**

Import and render after existing widgets.

- [ ] **Step 3: Update navigation**

Add to `NAV_CONFIG`:
- Admin: `{ label: "Performance", href: "/admin/performance", icon: TrendingUp }` — insert after Staff
- Ops: `{ label: "Performance", href: "/ops/performance", icon: TrendingUp }` — insert after Staff
- Coach: `{ label: "Performance", href: "/coach/performance", icon: TrendingUp }` — add as sub-item under Profile, or replace Profile's mobileOrder

Import `TrendingUp` from lucide-react.

- [ ] **Step 4: Commit**

```bash
git add components/admin/performance-widget.tsx app/(dashboard)/admin/page.tsx components/shared/navigation/nav-config.ts
git commit -m "feat: add performance dashboard widget and navigation entries"
```

---

## Chunk 4: Training LMS — Server Actions & Module Builder

### Task 15: Training server actions

**Files:**
- Create: `lib/training/actions.ts`

- [ ] **Step 1: Create CRUD actions**

Server actions for:
- `getTrainingModules(filters?)` — list with filters by type, category, status, mandatory
- `getTrainingModule(id)` — single module with full content
- `createTrainingModule(data)` — create new module
- `updateTrainingModule(id, data)` — update module fields + content_json
- `deleteTrainingModule(id)` — soft delete (set status to archived)
- `publishTrainingModule(id)` — set status to published
- `getTrainingPathways(filters?)` — list pathways
- `getTrainingPathway(id)` — single with ordered modules
- `createTrainingPathway(data)` — create pathway
- `updateTrainingPathway(id, data)` — update pathway
- `addModuleToPathway(pathwayId, moduleId, orderIndex)` — add module
- `removeModuleFromPathway(pathwayModuleId)` — remove
- `reorderPathwayModules(pathwayId, orderedModuleIds[])` — reorder

All use `createSupabaseServerClient()`, revalidate paths, log to activity_log.

- [ ] **Step 2: Commit**

```bash
git add lib/training/actions.ts
git commit -m "feat: add training LMS server actions"
```

### Task 16: Module list page

**Files:**
- Create: `app/(dashboard)/admin/training/page.tsx`
- Create: `app/(dashboard)/admin/training/modules/page.tsx`
- Create: `components/training/module-list-view.tsx`

- [ ] **Step 1: Create training landing page**

Redirect or tab layout with "Modules" and "Pathways" tabs.

- [ ] **Step 2: Create modules list page**

Server component fetching `getTrainingModules()`.

- [ ] **Step 3: Create module list view**

`ModuleListView` — "use client":
- Table: title, type badge (colour-coded), category badge, mandatory indicator, status badge, created date
- Filters: type, category, status, mandatory
- "Create Module" button → navigates to create page
- Click row → navigates to edit page

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/admin/training/page.tsx app/(dashboard)/admin/training/modules/page.tsx components/training/module-list-view.tsx
git commit -m "feat: add training module list page"
```

### Task 17: Module editor — common fields + video/document editors

**Files:**
- Create: `app/(dashboard)/admin/training/modules/new/page.tsx`
- Create: `app/(dashboard)/admin/training/modules/[id]/edit/page.tsx`
- Create: `components/training/module-editor.tsx`
- Create: `components/training/editors/video-editor.tsx`
- Create: `components/training/editors/document-editor.tsx`

- [ ] **Step 1: Create new module page**

Server component that renders `ModuleEditor` with empty defaults. Includes type selector (locked after creation).

- [ ] **Step 2: Create edit module page**

Server component fetching `getTrainingModule(id)` and rendering `ModuleEditor` with existing data.

- [ ] **Step 3: Create module editor**

`ModuleEditor` — "use client":
- Common fields: title (required), description (textarea), category (select), estimated minutes, is_mandatory (checkbox), required_for_sports (multi-select from SPORTS constant), status indicator
- Type-specific content area: renders appropriate editor based on module type
- "Save Draft" and "Publish" buttons
- Uses `createTrainingModule` or `updateTrainingModule` server actions

- [ ] **Step 4: Create video editor**

`VideoEditor`:
- Upload to Supabase Storage ("training-videos" bucket) OR paste YouTube/Vimeo URL
- Video type auto-detect from URL
- Preview: iframe for YouTube/Vimeo, native video element for uploads
- Toggle: require full watch

- [ ] **Step 5: Create document editor**

`DocumentEditor`:
- Upload PDF/DOCX to Supabase Storage ("training-docs" bucket)
- File name display + download link
- Acknowledgement text shown as preview

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/admin/training/modules/new/page.tsx app/(dashboard)/admin/training/modules/[id]/edit/page.tsx components/training/module-editor.tsx components/training/editors/video-editor.tsx components/training/editors/document-editor.tsx
git commit -m "feat: add module editor with video and document editors"
```

### Task 18: Module editor — quiz and checklist editors

**Files:**
- Create: `components/training/editors/quiz-editor.tsx`
- Create: `components/training/editors/checklist-editor.tsx`

- [ ] **Step 1: Create quiz editor**

`QuizEditor`:
- Pass mark input (default 80%)
- Allow retries toggle + max retries (number input)
- Randomise order toggle
- Question builder:
  - Add question button
  - Per question: question text (textarea), 2-4 options (text inputs with add/remove), correct answer (radio), explanation (textarea, optional)
  - Reorder questions (up/down buttons or drag-drop with @dnd-kit if available)
  - Remove question (with confirmation)
- Preview mode: renders quiz as coach would see (read-only)

- [ ] **Step 2: Create checklist editor**

`ChecklistEditor`:
- Add item button
- Per item: title (required), description (optional textarea), requires note toggle
- Reorder items (up/down buttons)
- Remove item
- Preview mode: renders checklist with checkboxes

- [ ] **Step 3: Commit**

```bash
git add components/training/editors/quiz-editor.tsx components/training/editors/checklist-editor.tsx
git commit -m "feat: add quiz and checklist content editors"
```

---

## Chunk 5: Training LMS — Pathways & Seed Data

### Task 19: Pathway builder

**Files:**
- Create: `app/(dashboard)/admin/training/pathways/page.tsx`
- Create: `app/(dashboard)/admin/training/pathways/[id]/edit/page.tsx`
- Create: `components/training/pathway-editor.tsx`

- [ ] **Step 1: Create pathways list page**

Server component listing pathways with module count, category, status, mandatory badge.

- [ ] **Step 2: Create pathway editor**

`PathwayEditor` — "use client":
- Title, description, category, is_mandatory_onboarding toggle, status
- Module list with ordering: drag/reorder modules, add from published modules dropdown, remove
- Total estimated time calculated from module durations
- "Save" and "Publish" buttons

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/admin/training/pathways/page.tsx app/(dashboard)/admin/training/pathways/[id]/edit/page.tsx components/training/pathway-editor.tsx
git commit -m "feat: add training pathway builder"
```

### Task 20: Seed data for sample training modules

**Files:**
- Create: `supabase/seed-training.sql`

- [ ] **Step 1: Create seed SQL**

Insert 4 sample modules:
1. "Welcome to Build Alpha Kids" — video type, onboarding category, mandatory
2. "Child Safety Policy" — document type, compliance category, mandatory
3. "Session Delivery Standards" — checklist type (8 items: setup, attendance, warm-up, skill development, cool-down, feedback, pack-down, report), onboarding category, mandatory
4. "Child Safety Awareness" — quiz type (10 questions with options and explanations), compliance category, mandatory

All set to `status = 'draft'` so admin can review before publishing.

- [ ] **Step 2: Commit**

```bash
git add supabase/seed-training.sql
git commit -m "feat: add training module seed data"
```

### Task 21: Add Training to navigation

**Files:**
- Modify: `components/shared/navigation/nav-config.ts`

- [ ] **Step 1: Add Training nav items**

Add to admin nav (after Programs):
```typescript
{ label: "Training", href: "/admin/training", icon: GraduationCap }
```

Add to ops nav (after Programs):
```typescript
{ label: "Training", href: "/ops/training", icon: GraduationCap }
```

Import `GraduationCap` from lucide-react.

- [ ] **Step 2: Commit**

```bash
git add components/shared/navigation/nav-config.ts
git commit -m "feat: add Training to admin and ops navigation"
```

---

## Chunk 6: Notification Events & Final Integration

### Task 22: Add performance and training notification event types

**Files:**
- Modify: `lib/types/enums.ts` — add event types
- Modify: `lib/notifications/events.ts` — add to EVENT_TIER_MAP

- [ ] **Step 1: Add notification event types to enums**

Add to `NotificationEventType`:
```typescript
| "badge_earned"
| "performance_review_ready"
| "training_assigned"
| "training_completed"
| "training_overdue"
```

- [ ] **Step 2: Add to EVENT_TIER_MAP**

```typescript
// Informational
badge_earned: "informational",
performance_review_ready: "informational",

// Important
training_assigned: "important",
training_completed: "informational",
training_overdue: "important",
```

- [ ] **Step 3: Commit**

```bash
git add lib/types/enums.ts lib/notifications/events.ts
git commit -m "feat: add performance and training notification event types"
```

### Task 23: Performance server actions for pages

**Files:**
- Create: `lib/performance/actions.ts`

- [ ] **Step 1: Create page-level server actions**

Actions used by the UI pages:
- `getTeamPerformanceData(periodStart, periodEnd)` — returns all coach metrics + benchmarks for team page
- `getCoachPerformanceDetail(coachId)` — returns metrics, snapshots, badges, recent sessions for detail page
- `getCoachSelfPerformance()` — returns own metrics + anonymised benchmarks for coach self-view
- `exportTeamPerformanceCsv(periodStart, periodEnd)` — returns CSV string
- `getPerformanceWidgetData()` — returns team avg, top 3, flagged coaches for admin widget

All use `createSupabaseServerClient()`.

- [ ] **Step 2: Commit**

```bash
git add lib/performance/actions.ts
git commit -m "feat: add performance page server actions"
```

---

## Implementation Notes

### Dependencies
- No new npm packages required — uses existing shadcn/ui, Lucide, Supabase, recharts, @react-pdf/renderer
- `@dnd-kit/core` already in project for drag-drop in quiz/checklist/pathway editors

### Performance
- Calculation engine runs against DB with targeted queries per metric — should complete per-coach in <500ms
- Monthly cron handles all coaches in batch (uses admin client to bypass RLS)
- Sparklines use pre-computed snapshot data (no re-calculation on page load)

### Migration Safety
- New tables only — no existing table modifications
- New enums only — no ALTER TYPE needed
- RLS follows existing patterns

### Recharts Components Needed
- `LineChart` + `Line` — sparklines for metric trends
- `RadarChart` + `Radar` + `PolarGrid` + `PolarAngleAxis` — coach comparison
- `BarChart` + `Bar` — centre/sport breakdowns
- `ResponsiveContainer` — wraps all charts
- Colours: `#E8712A` (primary), `#10B981` (green/positive), `#EF4444` (red/negative), `#6B7280` (grey/neutral)

### Supabase Storage Buckets
- `training-videos` — for uploaded training videos
- `training-docs` — for uploaded training documents
- Both should be created in Supabase dashboard or via migration
