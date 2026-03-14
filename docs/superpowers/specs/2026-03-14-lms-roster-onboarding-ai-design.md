# Training LMS Completion, Roster Integration, Centre Onboarding & AI Coach Assistant — Design Spec

## Sub-project 1: Training LMS Completion

### 1.1 Pathway Builder (Admin/Ops)

**Pages:**
- `admin/training/pathways/page.tsx` — List view: table with title, category badge, module count, mandatory badge, status. "Create Pathway" button.
- `admin/training/pathways/new/page.tsx` — Renders PathwayEditor in create mode.
- `admin/training/pathways/[id]/page.tsx` — Fetches pathway with modules, renders PathwayEditor in edit mode.
- Ops mirrors at `/ops/training/pathways/...`

**PathwayEditor component** (`components/training/pathway-editor.tsx`):
- Fields: title, description, category dropdown, `is_mandatory_onboarding` toggle
- Ordered module list with drag-to-reorder (HTML5 drag events, no external library), type icon, estimated time, remove button
- "Add Module" searchable dropdown of published modules (excludes already-added)
- Footer: total estimated time, Save Draft / Publish / Cancel

**New server actions:**
- `publishTrainingPathway(id)` — status → published, activity_log
- `getPublishedModulesForSearch()` — lightweight published modules list for dropdown

**Replace PathwaysPlaceholder** on main training page with PathwayListView (real table component).

### 1.2 Assignment System

**Page:** `admin/training/assignments/page.tsx` (+ ops mirror)

**Two tab views:**
- **By Coach:** Select coach dropdown → shows their assignments grouped by status (assigned, in_progress, completed, overdue). "Assign Module" and "Assign Pathway" buttons open dialogs with published module/pathway dropdowns + optional due date.
- **By Module/Pathway:** Select module or pathway → shows all coaches assigned with completion status. "Assign to All Coaches" bulk action.

**Server actions** (`lib/training/actions.ts` — extend existing):
- `assignModuleToCoach(coachId, moduleId, dueDate?)` — creates training_assignment, sends training_assigned notification
- `assignPathwayToCoach(coachId, pathwayId, dueDate?)` — creates pathway assignment, sends notification
- `bulkAssignModule(moduleId, dueDate?)` — assigns to all active coaches
- `bulkAssignPathway(pathwayId, dueDate?)` — assigns to all active coaches
- `getCoachAssignments(coachId)` — all assignments with module/pathway details
- `getModuleAssignees(moduleId)` — all coaches assigned to this module with status
- `getPathwayAssignees(pathwayId)` — all coaches assigned to this pathway with status
- `autoAssignOnboarding(coachId)` — assigns all mandatory modules + mandatory_onboarding pathways

**Auto-assignment trigger:** When a coach profile is created with status "onboarding", call `autoAssignOnboarding`. This hooks into the existing profile creation flow.

### 1.3 Coach Training Portal

**Page:** `coach/training/page.tsx`

Three sections:
- **In Progress** — modules/pathways started but not completed
- **Assigned** — new assignments not yet started
- **Completed** — finished with dates and quiz scores

**Module cards** show: title, type icon (Video/FileText/HelpCircle/CheckSquare), category badge, estimated time, progress (for pathways: "3 of 5 modules"), due date with overdue highlighting (red text + badge).

Click navigates to module completion page.

**Server actions:**
- `getMyTrainingDashboard()` — fetches current coach's assignments grouped by status, with pathway progress calculations

### 1.4 Module Completion UI

**Page:** `coach/training/[moduleId]/page.tsx`

Server component fetches module + assignment. Client component renders based on type:

**Video module** (`components/training/completion/video-completion.tsx`):
- iframe for YouTube/Vimeo, HTML5 video for uploads
- Progress tracking via timeupdate events (percentage watched stored in state)
- If `require_full_watch`: "Mark Complete" button appears at >= 90% watched
- If not required: "Mark Complete" always visible
- Completion creates training_completions record

**Document module** (`components/training/completion/document-completion.tsx`):
- iframe PDF viewer or download link
- If `require_acknowledgement`: checkbox "I have read and understood this document" + "Acknowledge" button
- If not required: "Mark Complete" button
- Completion creates training_completions record

**Quiz module** (`components/training/completion/quiz-completion.tsx`):
- All questions shown at once (per user decision)
- If `randomise_order`: questions shuffled on mount
- Multiple choice: tap to select. Submit button.
- Results screen: score (e.g. "8/10 — 80%"), pass/fail, per-question results with green tick / red cross + explanations
- If passed: creates completion with score + passed=true
- If failed + retries allowed: "Try Again" (increments attempt_number)
- If failed + no retries: "Failed — contact your coordinator"

**Checklist module** (`components/training/completion/checklist-completion.tsx`):
- Ordered items with checkboxes
- Items with `requires_note`: text input appears when checked
- "Complete Checklist" button (active when all required items checked)
- Completion creates training_completions with checklist data as completion_data

**Server actions:**
- `completeModule(assignmentId, moduleId, data)` — creates training_completions, updates assignment status, checks pathway progression
- `getModuleForCompletion(moduleId)` — fetches module + coach's assignment + attempt history
- `startModuleProgress(assignmentId)` — updates assignment status to in_progress

### 1.5 Pathway Progression

When a coach completes a module that's part of a pathway:
1. Check if all modules in the pathway are completed
2. If yes: update pathway assignment to "completed", send training_completed notification with congratulations message
3. If no: show "Continue to Next" button linking to the next uncompleted module in order

Logic lives in `completeModule` server action — after creating the completion record, it checks pathway membership and auto-advances.

### 1.6 Profile Integration

**Coach profile "Courses & Training" section:**
- Completed modules and pathways with dates
- Quiz scores for quiz modules
- Mandatory pathway completions shown as "certifications"
- Link to full training portal

**Admin/ops view of coach profile:** Same data + progress on incomplete assignments.

**Server action:** `getCoachTrainingProfile(coachId)` — completed modules, pathways, in-progress assignments

---

## Sub-project 2: LMS Roster Integration & Analytics

### 2.1 Soft-Gate Roster Warnings

When assigning a coach to a session, check:
- Incomplete mandatory training modules → amber warning
- Session sport matches `required_for_sports` on incomplete modules → amber warning

Warnings are dismissible. Dismissal logged to activity_log.

**Implementation:** `checkTrainingCompliance(coachId, sport?)` server action returns array of warning objects. Called from session assignment UI and smart scheduler.

### 2.2 Smart Scheduler Integration

In the scoring function, add penalties:
- -2 if coach has incomplete mandatory modules
- -1 if missing sport-specific training for this session's sport

### 2.3 Training Compliance Widget (Ops Command Centre)

Widget showing coaches with: overdue assignments, incomplete mandatory modules, sport-specific gaps for upcoming sessions. "Send Reminder" action pushes notification.

### 2.4 Training Analytics Page

**Page:** `admin/training/analytics/page.tsx`

- Summary cards: total modules, total assignments, completion rate, avg quiz score
- Completion by module table: assigned/completed/rate/avg time/avg score
- Completion by coach table: assigned/completed/overdue/progress
- Pathway analytics: per-pathway completion rate and avg time
- Charts (recharts): completion rate trend, quiz score distribution

**Server actions:** `getTrainingAnalytics()` — aggregates across completions, assignments, modules

### 2.5 Overdue Training Cron

**Route:** `api/cron/training-overdue/route.ts`
- Daily check: assignments past due_date not completed → status "overdue"
- Send IMPORTANT notification to coach
- After 7 days overdue: create Kanban task for ops

**Vercel cron:** daily at 06:00 UTC (16:00 AEST)

### 2.6 Certificate Generation

When coach completes a mandatory pathway:
- Generate PDF via React-PDF: BAK branding, "Certificate of Completion", coach name, pathway name, date
- Upload to Supabase Storage
- Link from coach profile
- Coach can download from training portal

---

## Sub-project 3: Centre Onboarding Wizard

### 3.1 Database

- `centre_onboarding_checklists` — id, centre_id (unique FK), status (in_progress/completed/stalled), started_at, completed_at
- `centre_onboarding_steps` — id, checklist_id FK, step_number (1-10), step_name, step_type (manual/auto_email/auto_triggered), status (pending/in_progress/completed/skipped), completed_at, completed_by, notes
- `centre_onboarding_emails` — id, checklist_id FK, step_number, email_type, sent_to, sent_at, opened_at

### 3.2 Onboarding Trigger

When centre created with contract_status active/trial:
1. Create checklist + 10 step records
2. Auto-trigger step 3 (welcome email) immediately
3. Schedule step 4 (child list request) for 2 days later
4. Notify ops: "New centre onboarding started: [Centre Name]"

### 3.3 Checklist UI

Banner on centre detail page (while in_progress):
- Progress bar, "X of 10 steps complete"
- Expandable step list with status, action buttons, notes
- Manual steps: "Complete" button + notes. Auto steps: "Sent" indicator.
- "Skip" action with reason

### 3.4 The 10 Steps

1. Complete centre profile (manual)
2. Upload centre logo (manual, optional)
3. Send welcome email (auto — immediate)
4. Request child list (auto — 2 days after welcome)
5. Import child list (manual — links to CSV import)
6. Invite to client portal (manual/auto — magic link)
7. Schedule first session (manual — links to roster)
8. Assign coach (manual/AI — smart scheduler)
9. First session prep email (auto — 2 days before first session)
10. Post first-session follow-up (auto — 1 day after first session)

### 3.5 Email Templates (Resend)

5 branded email templates: welcome, child list request, portal invitation, first session prep, post-session follow-up. Each with BAK branding, personalised content, and appropriate CTAs.

### 3.6 Scheduling Cron

**Route:** `api/cron/onboarding-emails/route.ts`
- Daily check for pending auto steps that are due
- Send emails, create email records, update step status

### 3.7 Ops Widget

"Centres in Onboarding" widget: active checklists, progress %, days since start. Highlight stalled (< 50% after 7 days).

### 3.8 Completion

All steps done/skipped → status "completed". If < 50% after 14 days → auto-create Kanban task.

---

## Sub-project 4: AI Coach Assistant

### 4.1 Database

- `ai_assistant_conversations` — id, coach_id FK, session_id FK (nullable), messages_json (jsonb), created_at, updated_at
- `ai_assistant_cache` — id, cache_key (unique), response (text), created_at, expires_at

### 4.2 Chat UI

**Component:** `components/ai-assistant/assistant-chat.tsx`

- Floating action button: fixed bottom-right, orange circle, Sparkles icon
- Mobile: slide-up panel (80% height). Desktop: side panel (400px)
- Quick-prompt buttons (horizontally scrollable): context-aware based on active session
- Chat bubbles: user (right, orange), assistant (left, grey)
- Input: text + send button
- Rate limit display: "X questions remaining today"
- Loading: typing indicator

### 4.3 Context Assembly

**Function:** `lib/ai/assistant-context.ts` → `buildAssistantContext(coachId)`

If active/upcoming session (within 1 hour):
- Pulls: sport, age group, duration, centre, group size, program, equipment
- Builds context string

If no session: generic context.

### 4.4 API Route

**Route:** `api/ai-assistant/chat/route.ts` (POST)

- System prompt: expert children's sports coaching assistant, Australian English, concise actionable responses
- Includes conversation history (last 10 messages)
- Model: claude-sonnet-4-20250514, max_tokens: 800, temperature: 0.7
- Rate limit: 20 calls/coach/day (tracked in database)

### 4.5 Quick Prompts

6 during-session prompts + 4 before/after + "Ask Anything". Each maps to a pre-written contextual message.

### 4.6 Caching

Cache key: `{sport}_{age_group}_{prompt_type}` (quick prompts only). TTL: 7 days. Check before API call.

### 4.7 Conversation Management

Tied to session if active, standalone otherwise. Persist 24 hours. New conversation each day.

### 4.8 Offline Handling

Show message with link to program plan.

### 4.9 Usage Analytics

**Page:** `admin/ai-assistant/page.tsx` — questions/day, common prompts, response times.
