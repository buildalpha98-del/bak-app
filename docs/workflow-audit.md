# Workflow + Automation Audit

_Generated 2026-06-23. Audits every scheduled task, event-triggered cascade,
AI integration, and notification path across the Build Alpha Kids platform.
Use the **Punch list** at the bottom as your fix queue._

## Status legend

- ✅ Wired and healthy
- ⚠️ Wired but suspicious (silent fail, no idempotency, missing rate limit)
- ❌ Broken (won't fire / will error)
- 🔲 Spec'd but not yet built

---

## 1. Scheduled tasks (18 Vercel crons)

All crons live in `app/api/cron/*` and are scheduled via `vercel.json`. All
use `CRON_SECRET` bearer auth. No Supabase Edge Functions, no pg_cron — all
time-triggered logic flows through Vercel.

| Cron route | Schedule | Purpose | Status |
|---|---|---|---|
| `/api/cron/daily-digest` | 8 PM daily | Group unread notifications per user, send digest email | ✅ |
| `/api/cron/overdue-tasks` | 9 PM daily | Find overdue tasks, notify assignees | ⚠️ fire-and-forget |
| `/api/cron/compliance-expiry-tasks` | 9 PM daily | Auto-create renewal tasks for certs expiring ≤30d | ✅ |
| `/api/cron/performance-snapshot` | 1st of month 10 PM | Calculate monthly metrics + award badges | ✅ |
| `/api/cron/onboarding-emails` | Every 2 hrs | Send queued onboarding step + lifecycle emails | ✅ |
| `/api/cron/training-overdue` | 7 AM daily | Notify coaches of overdue training | ⚠️ fire-and-forget |
| `/api/cron/waitlist-expiry` | Hourly | Mark expired waitlist offers, re-offer next person | ⚠️ swallowed errors |
| `/api/cron/booking-reminder` | 8 AM daily | Find tomorrow's bookings, email + notify | ⚠️ silent on auth lookup fail |
| `/api/public/refresh-stats` | 5 AM daily | Refresh `public_stats_cache` for marketing site | ✅ |
| `/api/cron/reengagement` | 6 AM daily | Trigger re-engagement campaigns for dormant centres | 🔲 errors fully swallowed |
| `/api/cron/churn-risk` | 6 AM daily | Snapshot risk per active/trial centre, alert on critical | ⚠️ dynamic imports |
| `/api/cron/demo-reminders` | 8 PM daily | Notify coaches of tomorrow's demos | ⚠️ fire-and-forget |
| `/api/cron/lead-followups` | 9 PM daily | Notify owners of due/overdue lead follow-ups | ⚠️ fire-and-forget |
| `/api/cron/payment-batch-monday` | Mon 7 PM | Create fortnightly payment batch | ⚠️ **timezone bug** |
| `/api/cron/child-insights` | Sun 10 PM | Batch-generate term-end AI insights | ⚠️ **no idempotency** |
| `/api/cron/invoice-reminders` | 7 AM daily | 3-tier overdue invoice escalation | ✅ |
| `/api/cron/session-reminders` | 7 AM daily | 24h parent + coach reminders for tomorrow's sessions | ⚠️ silent on null lookups |
| `/api/crm/sequences/process` | Every 6 hrs | Process scheduled CRM email-sequence sends | ❌ **POST vs GET** |

**Note**: CLAUDE.md mentions 11 crons, but there are actually **18 live**.
Update CLAUDE.md or trim the obsolete ones.

---

## 2. AI features (7 Claude integrations)

All use `claude-sonnet-4-20250514`. Cost ceilings vary wildly — see column 4.

| Feature | Trigger | File | Rate / cache | Status |
|---|---|---|---|---|
| Skill rating templates | "Generate skills" button on `/admin/programs` | `lib/ai/generate-skills.ts:77` | None / none | ⚠️ unbounded cost |
| Program generator | New program in `/admin/programs` or `/ops/programs` | `lib/ai/generate-program.ts:167` | None / none | ⚠️ unbounded cost |
| Child insight (on-demand) | "Generate insight" button | `app/api/insights/generate/route.ts:222` | 20/min per user / none | ✅ |
| Child insight (cron) | Sunday batch | `app/api/cron/child-insights/route.ts:251` | 50/run / none | ⚠️ duplication risk |
| Coach AI assistant | Chat in `/coach/assistant` | `app/api/ai-assistant/route.ts:132` | 20/day per coach / 7d cache | ✅ |
| Sales proposal | "Generate proposal" in `/admin/crm` | `app/api/proposals/generate/route.ts:120` | 10/min per user / none | ✅ |
| Session reflection prompt | View completed session | `lib/client/curriculum-actions.ts:119` | None / `programs.content_json` reuse | ✅ |

---

## 3. Database triggers + RPCs

| Object | Type | Purpose |
|---|---|---|
| `sessions_resolve_pay_rate` (mig 008) | BEFORE INSERT/UPDATE trigger | Auto-fills `pay_rate_resolved` from session override → type rate → coach default. Powers all payroll calcs. |
| `session_coaches_sync_primary` (mig 048) | AFTER INSERT/UPDATE/DELETE trigger | Keeps `sessions.coach_id` in sync with the join table; flips status → `needs_replacement` when last coach removed. Enforced by CI guard. |
| `set_session_coaches(session_id, coaches, by)` (mig 048) | RPC | Single write path for multi-coach assignment. The only function that should ever touch `session_coaches`. |
| `nextval_invoice_number()` (mig 042) | SQL function | Atomic per-month invoice number sequence. Format: `INV-YYYYMM-NNNN`. |
| 20+ `*_updated_at` triggers | BEFORE UPDATE | Auto-timestamps for all major tables. |

---

## 4. Event-triggered cascades

35 cascades documented. Grouped by domain. Each entry includes trigger,
code path, side effects, and failure mode.

### CRM & Leads

- **Lead stage change → task auto-created** (`lib/crm/task-automation.ts:11`)
  Independent try/catch per side effect; stage change persists even if task creation errors.
- **Won lead → centre + ops task + activity** (`lib/crm/conversion-actions.ts:13`)
  Creates centre, welcome task, activity log; ops notification is fire-and-forget.
- **Proposal stale 3+ days → follow-up task** (cron) — idempotent (checks for existing task).
- **Trial ending in 3 days → conversion prep task** (cron) — idempotent.

### Parent bookings

- **Package booking** (`lib/bookings/booking-actions.ts:121`) — decrements package balance → creates booking → increments session capacity → email + notification (fire-and-forget).
- **Pay-per-use booking** — creates `pending_payment` booking; no side effects until paid.
- **Payment confirmed** (`lib/bookings/booking-actions.ts:265`) — receipt email is awaited (critical); confirmation email is fire-and-forget.
- **Cancellation** (`lib/bookings/booking-actions.ts:349`) — if eligible: restore package, decrement capacity, run waitlist, send cancellation email + notification.
- **Waitlist offer** (`lib/bookings/actions.ts:449`) — sends offer email + 24h-TTL notification to next parent.

### Sessions & Rostering

- **Coach cancels session** (`lib/rerostering/actions.ts:15`) — clears coach via `setSessionCoaches` (trigger flips status to `needs_replacement`), generates replacement suggestions, creates rerostering event, notifies ops + logs activity.
- **Send replacement offer** (`lib/rerostering/actions.ts:114`) — 30-min TTL urgent notification to candidate coach.
- **Coach accepts** (`lib/rerostering/actions.ts:195`) — cert check (blocking), attach coach, confirm session, notify ops + original coach.
- **Coach declines** — marks event declined, notifies ops.

### Children & Insights

- **Assessment submitted** — AI insights generated async; parent + centre notified.
- **Child term ends** — term report generated, email + notification to parent + centre.

### Compliance & Training

- **Cert expiring ≤30d** (cron) — auto-creates renewal task per coach (idempotent).
- **Staff created** — onboarding modules auto-assigned via `autoAssignOnboarding`; first onboarding email queued (fire-and-forget).
- **Mandatory module flagged** — bulk-assigned to all current coaches.

### Invoicing

- **Centre invoice created** (`lib/launch/invoice-actions.ts:33`) — calculates totals, generates number via RPC, inserts invoice + line items, generates PDF, uploads, updates path. PDF failure doesn't rollback (**partial state risk**).
- **Director notified** (`lib/launch/invoice-actions.ts:442`) — email + in-app notification + activity log (each fire-and-forget).
- **Payment received** — atomic update + activity log.

### Churn & Health

- **Daily churn calc** (cron) — snapshots per centre, flips `centres.churn_risk`, creates alert task if critical.
- **Health score drops below threshold** — chains into churn recalc.

### Referrals & Rewards

- **Conversion logged** (`lib/referrals/actions.ts:488`) — bumps total, inserts instant reward, checks milestone, awards milestone reward if hit (idempotent).
- **Milestone reached (e.g. 5 conversions)** — milestone reward record + status=awarded.

### Feedback

- **Submission** — feedback row + notifications to coach + admin (fire-and-forget).
- **Low rating** — auto-creates review task.

### Reminders

- **Session reminder (24h before)** (cron) — email parent + in-app notify coach. Per-recipient independent.
- **Booking pending >24h** (cron) — reminder email (fire-and-forget).

### Onboarding & Re-engagement

- **Centre created (from won lead)** — seeds onboarding steps + queues first email (atomic).
- **Onboarding email queued → cron sends** — only marks sent if Resend succeeds (**retry-safe**).
- **Dormant centre (30+ days no sessions)** (cron) — queues re-engagement email sequence.

### Tasks & Performance

- **Overdue task** (cron) — escalation task to manager.
- **Month-end performance snapshot** (cron) — calc metrics, award badges, email coaches.

### Intelligence

- **Term-end batch insight generation** (cron) — AI insights for eligible children, notify parents + centres, log activity.

---

## 5. Punch list (ranked by impact)

Critical bugs first. Severity rubric: **P0** ships-breaking · **P1** silent-failure-in-prod · **P2** edge case / cost risk · **P3** tidy-up.

### P0 — Ships broken right now

**1. CRM email sequences never fire** ❌
`app/api/crm/sequences/process/route.ts:16` exports `POST` but `vercel.json` schedules a GET. Vercel cron sends GET → 404 → sequences silently never advance.

Fix: change `export async function POST` to `GET`. 1-line.

### P1 — Silent failures in prod

**2. Notifications fire-and-forget in 6 crons** ⚠️
`overdue-tasks`, `training-overdue`, `demo-reminders`, `lead-followups`, `waitlist-expiry`, `booking-reminder` all call notification helpers without try/catch. If Supabase has a hiccup, notifications drop and you never know.

Fix: wrap each `triggerNotification` / `createNotification` call, count failures, return summary in the cron response. ~30 lines across 6 files.

**3. Child insights cron has no idempotency** ⚠️
`app/api/cron/child-insights/route.ts:268-275` inserts `child_insights` rows without dedup. If you re-run a missed cron (or back-fill a term), parents see duplicate cards.

Fix: add `UNIQUE (child_id, term_id, insight_type)` constraint on `child_insights`, switch insert to UPSERT. 1 migration + 5 lines.

**4. Payment-batch Monday check uses local time** ⚠️
`app/api/cron/payment-batch-monday/route.ts:19` uses `today.getDay()` which is server-local. Vercel functions run UTC by default — `bom1` (Mumbai) is UTC+5:30. Could miss Monday entirely depending on schedule time.

Fix: use explicit Sydney timezone (`Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short" })`) for the Monday check. ~5 lines.

**5. Re-engagement cron swallows all errors** 🔲
`app/api/cron/reengagement/route.ts:1-18` calls `processReengagement()` and returns generic "Processing failed" on any error. You can't tell if the cron silently did nothing or actually ran.

Fix: surface structured result + log specific errors. ~20 lines.

### P2 — Cost risk / cleanup

**6. Skill template + program AI generators have no rate limit or cache** ⚠️
`lib/ai/generate-skills.ts` and `lib/ai/generate-program.ts` have neither. A bored admin clicking generate 50 times = ~$10 burned. Lower risk than child insights cron (which is bounded) but worth fixing.

Fix: add per-user 5/hour limit + 24h cache keyed on (sport, age_group). ~40 lines.

**7. CLAUDE.md says 11 crons; there are 18** 📝
Update the cron list in CLAUDE.md so future sessions don't miss any.

**8. Booking + invoice + centre creation have partial-state risk** ⚠️
If PDF generation, email send, or notification insert fails midway, the parent record (booking, invoice, centre) is created but the user never knows. Not a P1 because each side effect is logged, but a "ops dashboard noticed dropped notifications" feature would catch these proactively.

Fix (longer-term): add an `outbox` table — write the side-effect intent atomically with the primary record, then a worker drains it. Standard outbox pattern. Defer until you've actually seen the issue in prod.

### P3 — Nice to have

**9. Session-reminders cron uses `.select().single()` without null checks**
`app/api/cron/session-reminders/route.ts:87-104` silently skips if any centre/child/parent lookup returns null. Use `.maybeSingle()` and log explicitly.

**10. Booking reminder doesn't check `auth.admin.getUserById` result**
`app/api/cron/booking-reminder/route.ts:89-90` — wrap and log.

---

## 6. What this audit doesn't cover (yet)

- **Vercel cron success rates in prod**. The audit reads code only. To know
  what actually runs and how often it fails, check the Vercel Functions
  dashboard → individual cron route → "Logs" tab over the last 7 days.
- **Supabase Realtime channels**. The app uses Realtime for some live
  updates but the channels aren't mapped here — out of scope.
- **Email delivery rates**. Resend dashboard shows opens, bounces, complaints.
  Worth a separate check after the deliverability work lands.
- **Webhook receivers** (Square payment callbacks, Twilio status callbacks).
  These are reactive, not scheduled, but they're a different audit.
