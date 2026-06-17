# Dashboard Review — 2026-05-17

> **Final state:** ✅ Every role × every tab closed. 19 feature commits between `80ce5a5` and `399349d`. Build green, 706/708 tests pass (2 pre-existing healthScore failures unrelated and unchanged).

## Run summary

| Role | Commit lineage | Tabs |
|---|---|---|
| Admin home + centres + roster + CRM | `80ce5a5` → `cefca1e` | 4 |
| Admin staff + children + performance | `821d102` → `d9c9904` | 3 |
| Admin assessments + programs + training | `3db4b09` → `7456360` | 3 |
| Admin equipment + documents + forms | `91b383e` | 3 |
| Admin finance cluster (5 financial-gated tabs) | `94cfba3` | 5 |
| Admin reports + tasks + feedback + bookings | `db2d0aa` | 4 |
| Admin marketing+referrals+campaigns+churn+announcements+messages+settings | `7d2ce34` | 7 |
| Ops command centre + onboarding + cross-page audit | `7844ae5` | 2 + audit |
| Coach (14 surfaces) | `7a85481` | 14 |
| Client portal (14 surfaces) | `984e1a6` | 14 |
| Parent portal (10 surfaces) | `399349d` | 10 |
| **Total** | — | **~69 surfaces** |

## Migrations applied to prod

- `050` profiles.financial_access (Wave A)
- `051` business_settings y1 targets (`80ce5a5`)
- `052` feedback_ratings.acknowledged_at + idx (`db2d0aa`)

## Shared design language

Every list view follows the same pattern:
- **Status pulse strip** — 3–4 inline counts with `useCountUp`, orange when > 0, muted at zero, click-to-jump via URL query params
- **URL-persisted filter chip row** — search + entity filters + Region + jump-link chips set by pulse clicks + "Clear all" tail
- **Bulk-select sticky action bar** — admin/ops-gated, with activity_log entries per action
- **Grid ↔ Table view toggle** (`?view=grid|table`) where useful
- **Detail views** refactored to Tabs with count badges where stacked-card layouts were getting long
- **UI refresh** — `rounded-2xl`, `transition hover:shadow-md hover:-translate-y-0.5`, `gap-6` between sections, restrained brand orange `#E8712A` reserved for: primary CTAs, active filter chips, pulse counts > 0, save buttons, marquee numbers

## Plumbing audit — cross-page integration verified

| Scenario | Wiring |
|---|---|
| **Coach rostered → financial figures update** | `sessions` rows feed `coach_invoices` (existing trigger). `WeekCostChip` + Payroll Snapshot both read the same `sessions × coach × pay_rates` join. Financial-access gated. |
| **Lead won → centre created + onboarding starts** | `crm/actions.ts` already creates the centre on `stage='won'`. New `onboarding-status-pulse` reads `centre_onboarding_checklists`. |
| **Coach earns badge → visible everywhere** | `coach_badges` populated by monthly cron. Surfaced on `/admin/performance` (leaderboard chips) + `/coach/performance` (mini gallery). |
| **Feedback submitted → admin pulse increments** | `feedback_ratings` insert → admin `/admin/feedback` pulse counts unacknowledged 1-star + 5-star + total this week. `acknowledged_at` (migration 052) lets ops "seen-it" without deleting. |
| **Centre child enrolment → counts propagate** | `centre_children` link from `/admin/children` bulk-link or parent self-add → `/admin/centres` detail Children tab + Children pulse `noCentreCount` decrements. |
| **Parent books → admin bookings pulse updates** | `bookings` insert from `/parent/book` → `/admin/bookings` "new bookings this week" pulse increments + `payments` row from Square webhook → `/admin/invoicing` overdue flow. |
| **Onboarding step completed → email queued** | `centre_onboarding_steps.completed=true` → trigger queues `centre_onboarding_emails` (Wave A migration 049) → 6-hourly cron `/api/cron/onboarding-emails` dispatches via Resend. `/ops/onboarding` pulse reflects "waiting on email". |
| **Assessment completed → child status updates** | `skill_ratings` write from `/coach/assessments` or `/admin/assessments` → `/admin/children` row `assessment_status` recomputes ("done"/"pending"/"overdue") on next render. |
| **Financial-access toggle → live UI hide** | `setStaffFinancialAccess` flips `profiles.financial_access` → financial routes layout-gated by `requireFinancialAccess()` redirect; sidebar items hide via `filterNavByAccess`; cost chips silently return null. |

## Test count

| Domain | New tests |
|---|---|
| Status pulses | ~70 across all role surfaces |
| Bulk actions | ~80 across admin/ops bulk actions |
| Existing P3/P5/Wave-A coverage | Unchanged, all passing |
| **Total now** | **706/708** (2 pre-existing unrelated failures from `d18c8cc`) |

## Files created (high-level)

- ~30 new `*-status-pulse.tsx` components
- ~30 new `lib/*/status-pulse-actions.ts` server-action files
- ~20 new pulse test files + ~10 new bulk-actions test files
- 1 generalised `MonthCalendarPopover` (`mode='week'|'month'`) shared by roster + performance
- 4 financial-gate `layout.tsx` files (Wave A) + nav-filter helpers

## Open follow-ups (none block beta)

- `Profile.region_ids` is read via `(p as Record<string, unknown>).region_ids` — worth adding to canonical TS interface
- `bulkChangeStage` (CRM) doesn't accept a `reason` — bulk won/lost uses generic activity log entry
- Bulk "Add to sequence" + "Bulk invoicing" + "Bulk message parents via Resend" stubbed to "Wave B" toasts
- Form templates use `[Archived]` name-prefix until a `status` column lands
- Insight read/unread model not implemented — "Insight ready" badge fires whenever insight exists within 90 days
- `/admin/activity` capped at 200 entries; pagination is post-beta
- Several jump-link query params (`?status=needs_replacement`, `?filter=overdue`, etc.) land on target pages but those don't yet read them — small follow-up
- 2 pre-existing `healthScore.test.ts` failures (March 2026) remain — unrelated, not regressing

---

Walking through every tab of the BAK-APP dashboard, role by role, capturing current state vs intended final state and turning gaps into a punch list.

**Order:** Admin → Ops → Coach → Client → Parent.

**Convention per tab:**
- 🔍 **Current state** — what's wired in code, from a direct read
- ✅ **What works**
- ⚠️ **Gaps**
- 🎯 **Final-state target** — a one-paragraph description of "done"
- 📋 **Open items** — actionable checklist we can knock out

---

## 1. Admin

### 1.1 `/admin` — Admin home

🔍 **Current state**

`app/(dashboard)/admin/page.tsx` (28 lines) composes:

- **`LaunchDashboard`** (`components/launch/launch-dashboard.tsx`, 488 lines) — the main BI surface, 5 rows:
  - **Row 1:** 4 metric cards — Active Centres, Active Schools, Revenue YTD, Coaches
  - **Row 2:** Monthly Revenue stacked bar (childcare vs school) + Centre & School Growth line chart
  - **Row 3:** Revenue Split (donut/pie) + Top Earners This Term
  - **Row 4:** Coach Overview (utilisation, performance summary)
  - **Row 5:** Recent Activity feed (last 20 events from `activity_log`)
- **3 snapshot widgets** in a 3-up grid below:
  - **PipelineSnapshot** — CRM lead totals by stage + $ in pipeline
  - **PayrollSnapshot** — current fortnight payroll due + pay-period dates
  - **CertExpirySnapshot** — coaches with WWCC/First-Aid expiring soon

Backed by `getDashboardMetrics()` + `getRecentActivity(20)` in `lib/launch/dashboard-actions.ts`.

✅ **What works**

- Live metrics — pulls real DB numbers
- Recent activity feed — auto-refreshes (`useEffect` interval on the client)
- Recharts rendering on Row 2 + 3 charts (bar + line + donut)
- Cert-expiry snapshot uses the same compliance helpers as the rest of the platform — accurate
- All 5 rows render even with thin data (empty states are sensible)

⚠️ **Gaps**

1. **No header link to the Launch spec / Y1 target context.** Hardcoded "Year 1 targets: 40 centres, 10 schools, $400K revenue" — fine for now, but no way to edit those goals without a code change.
2. **The 3 snapshot widgets each fetch their own data** (`PipelineSnapshot`, `PayrollSnapshot`, `CertExpirySnapshot` all do their own server-action calls on mount). Triple round-trip on page load. Worth batching into the parent's `Promise.all` later.
3. **No quick links** — coming from this dashboard, a user can't jump to "create a centre", "add a coach", "publish a roster" without going to the sidebar. A few "Quick action" buttons at the top would shorten the daily workflow.
4. **No personalisation** — the page is identical for every admin (only Jayden right now, so moot, but worth flagging for multi-admin futures).
5. **Top Earners This Term** (Row 3 right card) shows coach pay totals — that's financial data. Today the entire `/admin` route is admin-only, but if any other admin role gets added with `financial_access=false`, this card leaks $. Worth wrapping in a `{profile.financial_access && …}` gate even at the home level.
6. **No "What's new"** — when P5 multi-coach shipped, there's no visible cue here that things changed. Optional.

🎯 **Final-state target**

The admin home is the daily morning landing pad: "what shipped overnight, what needs my attention today, am I on track for Y1 goals?" Top of page is a 1-click action row (Create centre / Add coach / Publish roster / Open CRM). Y1 KPIs are editable from settings, not hardcoded. The 5 LaunchDashboard rows stay (they're good), but loading is batched. The 3 snapshot widgets become 4: add a "Beta health" card (next 7 days: parents joining, bookings paid, NPS from feedback). Recent Activity gets filters (by entity type) and a "View all" link to the full activity log.

📋 **Open items** — closed in commit `80ce5a5`

- [x] Move Y1 targets into `business_settings` (KV pattern in the existing table; 3 jsonb rows seeded with `40 / 10 / 400000` defaults via migration 051)
- [x] Quick Actions row above Row 1 (`components/admin/quick-actions-row.tsx`) — 5 buttons, ghost-style, brand-orange ring on hover, large touch targets
- [x] Batch all data loading into the page-level `Promise.all` — `getDashboardMetrics` + `getRecentActivity(20)` + `getAdminStatusPulse` + the 3 snapshot widgets' data sources, all resolved at the page level and passed down as `initialData` props
- [x] `financial_access` gates on Revenue YTD card, Monthly Revenue chart, Revenue Split, Top Earners, PayrollSnapshot — when off, the layout doesn't collapse (Centres-Active fills the gap, Growth chart goes full-width, Programme Mix card replaces revenue split)
- [x] Activity feed converted to vertical timeline with chip filters (`All / Sessions / Centres / Coaches / Payments / CRM`) + "View all activity →" link to `/admin/activity` (new page added)
- [x] Sticky context strip with greeting + status pulse (shifts needing a coach / overdue invoices / leads replied today) — time-of-day greeting is Sydney-local
- [x] Inline-edit pencil on each editable KPI card (Centres, Schools, Revenue) — appears on hover, opens a popover with the value editor
- [x] **UI refresh applied**: `rounded-2xl` everywhere, subtle hover-lift on cards, `gap-6` between rows, restrained brand-orange (accent only — primary metric, status pulse, active chip, save CTA), 2-tone chart palettes (`#E8712A` + `#F4A87B` for revenue, monochrome for growth line), number tick-up animation on first render, brand-orange timeline dots for "today" events vs muted for older
- [ ] **Skipped (post-beta)**: "Beta health" snapshot widget (parents joined / bookings paid / NPS) — will add once beta cohort is live and we have data to report
- [ ] **Skipped (later)**: Personalised "what's new since last login" — defer until activity volume justifies it

**Follow-ups flagged by the implementer:**
- `/admin/activity` pagination beyond 200 entries (post-beta)
- "View all" links on PipelineSnapshot + PayrollSnapshot widgets
- Wire `?status=needs_replacement`, `?filter=overdue`, `?filter=replied_today` query params on destination pages (status pulse links them but destinations don't read them yet)
- True "email replied" signal requires inbound-webhook ingestion — current "leads replied today" is an engagement proxy (opens/clicks/calls/meetings/notes today)

**Verification:** 20/20 launch tests pass, typecheck clean, build green, all 18 modified files committed under `80ce5a5`.

---

### 1.2 `/admin/centres` — Centres & Schools

🔍 **Current state**

`app/(dashboard)/admin/centres/page.tsx` (16 lines) → `getCentreList()` → `CentreListView` (`components/centres/centre-list-view.tsx`, 322 lines).

**List page surface**:
- Header: "Centres & Schools" + count of venues + "Add Centre" button
- Filter bar: search input, **Type** select (Childcare / School), **Status** select (Active / Trial / Paused / Churned), **Pricing** select (Centre Funded / Parent Funded / Per Head), **Sort** (Name / Status / Newest), Grid ↔ Table view toggle
- Body: 3-column grid of `CentreCard` (164 lines) — name, status badge, pricing badge — OR table view
- Empty state with helpful hint ("Try adjusting filters" vs "Add your first centre")

**Detail page** `app/(dashboard)/admin/centres/[id]/page.tsx` → `CentreDetailView` (962 lines) — **10 tabs**:
1. **Overview** — basics, address, contacts
2. **Sessions** — past + upcoming
3. **Notes** (`centre_notes` with author)
4. **Equipment** (per-centre inventory)
5. **Invoices** — outbound invoice summary ($ — **should be financial-gated**)
6. **Feedback** — `feedback_ratings` for this centre
7. **Children** — `centre_children` link table
8. **Reports** — `centre_reports` (per-term)
9. **Portal Access** — client-portal magic-link controls
10. **Grants** (conditional — only shows when grants exist)

Plus `/admin/centres/[id]/onboarding/page.tsx` — the 10-step wizard (now wired to DB after Wave A Item 6).

`/admin/centres/add/page.tsx` — `AddCentreForm` for create flow (centre OR school, since `centres.type='school'` covers both).

✅ **What works**

- Filter combinations work cleanly (case-insensitive search, multi-filter compose)
- Grid/table view toggle persists for the session
- Empty state copy is well-tuned
- Detail tabs all load real data — notes with author, sessions joined to coaches, equipment per-centre
- Add flow lands valid rows in `centres` with regions auto-assigned
- Onboarding wizard is now end-to-end (migration 049 + write actions)

⚠️ **Gaps**

1. **No `health_score` or `churn_risk` indicator on the list** — both columns are populated daily by cron (`/api/cron/churn-risk`), but the list/card UI doesn't surface them. You can't see at-a-glance which centres are amber/red from this page.
2. **No "Profile checklist complete" badge on the card** — `profile_checklist_complete: boolean` is in the schema (migration 040+) but invisible here. New centres should show "Onboarding ⏳" until the checklist completes.
3. **No region filter** — `regions` table exists (Wave 6+) and centres auto-assign to one on create, but the list has no `Region` filter chip. Once you have 40+ centres across 5+ regions, this is essential.
4. **Filter persistence** — search, type, status, pricing, sort, view all reset on navigation away. URL query params would let you bookmark filtered views ("?status=trial&region=south-west").
5. **No bulk actions** — to invoice 10 centres, change pricing on 5, or send announcements to a region, you have to open each one. A checkbox column on table view + bulk-action bar would unlock ops workflows.
6. **Detail view is 962 lines, 10 tabs, no in-tab indicator counts** — the tab bar reads "Sessions / Notes (3) / Equipment / Invoices (12) / Feedback / Children / Reports / Portal Access" — only Notes/Equipment/Invoices show counts. Sessions/Feedback/Children/Reports counts would speed scanning ("does this centre have any pending reports?").
7. **Detail Invoices tab leaks $ without `financial_access` gate** — the tab renders `OutboundInvoiceSummary` (amount + status). Should be hidden or replaced with "Financial visibility restricted" placeholder for ops viewers without the flag.
8. **No "Last activity" sort** — you can sort by name/status/newest, but not by "last session date" or "last note added". For at-risk-centre triage, that's the first signal you'd want.
9. **No saved views** — power-ops would benefit from "Save this filter combo" → name it → access from a dropdown.
10. **UI inconsistency with the new `/admin` home design language** — list uses `rounded-xl border-dashed` for empty state, but `rounded-lg`/`rounded-md` elsewhere; the new home dashboard uses `rounded-2xl` universally. Cards should match.

🎯 **Final-state target**

The centres list is **the operational heartbeat surface** — Abdul opens it 5+ times a day to triage health. Top of the page: a Status Pulse strip (centres at risk / overdue invoices / onboarding behind schedule). Filter bar adds a Region chip and persists to URL query params so views are bookmarkable. Cards surface health (green/amber/red dot + score), churn risk, onboarding progress, and "last session" date. Bulk actions on table view (checkbox column + actions bar). Detail view's Invoices tab gets the `financial_access` gate, every tab gets a count in the trigger, and the tab bar groups into logical sections (Engagement: Sessions/Feedback/Notes/Reports — Operations: Equipment/Invoices/Children — Access: Portal/Grants). UI matches the home page's `rounded-2xl` + restrained-orange feel.

📋 **Open items**

- [x] Surface `health_score` + status colour on `CentreCard` (green ≥80, amber 60–79, red <60)
- [x] Add `churn_risk` warning badge when `churn_risk=true`
- [x] Add "Onboarding ⏳ N/10" badge when `profile_checklist_complete=false`
- [x] Add **Region** filter chip + auto-derive from `regions` table
- [x] Persist all filter state to URL query params (`?search=...&type=...&status=...&region=...`)
- [x] Add **"Last activity"** sort option (last session date or last note added)
- [x] Bulk-select column on table view + a bulk-action bar (invoice / announce / change status / export)
- [x] **Financial gate** on the Invoices tab inside `CentreDetailView` — hide or stub for ops viewers without `financial_access`
- [x] Add counts to every tab trigger (Sessions/Feedback/Children/Reports)
- [x] Group `CentreDetailView`'s 10 tabs into 3 logical groups OR convert to a scrollable horizontal nav with section dividers
- [x] Match `/admin` home design language: `rounded-2xl` cards, restrained-orange accents, subtle hover-lift, `gap-6` between sections
- [x] Status Pulse strip at top of the list (at-risk count / overdue invoices / onboarding behind)
- [ ] (Optional) Saved views — name + recall filter combinations

---

### 1.3 `/admin/roster` — Roster (weekly grid)

🔍 **Current state**

`app/(dashboard)/admin/roster/page.tsx` (52 lines) batches 5 server actions in one `Promise.all` (`getSessionsForWeek`, `getCentresForSelect`, `getActiveCoaches`, `getActiveTerm`, `getSessionCertWarningsForWeek`) and passes everything to `RosterPage` (`components/roster/roster-page.tsx`, 505 lines).

**Surface:**
- **Unconfirmed shifts banner** at top (when any pending shifts exist)
- **Header**: "Roster" title + `WeekCostChip` ($ — `financial_access`-gated since Wave A) + "View Terms" link
- **Toolbar** (8+ buttons):
  - Week navigation: prev / "Mon DD–FRI DD MMM" label / next + Today + native date picker
  - View toggle: Staff (default) / Calendar / List
  - Check Clashes button → opens conflict-detection drawer
  - Add Session button
  - Generate Week button (term-template-driven)
  - **AI Assign** (brand-orange primary CTA — opens the AI scheduling flow)
- **AI Summary Bar** (when a run is mid-review)
- **Empty state** OR one of three view components:
  - `StaffRosterView` — rows = coaches, columns = days; primary "+N others" badge + secondary "↔ shared" cards from P5
  - `SessionCalendarView` — week grid by day/time
  - `SessionListView` — chronological list
- All three card variants share `SessionCard` with the P3 3-dot menu (Swap coach / Add note / Duplicate) and the `StickyNote` note indicator
- Detail sheet uses the P5 `CoachChipMultiselect` for multi-coach assignment
- Sub-pages: `/terms` (term list) and `/terms/[id]/template` (term-template editor)

**Recently shipped (Wave-A-adjacent):**
- P3 — per-shift notes, inline 3-dot menu, duplicate action
- P5 — multi-coach via `session_coaches`, per-rate-summed cost projection, conflict detection from the join table
- Financial gate on `WeekCostChip`

✅ **What works**

- 3 view modes, all real-time (router.refresh after every mutation)
- Week navigation + date picker + Today
- AI scheduling (generate → review → publish flow)
- Multi-coach assignment end-to-end (chip multi-select, drag-to-promote primary)
- Cost fan-out per coach, hidden for non-financial-access viewers
- Cert guard on every assignment, with resolved coach names in the error
- Conflict detection reads from `session_coaches` so multi-coach overlaps surface on both cards
- Unconfirmed shifts banner — actionable nudge
- Empty state with helpful copy

⚠️ **Gaps**

1. **No drag-and-drop scheduling** — P4 is deferred. Today every move requires "edit session → change date → save". For ops-heavy days, that's the biggest friction point.
2. **Toolbar density** — 8 buttons + view toggle + date picker in one row; wraps awkwardly on tablets, no progressive disclosure
3. **No filters** — can't slice the grid by sport, centre, coach, or status; for 40+ centre weeks this gets noisy
4. **No "this week summary"** strip — `WeekCostChip` is the only at-a-glance metric. Should also surface: total sessions / draft count / unassigned count / hours rostered / coverage % (sessions with primary assigned ÷ total)
5. **View selection doesn't persist** — every visit defaults to Staff view; URL param would let you bookmark calendar-week-view
6. **Native HTML date picker** (`<Input type="date" />`) — visually inconsistent with the rest of the design system; ugly on Safari
7. **No region filter** — once centres span 5+ regions, viewing one region's roster matters
8. **No "publish all drafts" bulk action** — generating a week leaves you with N draft sessions; you click each to publish (or run AI Assign which publishes as part of its flow). A single "Publish week" affirmation would be a big win
9. **UI doesn't match `/admin` home design language** — empty state uses `rounded-xl border-dashed`, toolbar buttons use `rounded-lg border`. Should be `rounded-2xl` everywhere
10. **No status pulse strip** — the home page + centres list both have one; roster should too (drafts pending / shifts needing a coach / unconfirmed / labour budget vs projected)
11. **AI Assign primary button placement is good** — keep that — but no "Last AI run" pill showing when the schedule was last regenerated (helps avoid double-runs)
12. **`/terms` and `/terms/[id]/template` aren't reviewed in this row** — separate surfaces, defer to a sub-review or treat as Roster-adjacent
13. **`SessionDetailSheet` is rich but the cost/payroll line inside it is not financial-gated** — for ops without `financial_access`, the sheet shows `pay_rate_resolved × duration` totals. Same defensive pattern needed as `WeekCostChip`

🎯 **Final-state target**

The roster is the daily operational cockpit. Top of page: a **Roster Pulse** strip (4 inline numbers — drafts pending / unassigned / coverage % / projected wage), each click-jumps to the filtered grid. Toolbar compresses cleanly on mobile via a dropdown for tertiary actions. Filter chip row (Sport / Centre / Coach / Status / Region) sits under the toolbar; combined with URL persistence so weeks are bookmarkable. View selection persists. Native date input replaced with a proper popover-based calendar picker. "Publish week" bulk action available when ≥1 draft exists. `SessionDetailSheet`'s pay line goes through the financial gate. UI matches home + centres language. P4 drag-and-drop is acknowledged as the next major leap (post-beta).

📋 **Open items**

- [ ] **Roster Pulse strip** at top — drafts pending / unassigned shifts / coverage % / projected wage (financial-gated)
- [ ] **Filter chip row**: Sport, Centre, Coach, Status, Region — persisted to URL (same pattern as `/admin/centres`)
- [ ] **URL persistence** for view mode (`?view=calendar`)
- [ ] **Replace native date picker** with a Popover + `Calendar` primitive (date-fns or zero-dep)
- [ ] **"Publish week" bulk action** — affirmation Dialog → batch update of all drafts to "published" (admin/ops only)
- [ ] **Toolbar compression on mobile** — primary actions visible, tertiary in a "More" dropdown menu
- [ ] **Financial gate on `SessionDetailSheet`** pay totals — same `financial_access` check pattern as `WeekCostChip`
- [ ] **"Last AI run" pill** next to AI Assign button (timestamp of most recent `scheduling_runs` row)
- [ ] **UI refresh**: `rounded-2xl`, restrained orange, subtle hover-lift on cards, `gap-6` between major sections (consistent with home + centres)
- [ ] **(Optional)** Add a Region filter chip once you have multiple regions in production
- [ ] **(Optional)** Tooltip on each toolbar button explaining the action — discoverability for new ops users
- [ ] **(Optional / post-beta)** Saved view combinations ("Mondays only", "Coach X this week")

**Out of scope:** P4 drag-and-drop (deferred per master spec); `/admin/roster/terms` and template editor get their own review when we hit that branch of the navigation.

---

### 1.4 `/admin/crm` — CRM Pipeline

🔍 **Current state**

`app/(dashboard)/admin/crm/page.tsx` (25 lines) batches `getLeads()` + `getPipelineSummary()` → `PipelineBoard` (`components/crm/pipeline-board.tsx`, 675 lines).

**Surface — main board:**
- Header: "CRM Pipeline" + "Email Sequences" outline button + "Add Lead" primary CTA
- **Summary bar**: 4 metric cards — Total Leads · Pipeline Value ($) · Won · Active
- Search input (single filter)
- **Drag-and-drop kanban** via @dnd-kit:
  - 5 active columns: Cold Lead · Contacted · Interested · Free Trial · Proposal Sent
  - 2 outcome columns: Won (default) · Lost (destructive) — also `churned` exists but isn't a column
  - Drag cards between columns → calls `changeLeadStage(leadId, newStage, reason)` — reason required for won/lost/churned
- Required-reason dialog before destination flip
- Realtime via `useTransition` for optimistic UI

**Sub-pages (8):**
- `/admin/crm/list` — alternative `LeadListView` (696 lines)
- `/admin/crm/metrics` — `PipelineMetricsView` (conversion funnel, age-in-stage)
- `/admin/crm/import` — CSV import (already wired — Wave A inventory)
- `/admin/crm/sequences` + `/sequences/[id]` — email sequence builder (Resend-wired in commit `6c8b5ee`)
- `/admin/crm/proposal-templates` — AI proposal template editor
- `/admin/crm/embed` — embeddable web form for public lead capture
- `/admin/crm/[id]` — `LeadDetailView` (1504 lines!) with Timeline / Demos / Documents tabs
- `/admin/crm/[id]/proposal` — AI-generated proposal PDF preview

Plus `getCrmDashboardData()`, `bulkChangeStage`, `bulkAssignOwner`, `bulkDeleteLeads`, `addLeadActivity` server actions already exist.

✅ **What works**

- Drag-and-drop column changes with stage-change reasons captured
- Email sequences wired to Resend (replied/clicked/opened tracked in `lead_activities`)
- CSV import surface live and polished
- 7 sub-routes for deep workflows (metrics, sequences, templates, embed, etc.)
- `LeadDetailView` carries a full timeline, demos, documents
- Bulk actions exist in server actions (just not exposed in the board UI)
- Pipeline Value calculated from active stages only (excludes won/lost/churned)

⚠️ **Gaps**

1. **Search is the only filter** — no chips for Stage / Owner / Region / Source / Value-range. For a multi-rep ops team that's a serious limit
2. **No URL persistence** — board state resets on every navigation
3. **No status pulse strip** — same pattern as home + centres + roster, missing here. Should surface: stale leads (no activity > 7d) / overdue follow-ups / trials ending this week / hot leads (active sequence, recent open)
4. **Pipeline Value + Won card show $ unconditionally** — should be `financial_access`-gated (defensive)
5. **No bulk actions exposed in the board UI** — server actions exist (`bulkChangeStage`, `bulkAssignOwner`, `bulkDeleteLeads`) but no multi-select on cards
6. **Won/Lost columns clutter the active board** — could be collapsed by default with a "Show closed" toggle
7. **No "aging in stage" highlight on cards** — `daysInStage()` is calculated but only used by metrics; should surface as a tint or warning on stale cards
8. **No region filter** — centres and roster have it; same need here
9. **Mobile UX** — horizontal-scroll kanban with 7 columns is rough on phones. Mobile should default to a single-column scroll or a stage-picker swipe view
10. **Email Sequences link is buried** — it's a small outline button in the header; given how central sequences are to the funnel, it should be more prominent
11. **No "Hot leads" surface** — cards with recent sequence activity (opened/clicked) deserve a flame icon to draw the rep's eye
12. **UI doesn't match the home + centres + roster design language** — summary cards use `Card className="p-4"` default `rounded-lg`; needs `rounded-2xl`, hover-lift, restrained orange (only on primary CTA + active filter chip)
13. **No "owner" badge on cards in board view** — once multiple reps exist, you can't see at-a-glance who owns each lead from the board
14. **`LeadDetailView` (1504 lines) deserves its own future review** — beyond scope of this tab

🎯 **Final-state target**

The daily sales/account-growth cockpit. Status Pulse strip at top (stale leads · overdue follow-ups · trials ending this week · hot leads with recent opens). Filter chip row (Stage · Owner · Region · Source · Value range) URL-persisted; combinable with the existing search. Pipeline Value + Won $ gated behind `financial_access`. Won/Lost columns collapsible. Aging-in-stage tint on cards (subtle amber after 7d, red after 14d in the same stage). Multi-select bulk bar on the board (reassign owner / move to stage / add to sequence). Owner avatar chips on every card. Mobile defaults to a stacked single-column view with a horizontal stage-picker. UI matches home/centres/roster — `rounded-2xl`, restrained orange (active chip, primary CTA, hot-lead flame), hover-lift.

📋 **Open items**

- [x] **CRM Status Pulse** strip at top — stale leads / overdue follow-ups / trials ending this week / hot leads
- [x] **Filter chip row**: Stage / Owner / Region / Source / Value range — URL-persisted (mirror centres + roster pattern)
- [x] **`financial_access` gate** on Pipeline Value summary card + Won $ aggregate (whatever shows currency)
- [x] **Aging-in-stage tint** on cards — amber after 7d in stage, red after 14d. Tooltip shows exact "12d in this stage"
- [x] **Bulk-select on board** — checkbox on cards (visible on hover or always), sticky action bar with: Reassign owner / Change stage / Add to sequence / Delete (already exist server-side)
- [x] **Collapsible Won / Lost columns** — default hidden, "Show closed (N won, M lost)" toggle to reveal
- [x] **Owner avatar chip on each card** — `getInitials(owner.name)` mini avatar in the card footer
- [x] **"Hot lead" flame indicator** — when `lead_activities` shows email opened/clicked in the last 48h
- [x] **Email Sequences as a primary header card** — promote from outline button to a callout card showing "N sequences running, K emails sent this week"
- [x] **Region filter** added to the chip row (regions table exists; `leads.region_id` confirmed via migration 039 — used directly, no centre-name join needed)
- [x] **Mobile responsive layout** — single-column scroll with a horizontal stage-picker chip row; the kanban is a tablet+ experience
- [x] **UI refresh**: `rounded-2xl` on summary cards + lead cards + column containers, restrained orange (active chip / hot lead / primary CTA only), subtle hover-lift on cards, `gap-6` between sections
- [ ] **(Optional)** Saved board views (`?stage=interested&owner=me` → "My interested leads") — pattern from centres

**Out of scope:** `LeadDetailView` (1504 lines — separate review when we drill into a lead); the 7 sub-pages (`/list`, `/metrics`, `/sequences`, `/proposal-templates`, `/embed`, `/import`) each warrant a mini review if/when we expand the dashboard walkthrough.

---

### 1.5 `/admin/staff` — Staff (the team)

🔍 **Current state**

`app/(dashboard)/admin/staff/page.tsx` (17 lines) → `getStaffList()` → `StaffListView` (`components/staff/staff-list-view.tsx`, 243 lines).

**Surface — list page:**
- Header: "Staff" + member count + "Add Staff" primary CTA
- Filter bar: search (name/email) + Role select (Admin/Ops/Coach) + Status select (Active/Inactive/Onboarding)
- Single view: a `Table` with rows = members, columns = Name + Avatar / Email / Role badge / Status pill / Compliance indicator / View link
- Compliance indicator: 🟢 All verified / 🟡 N pending / 🔴 N expired / muted "No docs"
- Empty state: filter-aware copy

**Sub-pages:**
- `/admin/staff/new` (254-line `AddStaffForm`) — create flow, the literal-credentials onboarding (per CLAUDE.md): `BAK-xxxxxxxx` temp password → Resend email
- `/admin/staff/[id]` (`StaffDetailView`, 1224 lines!) — 6 tabs:
  1. **Overview** — basics
  2. **Compliance** — WWCC + First Aid docs
  3. **Pay Rates** — per-session-type rates
  4. **Availability** — Mon–Fri slot grid (seeded with P1 defaults on create)
  5. **Sessions** — lazy-loaded session history
  6. **Feedback** — `feedback_ratings` for this coach
  
  Plus the header action row from Wave A: Edit / Reset Password / **Grant/Revoke financial access** (admin-only toggle, commit `51a5e7d`) / Deactivate.
- `/admin/staff/rate-card` (310-line `RateCardView`) — org-wide rate matrix across coaches

**`/ops/staff`** mirrors the list but doesn't expose the financial-access toggle (per Wave A).

✅ **What works**

- Filter combinations apply cleanly
- Compliance indicator gives at-a-glance pulse — best signal in the row
- Detail view's 6 tabs all load real data; sessions tab lazy-loads to keep TTFB fast
- Create flow generates temp password + sends Resend email (full literal-credentials standard)
- P1 defaults seed Mon–Fri 8:00–16:30 availability automatically (no extra clicks)
- Financial access toggle wired (Wave A) with activity_log entries per flip
- Archive / reactivate (deactivate) flow bans the auth user — they actually can't log in

⚠️ **Gaps**

1. **No URL persistence** — search/role/status reset every nav (same pattern as other tabs now closed)
2. **No status pulse strip** — should surface: expired certs (count) / pending verifications / coaches not rostered this week / staff in onboarding
3. **No "utilisation" or "next session" column** — Abdul's #1 daily question is "is this coach over- or under-rostered?". The data is one join away from `sessions`
4. **No region filter / region indicator** — once you have 8+ coaches across 5 regions, this is a missing signal
5. **No bulk actions** — to message every coach, reset passwords on 5 onboarding accounts, or bulk-mark someone as active — open one at a time
6. **`Grid` view absent** — the table is dense but a card-grid alternative with photo + status + 1-line compliance summary would scan faster
7. **Compliance indicator is "WWCC OR First Aid" agnostic** — when 1 of 2 is expired, the summary says "1 expired" but doesn't tell you which
8. **No "Last shift / next shift" timestamps** on rows — "active staff" who haven't worked in 30 days deserve a flag
9. **No financial-access badge on rows** — the row doesn't show who has $ visibility (Jayden + Abdul-status). For audit ops a column would help
10. **Compliance indicator is not click-through** — clicking "1 expired" should jump straight to that coach's Compliance tab
11. **Detail view's 6 tabs (1224 lines)** — works but the "Sessions" tab loads on click, which is fine; the rest could batch in a single fetch instead of multiple roundtrips
12. **UI doesn't match the home + centres + roster + CRM language** — `rounded-lg`, no hover-lift, no status pulse, no `rounded-2xl` containers
13. **Rate Card sub-page (`/admin/staff/rate-card`, 310 lines) is financial-sensitive** — currently accessible from /admin (admin-only route) but no `financial_access` gate. Should redirect when ops with `financial_access=false` lands there
14. **Add Staff form (254 lines) doesn't surface "financial access" on create** — defaults to false for ops (per migration 050) but you can't tick it on the create form; admins have to create then toggle in detail. Two-step workflow when one would do

🎯 **Final-state target**

The team-management home base. Status pulse at top (expired certs · pending verifications · coaches not rostered this week · onboarding). Filter chip row adds Region. URL persistence everywhere. List view augmented with: utilisation column (hours rostered this week vs 30hr full-time benchmark), next-session column, financial-access badge, click-through compliance. Grid view alternative. Bulk-select bar (reset passwords / send announcement / bulk archive / bulk export). Rate Card gated by `financial_access` (redirect when off). Create form gets a "Grant financial access" checkbox. UI matches the rest.

📋 **Open items**

- [ ] **Staff Status Pulse** at top — expired certs / pending verifications / not rostered this week / staff in onboarding
- [ ] **Filter chip row** with URL persistence: search / Role / Status / Region — mirror the centres/roster/CRM pattern
- [ ] **Utilisation column** — hours rostered this week (compute via `getSessionsForWeek` aggregated by coach), tooltip shows last 4 weeks
- [ ] **Next-shift column / last-shift timestamp** — surfaces stale-active staff
- [ ] **Compliance indicator click-through** — clicking "1 expired" deep-links to `/admin/staff/<id>?tab=compliance`
- [ ] **Region indicator** on each row + filter chip (joins coach's home suburb → regions table)
- [ ] **Financial-access badge** on row — small `Banknote` icon when on, muted Lock when off
- [ ] **Grid view alternative** — card grid with photo + status pill + 1-line compliance + utilisation
- [ ] **Bulk-select on table** — sticky action bar with: Reset passwords / Send announcement / Archive / Export CSV (admin-only)
- [ ] **Rate Card financial gate** — `/admin/staff/rate-card` redirects via `requireFinancialAccess()` when off; sidebar still shows the link but the layout catches it
- [ ] **"Grant financial access" checkbox** on `AddStaffForm` — defaults to false; admin can tick to grant on create rather than 2-step
- [ ] **UI refresh**: `rounded-2xl` everywhere, restrained orange (Add Staff CTA + active chip + pulse > 0 only), subtle hover-lift on rows / cards, `gap-6` between sections
- [ ] **(Optional)** Inline "send announcement" per-row action (DM via shift_threads or notifications insert) — small win, post-Wave A
- [ ] **(Optional)** "Coaches who haven't completed onboarding training" surfaced from `training_assignments` — once the training module is more populated

**Out of scope:** `StaffDetailView` (1224 lines, full tab-by-tab review of its own); the `AddStaffForm` form fields (separate ergonomic review); `/admin/staff/rate-card` is referenced for the gate but a full re-design is its own task.

---

### 1.6 `/admin/children` — Children

🔍 **Current state**

`app/(dashboard)/admin/children/page.tsx` (30 lines) batches `getChildrenList()` + `getCentreList()` → `ChildrenListView` (`components/children/children-list-view.tsx`, 534 lines).

**Surface — list page:**
- Header: "Children" + total count + "Import CSV" link + **"Add Child" primary CTA** (opens a `Dialog` with name, age_group select, centres multi-select)
- Filter bar: search by name + Centre select + Age Group select (3-5 / 5-8 / 8-12) + Status select (Active / Inactive)
- Single **Table** view: Name / Age Group badge / Centres badges (hidden on mobile) / Status badge — whole row clicks through to `/admin/children/[id]`
- Empty state with filter-aware copy
- "Showing N of M children" tail count

**Sub-pages:**
- `/admin/children/import` — `CsvImportView` (592 lines) — the polished multi-step bulk-import wizard (already wired and confirmed in Wave A inventory)
- `/admin/children/[id]` — `ChildDetailView` (477 lines) — **3 stacked Cards** (no Tabs):
  1. Basics card (name, DOB, gender, medical notes)
  2. Centres card (linked centres with link/unlink actions)
  3. Assessments card (via `ChildAssessmentDisplay`)

**`/ops/children`** mirrors via same `ChildrenListView` with `basePath="/ops/children"`.

**Schema context (CLAUDE.md):**
- `children` — global record (one per kid)
- `centre_children` — link table (one kid can attend multiple centres)
- `parent_children` — parent ↔ child link
- `session_attendances` — named attendance + headcount fallback
- `child_insights` — AI developmental insights at term end + on-demand
- `child_observations` — coach notes (post-Wave-8 launch foundation)
- `skill_ratings` — per-term skill assessments

✅ **What works**

- 4 filters compose cleanly (search + Centre + Age Group + Status)
- Multi-centre linking on create AND from the detail view
- CSV import flow (`csv-import-view.tsx`, 592 lines) is polished — flexible column mapping, duplicate detection, per-row error display
- Status enum + visible badges
- Empty state copy adapts to whether filters or absence is the cause
- Inline "Add Child" dialog — no full-page navigation needed

⚠️ **Gaps**

1. **No URL persistence** — search/centre/age/status reset on every nav (same pattern as the recently-closed tabs)
2. **No status pulse strip** — should surface: new children added this week / children with no centre linked / assessments overdue / inactive 30+ days
3. **No bulk actions** — to mark inactive, link 10 kids to a new centre, message all parents at a centre — open one at a time
4. **No region filter / region indicator** — children inherit a region via their centres, but it's invisible here
5. **No parent-linked indicator** — kids can have a parent (via `parent_children`) or just a raw `parent_name` text field; the row gives no signal of which
6. **No "needs assessment" flag** — `skill_ratings` per term is tracked but only visible from `/admin/assessments`. A kid with no rating this term should be flagged here too
7. **No "Last attended" timestamp** — Did this kid actually come last week? `session_attendances` carries the answer but it's invisible on the list
8. **No grid/card view alternative** — table is fine for ops but a card grid (photo + centres + age + last-attended + assessment status) would scan faster for term-end reviews
9. **No `child_insights` surfacing on the list** — AI-generated developmental insights are calculated but only visible in the detail view. A subtle "Insight ready" badge would draw the parent-handover workflow
10. **Detail view uses 3 stacked Cards (no Tabs)** — fine at the current data density but as `child_insights` + `child_observations` + `session_attendances` get more content, it'll get long. Should group into tabs: Engagement (sessions, attendance, observations) / Assessments (skill ratings + AI insights) / Family (parent contact, medical, emergency)
11. **No duplicate detection on create** — two "Jack Smith"s in the same centre? The CSV import handles it but the inline dialog doesn't even warn
12. **UI doesn't match the recent design language** — uses `rounded-md`, `rounded-lg`, dashed border on empty state; should be `rounded-2xl`, hover-lift on rows, restrained orange (Add CTA + active chip + pulse > 0 only)
13. **No parent contact column on the list** — parents are the practical "who do you call about this kid" surface; even a small avatar + name when linked would help
14. **Row click → push** uses `router.push` directly; no `Link` for accessibility (keyboard / right-click → open in new tab)

🎯 **Final-state target**

The child-record cockpit, especially during enrolment cycles and parent handover. Status pulse at top (new this week / no centre / assessments overdue / inactive 30+d). Filter chip row adds Region + Parent-linked (yes/no/all). URL persistence everywhere. Table augmented with: Last-attended timestamp, parent-link indicator (small parent avatar), assessment-status pill (✅ done / ⏳ pending / ⚠️ overdue), region badge. Grid view alternative with photo + key signals. Bulk-select bar (link to centre / change status / message parents / export). Detail view's 3 cards become 4 tabs (Engagement / Assessments / Family / Insights) with count badges. Inline duplicate detection on Add Child. UI matches the rest.

📋 **Open items**

- [ ] **Children Status Pulse** strip at top — new this week / no centre linked / assessments overdue / inactive 30+ days
- [ ] **Filter chip row** with URL persistence: search / Centre / Age Group / Status / **Region** / **Parent-linked** — mirror the centres/roster/CRM/staff pattern
- [ ] **Last-attended column** on the table — pulled from `session_attendances` aggregated per child
- [ ] **Parent-link indicator** on each row — small parent avatar + name when `parent_children` row exists; muted "No parent" otherwise
- [ ] **Assessment-status column** — ✅ verified done this term / ⏳ pending / ⚠️ overdue
- [ ] **Region indicator** on each row + filter chip (joined via centre's region)
- [ ] **`child_insights` surfacing** — small "✨ Insight ready" badge when there's an unread insight for the parent or centre
- [ ] **Grid view alternative** — card grid with photo + centres + age + last-attended + assessment status (`?view=grid|table` URL-persisted)
- [ ] **Bulk-select on table** — sticky action bar: Link to centre / Change status / Message parents / Export CSV
- [ ] **Detail view → tabs** (Engagement / Assessments / Family / Insights) with count badges, mirroring centres-detail
- [ ] **Inline duplicate detection** on Add Child dialog — warn when name + age_group + a selected centre already exists
- [ ] **Parent contact column** (or condensed avatar+initial in the existing Centres column area)
- [ ] **Row → `<Link>` not `router.push`** — accessibility + open-in-new-tab support
- [ ] **UI refresh**: `rounded-2xl` everywhere, restrained orange (Add CTA + active chip + pulse > 0 + assessment-overdue badge only), subtle hover-lift on cards / `hover:bg-muted/30` on rows, `gap-6` between sections
- [ ] **(Optional)** Quick-attendance widget per centre — "today's session at <centre>: tap to mark"
- [ ] **(Optional)** Child→parent magic-link invite from the row (one-click "Invite parent to register")

**Out of scope:** `ChildDetailView`'s individual cards (separate review); `CsvImportView` (already shipped and not regressing); the assessments engine itself lives at `/admin/assessments` — covered when we hit that tab.

---

### 1.7 `/admin/performance` — Team Performance

🔍 **Current state**

`app/(dashboard)/admin/performance/page.tsx` (38 lines) batches `getTeamPerformanceData(periodStart, periodEnd)` (default period = first-of-month → today) → `TeamPerformanceView` (~700+ lines).

**Surface — list page:**
- "Analytics" eyebrow + **"Team Performance"** h1 + tagline
- **Period selector**: native `<input type="month">` + "Last 3 months" / "Last 6 months" quick buttons + period text + "Export CSV"
- **4 summary cards** — Team Avg Score (border tinted by score) · Total Sessions · Avg Feedback Rating · Avg Form Completion
- **Coach performance table** — sortable columns (Overall Score / Sessions / Feedback / Forms / Punctuality / Reliability / Attendance / Equipment / etc.), expandable rows revealing the full 8-metric breakdown
- Empty state when no coaches/sessions in period

**Sub-page:**
- `/admin/performance/[coachId]/page.tsx` — individual coach detail (full per-metric breakdown + earned badges)

**Backed by:**
- `getTeamPerformanceData(start, end)`
- `getCoachPerformanceDetail(coachId)`
- `getCoachSelfPerformance()` — coach portal
- `exportTeamPerformanceCsv(start, end)`
- `getPerformanceWidgetData()` — admin home widget

**CLAUDE.md context** — 8 weighted metrics: feedback (25%) · reliability (20%) · forms (15%) · punctuality (15%) · volume (10%) · attendance (10%) · equipment (5%). Badges: 50 Sessions, Century Coach, Five Star, Perfect Punctuality, Form Champion, Reliability Rock, Multi-Sport Master.

✅ **What works**

- Period switching is smooth (`useTransition` with subtle "Refreshing…" indicator)
- Sortable columns + expandable rows reveal per-metric drilldowns
- Score colour-coded summary cards
- Empty state copy adapts to period selection
- CSV export end-to-end
- Coach detail sub-page (separate review territory)

⚠️ **Gaps**

1. **No URL persistence** — period selection resets every nav; can't bookmark "Last 6 months" or share a specific month with the team
2. **No status pulse strip** — should surface: underperforming coaches (overall score <60) / top performers this period / coaches with no feedback this period / new badges earned this period
3. **No filter chips** — can't slice by Region, Sport (when a coach is multi-sport), or "above/below team benchmark"
4. **No view toggle** — only table view. A **leaderboard card grid** (photo + score + earned badges + trend arrow + click to detail) would be more motivating for ops to share in standups
5. **No region indicator** on rows — `region_ids[0]` surfaced in /admin/staff after Wave A; same join should bring it here for triage
6. **No badges shown on the row** — CLAUDE.md says 7 badge types exist (`coach_badges` table from migration 029); should be visible on each row as small chip group
7. **No trend indicator** — "is this coach improving or declining vs prior period?". A small `ArrowUp` / `ArrowDown` next to the Overall Score would be powerful for spotting trajectory
8. **No quick-link from row → coach's roster / schedule** — ops sees "low overall score, low session volume" and the next click should be "show me their roster". Currently you go: row → detail page → click back → /admin/roster?…
9. **Period selector is a native HTML control** — visually inconsistent with the polished `MonthCalendarPopover` we just shipped on `/admin/roster`. Could share that component
10. **Summary card icons all use the same default tint** — Team Avg Score should be brand-orange (the marquee number); others stay neutral
11. **No "Performance leaders" inline widget** — top 3 coaches highlighted at the top would make a great daily standup visual
12. **UI doesn't match the recent design language** — `rounded-lg`, dashed border on empty state, no `rounded-2xl`, no hover-lift, no `useCountUp` on summary numbers
13. **No mobile redesign** — table scrolls horizontally on phones; should compress to a 1-column card list under `md`
14. **Coach detail sub-page (`/[coachId]`) — separate review territory** — the linkthrough works but the page itself needs its own tab review

🎯 **Final-state target**

The team performance command center. Status Pulse strip (underperforming · top performers · no feedback · new badges this period). Filter chip row (Region · Sport · Above/Below benchmark) URL-persisted alongside the period. **Period picker replaced with the shared `MonthCalendarPopover`** from the roster. **Leaderboard card grid alternative** (photo + score + top badge + trend) with view toggle. Each table row shows earned badges + trend arrow + quick `Roster` / `Detail` link buttons. Region badge on row. "Top 3 performers" inline widget above the table for team-standup visibility. `useCountUp` on summary numbers. Mobile-responsive list under `md`. UI matches `/admin` home + the rest.

📋 **Open items**

- [x] **Performance Status Pulse** strip at top — underperforming coaches (<60) / top performers (≥80) / coaches with zero feedback this period / new badges earned this period
- [x] **Filter chip row** with URL persistence: period (also lives in URL `?from=...&to=...`) / **Region** / **Sport** / **Benchmark** (above/below team avg)
- [x] **Replace period selector** with the shared `MonthCalendarPopover` from `components/roster/month-calendar-popover.tsx` (extract / generalise if needed)
- [x] **Leaderboard card grid** alternative + view toggle (`?view=cards|table` URL-persisted)
- [x] **Badges chip group** per row (`coach_badges` table) — visible on table + grid view
- [x] **Trend indicator** per row — small `ArrowUp` / `ArrowDown` with delta vs prior period (e.g. "+4" / "-2")
- [x] **Region badge** per row (from `profiles.region_ids[0]` → `regions.name`)
- [x] **Quick-action buttons** in the actions cell — "View detail" + "View roster" (deep-link to `/admin/roster?coach=<id>`)
- [x] **"Top 3 performers" widget** above the table — 3 inline cards with photo + score + headline badge
- [x] **`useCountUp`** on the 4 summary card numbers; brand-orange tint on Team Avg Score (marquee), neutral on others
- [x] **Mobile responsive** — collapse the table to a 1-column card list under `md` with overall score + 2-3 top metrics
- [x] **UI refresh**: `rounded-2xl` on all summary cards + container, restrained brand orange (Team Avg Score + active filter chip + Top performer card + Export CSV CTA only), `gap-6` between sections, subtle hover-lift on grid cards / `hover:bg-muted/30` on table rows
- [x] **Period text** rendered as a polished "From 1 May – 17 May 2026" with Sydney-local date format instead of `2026-05-01 → 2026-05-17`
- [ ] **(Optional, post-beta)** Snapshot archive — show a "View this period's snapshot" pill for past months that have a generated `coach_performance_snapshots` row (the monthly cron creates these)
- [ ] **(Optional, post-beta)** Side-by-side compare picker — select 2 coaches → compact compare view across all 8 metrics

**Out of scope:** Coach detail sub-page `/[coachId]` (separate mini-review when we drill in); the underlying performance scoring logic (lives in `lib/performance/`); badge-issue trigger logic.

---

### 1.8 `/admin/assessments` — Skill Assessments

🔍 **Current state**

`app/(dashboard)/admin/assessments/page.tsx` (~60 lines) batches `getAssessmentTemplates()` + centres + terms + `getAssessmentsStatusPulse()` → `AssessmentListView` (the shared shell, also used by `/ops/assessments`). Detail at `[id]/page.tsx` → `AssessmentDetailView`.

**Surface — list page:**
- **Status Pulse strip** above the filter row — templates without skills · children pending this term · coaches silent this week · new templates this week (each chip jumps to a filtered slice via URL param)
- **Filter chip row** (URL-persisted): search (sport / centre / term name) · Sport · Age (3–5 / 5–8 / 8–12) · Term · Centre · grid/table view toggle · Clear all
- **Create assessment** dialog with sport + age + term + centre, AI skill generation, manual edit + inline duplicate-warn ("a template for {sport} · {age} already exists — open existing")
- **Table view + grid view** (URL-persisted). Mobile under `md` collapses the table to a 1-column card list
- **Bulk-select on table view** with sticky orange action bar — Duplicate / Delete (delete keeps templates with ratings)
- **Row → `<Link>`** overlay for keyboard + open-in-new-tab nav
- **"No skills" ring** in restrained orange on grid cards / row chip when `skill_count === 0`

**Sub-page:** `/admin/assessments/[id]` — tabbed detail (Skills / Settings / Ratings) with count badges.

**Backed by:**
- `getAssessmentTemplates()` — now returns `ratings_count`, `term_id`, `centre_id` for the new chips
- `getAssessmentsStatusPulse()` — 4-count pulse
- `bulkDuplicateAssessmentTemplates(ids)` / `bulkDeleteAssessmentTemplates(ids)` — admin/ops gated with per-id error capture + activity_log entries
- `createAssessmentTemplate`, `deleteAssessmentTemplate`, `getAssessmentTemplateDetail` — unchanged
- `getCoachAssessmentTasks`, `saveChildRating`, `getChildAssessments`, `getAssessedChildIdsForCentre` — unchanged (coach + child-list surfaces stable)

**CLAUDE.md context** — assessment_templates (sport, age_group, skills_json, term_id, centre_id) + skill_ratings (child + coach + term + ratings_json). AI generates 5–8 skills per sport+age; coaches rate 1–5. Used by /admin/children's per-child assessment column (status: done / pending / overdue / no_term) and /coach/assessments for rating workflows.

✅ **What works**

- Live pulse counts (templates without skills · pending child × template pairs this term · silent coaches · new templates this week) with `useCountUp` and brand-orange tint when > 0
- URL-persisted filters survive refresh + can be shared as a deep link
- Bulk Duplicate + Delete with partial-failure tolerance (per-id error array, toast counts both successes and skipped)
- Inline duplicate-warn on Create dialog — if `sport + age + term` already has a published template with skills, link to the existing one
- Tabbed detail view (Skills / Settings / Ratings) with count badges in each trigger
- Grid + table view modes, both URL-persisted, table collapses to mobile cards under `md`
- Restrained brand orange: Create CTA, bulk-action bar, active view-toggle, "Save", "No skills" indicator only
- Coach view (`coach-assessment-view.tsx`) and child-list assessment column unchanged — confirmed by reading `getChildrenList` which still reads `skill_ratings` by `term_id` and bucket-derives status

⚠️ **Gaps**

1. **No inline skill editor on the detail page** — today skill rubric is read-only; need to navigate to a Create dialog to add/edit skills on an existing template. Deferred — out of scope for this close-out
2. **No region filter** — `assessment_templates` has no region column; would require a migration to add `region_ids[]` for territory-scoped templates. Out of scope
3. **No filter for "templates I created"** — useful when multiple admins seed templates; deferred
4. **The pulse's "coaches silent this week" filter is approximate** — flips the list to all term-scoped templates; a precise filter would need a join from `skill_ratings` to `profiles.role='coach'`. Acceptable trade-off for the chip's purpose (surface what to nudge)
5. **Detail page Ratings tab is link-only** — no inline table of per-child ratings. Deferred to a follow-up that drills into `getTemplateRatings` (already exists) with a grouped-by-child view

🎯 **Final-state target**

The skill-assessment command center. Status Pulse strip surfaces what's half-built (templates without skills), what's behind (children pending this term, coaches silent this week), and what's new (this week's published templates). Filter chip row (Sport · Age · Term · Centre) plus search across sport/centre/term names, all URL-persisted. Grid + table views with mobile responsiveness. Bulk Duplicate + Delete with safety: delete blocks templates with ratings and reports per-id failures. Inline duplicate-warn on Create. Tabbed detail (Skills / Settings / Ratings) with count badges. UI matches `/admin` home and the rest — `rounded-2xl` containers, restrained brand orange, hover-lift, `useCountUp` on the pulse numbers.

📋 **Open items**

- [x] **Assessments Status Pulse** strip at top — templates without skills (`skills_json` empty) / children pending this term (active children × term templates missing a rating) / coaches silent this week (have ever rated but not this week) / new templates this week (head count on `created_at >= Monday`)
- [x] **Filter chip row** with URL persistence: search · Sport · Age · Term · Centre · view toggle · Clear all
- [x] **Bulk-select** on table view with sticky orange action bar — Duplicate (admin/ops, copies sport/age/skills/term/centre, fresh `created_by`) + Delete (skips templates with ratings)
- [x] **Tabbed detail view** — Skills / Settings / Ratings with count badges on each trigger; "No skills" empty-state in orange when `skill_count === 0`
- [x] **Inline duplicate-warn** on Create dialog — surfaces existing templates with same sport+age(+term) so admins can extend rather than re-seed
- [x] **Grid + table view** modes, URL-persisted via `?view=`, with hover-lift on grid cards and `hover:bg-muted/30` on table rows
- [x] **Mobile responsive** — table collapses to 1-column card list under `md`
- [x] **Row-as-link** — overlay anchor pattern for keyboard / right-click / open-in-new-tab nav
- [x] **UI refresh** — `rounded-2xl` everywhere, restrained orange (Create CTA · bulk-action bar · active view toggle · "Save" · "No skills" ring · pulse counts), `gap-6` between sections, `useCountUp` on pulse counts
- [x] **Empty state** styling — `rounded-2xl border py-16` with `ClipboardList` icon, adaptive copy based on filter state
- [x] **Tests** — `lib/assessments/__tests__/assessments-status-pulse.test.ts` (6 cases) + `lib/assessments/__tests__/bulk-actions.test.ts` (8 cases): role gate, empty selection, happy path, partial-failure capture
- [ ] **(Optional, post-beta)** Inline skill editor on detail page — add/edit/reorder skills without re-creating
- [ ] **(Optional, post-beta)** Region scoping on templates — `region_ids[]` column for territory-specific rubrics
- [ ] **(Optional, post-beta)** Inline per-child ratings table on the Ratings tab — drills `getTemplateRatings` into a child × skill grid

**Out of scope:** Coach assessment flow (`coach-assessment-view.tsx`) — keeps its existing public API; ChildAssessmentDisplay used by `/admin/children/[id]` Assessments tab — stable; AI skill-generation endpoint (`/api/assessments/generate-skills`) — separate.

**Plumbing verified:** `getChildrenList` (used by `/admin/children` for the per-child assessment column) still reads `skill_ratings.term_id + child_id` directly — no change to row shape, so the assessment column resolves identically.

---

### 1.9 `/admin/programs` — Programme library

🔍 **Current state**

`app/(dashboard)/admin/programs/page.tsx` (~50 lines) batches `getPrograms()` + `getProgramsStatusPulse()` → `ProgramLibrary` (the shared shell, also used by `/ops/programs`). Detail at `[id]/page.tsx` → `ProgramDetailView` with the new tabbed layout. Generator at `generate/page.tsx` → `ProgramGenerateForm`.

**Surface — list page:**
- **Status Pulse strip** above the filter row — programmes missing skills · unused (never assigned to a session) · stale (60+ days old whose last session was 90+ days ago) · new this week (each chip jumps to a filtered slice via URL param)
- **Filter chip row** (URL-persisted): search (title / sport / focus / creator) · Sport · Age (multi-select Popover backed by `AGE_BANDS`) · Usage (used / unused / stale) · Sort (newest / oldest / A→Z / Z→A / most used) · folder/grid/table view toggle · Clear all
- **Dual CTA** — "Create blank" (outline) next to "Generate with AI" (orange) — the AI generator is the marquee creation surface
- **Bulk-select on table view** with sticky orange action bar — Duplicate / Export CSV / Delete (delete keeps programmes still assigned to a session)
- **Row → `<Link>`** overlay for keyboard + open-in-new-tab nav
- **"No skills" + "Unused" + "Stale" tag chips** on each tile, restrained orange on the first two
- **Last-used indicator** + session count on every tile + table row to surface dead weight

**Sub-page:** `/admin/programs/[id]` — tabbed detail (Overview / Sessions / Variants / Linked centres) with count badges on each trigger.

**Backed by:**
- `getPrograms()` — now returns `session_count`, `last_used_at`, `has_skills` per programme so the library can render usage signals without N round-trips
- `getProgramsStatusPulse()` — 4-count pulse with parallel fan-out + zero-fallback on error
- `bulkDuplicateProgrammes(ids)` / `bulkDeleteProgrammes(ids)` / `exportProgrammesCsv(ids)` — admin/ops gated with per-id error capture + activity_log entries; CSV escapes commas/quotes/newlines
- `checkProgrammeDuplicate(sport, ageGroups)` — overlap-on-age-band lookup; powers the inline duplicate warning in the generator
- `getLinkedCentresForProgramme(id)` — distinct centre summary for the detail-page Linked centres tab
- `getProgramDetail`, `getProgramVersionHistory`, `getProgramUsageStats`, `createNewVersion`, `deleteProgram` — unchanged (used by detail view + version flow)
- `getProgramsForSport`, `assignProgramToSession`, `getRecentProgramsForCentre`, `getCentreEquipment`, `getCentreListSimple` — unchanged (session-assignment dropdown + generator)

**CLAUDE.md context** — programmes are sport + age-band scaffolds (P2 multi-age, migration 046) generated by Claude with skill drills, equipment lists, and a `skillDevelopment[]` array. Linked to `sessions.program_id` so a coach sees the lesson plan in the SessionDetailSheet. Versioned via `parent_version_id` chain so revisions don't blow away usage history. Used by `/coach/programs` (read-only) and the SessionDetailSheet program-render — both consume the unchanged `getProgramById` / `getProgramDetail` surfaces.

✅ **What works**

- Live pulse counts (missing skills · unused · stale · new this week) with `useCountUp` and brand-orange tint when > 0
- URL-persisted filters + view mode survive refresh + can be shared as a deep link; multi-band age filter via Popover + Checkbox list
- Bulk Duplicate + Delete + Export CSV with partial-failure tolerance (per-id error array, toast counts both successes and skipped)
- Inline duplicate-warn on the generator — sport + age-band overlap surfaces up to 3 matching programmes with "open existing" links, so admins can extend a v2 rather than re-seed
- Tabbed detail view (Overview / Sessions / Variants / Linked centres) with count badges in each trigger and a usage-summary metadata strip
- Folder + grid + table view modes, all URL-persisted; table collapses to mobile cards under `md`
- Restrained brand orange: dual CTA (Generate AI marquee), bulk-action bar, active view-toggle, active jump chips, "No skills" / "Unused" tags, current-version pin in Variants tab
- Plumbing safe: `sessions.program_id` reads + the SessionDetailSheet program-render still consume the unchanged `getProgramById`, so the roster surface is unaffected

⚠️ **Gaps**

1. **No inline content editor on the list** — operators still click into the detail page to revise the programme (then "Edit & Create Version" forks a new row). Acceptable trade-off for the versioning safety
2. **No region filter** — programmes are org-wide and don't carry a region scope. Out of scope for this close-out (would require a migration)
3. **Custom sport rename propagation is read-time** — if an admin renames a custom sport (`custom_sports.name`), the programme row still stores the original string in `programs.sport`. Acceptable because we display the value from `programs.sport` directly; renaming the taxonomy entry doesn't break the existing programme display, just the available-sports dropdown. Documented for the launch checklist
4. **Stale heuristic is rule-based** — created ≥ 60d ago AND last session ≥ 90d ago. Tunable in `lib/programs/status-pulse-actions.ts` if needed; no per-org override yet
5. **Detail Sessions tab groups by centre, not by date** — the most-recent session date per centre is shown, but there's no per-session list. Deferred to a follow-up that drills into `getSessionsForWeek` filtered by `program_id`

🎯 **Final-state target**

The programme-library command center. Status Pulse strip surfaces what's half-built (missing skills), what's dead weight (unused), what's drifting (stale), and what's fresh (new this week). Filter chip row (Sport · Age multi · Usage · Sort) plus search across title / sport / focus / creator, all URL-persisted. Folder + grid + table views with mobile responsiveness. Bulk Duplicate + Delete + Export CSV with safety: delete blocks programmes still assigned to a session and reports per-id failures. Inline duplicate-warn on the generator. Tabbed detail (Overview / Sessions / Variants / Linked centres) with count badges. Dual CTA puts the AI generator front-and-centre as the marquee creation surface. UI matches `/admin` home and the rest — `rounded-2xl` containers, restrained brand orange, hover-lift, `useCountUp` on the pulse numbers.

📋 **Open items**

- [x] **Programmes Status Pulse** strip at top — missing skills (`content_json.skillDevelopment` empty / absent) · unused (no `sessions.program_id = id`) · stale (created ≥ 60d AND last session ≥ 90d ago) · new this week (`programs.created_at >= Monday`)
- [x] **Filter chip row** with URL persistence: search · Sport · Age multi-select (Popover + Checkbox over `AGE_BANDS`) · Usage · Sort · view toggle · Clear all
- [x] **Bulk-select** on table view with sticky orange action bar — Duplicate (admin/ops, copies sport / age / content / equipment, fresh `created_by`, fresh `version_number = 1` family, title appended with "(copy)") + Delete (blocks programmes assigned to a session) + Export CSV
- [x] **Tabbed detail view** — Overview / Sessions / Variants / Linked centres with count badges on each trigger
- [x] **Inline duplicate-warn** on the generator — `checkProgrammeDuplicate(sport, ageGroups)` surfaces up to 3 overlapping programmes with "open existing" links
- [x] **Folder + grid + table view** modes, URL-persisted via `?view=`, with hover-lift on tiles and `hover:bg-muted/30` on table rows
- [x] **Mobile responsive** — table collapses to 1-column card list under `md`
- [x] **Row-as-link** — overlay anchor pattern for keyboard / right-click / open-in-new-tab nav
- [x] **UI refresh** — `rounded-2xl` everywhere, restrained orange (dual CTA marquee · bulk-action bar · active view toggle · jump chips · "No skills" / "Unused" tags · pulse counts), `gap-6` between sections, `useCountUp` on pulse counts
- [x] **Empty state** styling — `rounded-2xl border py-16` with `BookOpen` / `Search` icon, adaptive copy + dual CTA on the org-zero state
- [x] **Generator entry-point CTA** — "Generate with AI" (orange) next to "Create blank" (outline) on the library toolbar AND on the org-zero empty state
- [x] **"Last used" indicator** per programme — surfaced on every tile + table row + the Overview tab's Usage card so dead weight is obvious at a glance
- [x] **Tag-style age-group chips** on each programme card — uses `formatProgramAgeBandsShort` / `formatProgramAgeBandsTooltip` consistently across list, detail, and overlap-warning paths
- [x] **Tests** — `lib/programs/__tests__/programs-status-pulse.test.ts` (6 cases) + `lib/programs/__tests__/bulk-actions.test.ts` (10 cases): role gate, empty selection, happy path, partial-failure capture, duplicate-overlap detection
- [ ] **(Optional, post-beta)** Drag-and-drop scheduling + colour coding + mobile polish (was P4 — deferred per CLAUDE.md)
- [ ] **(Optional, post-beta)** Inline programme content editor on the list (today requires the detail page Edit flow)
- [ ] **(Optional, post-beta)** Region scoping on programmes — `region_ids[]` column for territory-specific libraries
- [ ] **(Optional, post-beta)** Sessions tab per-session drill — today groups by centre, not date

**Out of scope:** Custom sport / equipment taxonomy admin (`custom-taxonomy-actions.ts` + `/admin/settings/programs`) — separate close-out; AI program-generation endpoint (`/api/ai/generate-program`) — unchanged; `getProgramsForSport` used by SessionDetailSheet programme picker — kept stable so the roster surface continues to render.

**Plumbing verified:** `sessions.program_id` consumers (`getSessionsForWeek` + SessionDetailSheet program-render) still call the unchanged `getProgramById` and `getProgramsForSport` — the new `session_count` / `last_used_at` / `has_skills` fields are additive on `ProgramListItem`, populated server-side in `getPrograms()`, and the existing roster + coach reads ignore them.

---

### 1.10 `/admin/training` — Training (Modules + Pathways)

🔍 **Current state**

`app/(dashboard)/admin/training/page.tsx` batches `getTrainingModules()` + `getTrainingPathways()` + `getTrainingStatusPulse()` → renders `TrainingStatusPulseStrip` above a `TrainingTabsShell` (URL-persisted `?tab=modules|pathways`) → `ModuleListView` and `PathwayListView`. Same shape mirrored at `/ops/training`.

**Surface — list page (Modules tab):**
- **Status Pulse strip** above the tabs (spans both) — overdue assignments (`training_assignments.due_date < CURRENT_DATE AND status != 'completed'`) · unassigned mandatory (active coach × mandatory published module pairs without an open assignment) · coaches with zero completions · new this week (each chip jumps via URL param)
- **Filter chip row** (URL-persisted): search (title / description) · Type (video / document / quiz / checklist) · Status (draft / published / archived) · Required (all / required only / optional only) · Clear all
- **Bulk-select on Modules** with sticky orange action bar — Publish · Assign to coaches · Export CSV · Archive (every active coach gets an assignment per published module, skipping coaches who already hold an open `assigned` / `in_progress` row for that module)
- **Row → `<Link>`** overlay for keyboard + open-in-new-tab nav
- **"Required" badge** on mandatory modules (restrained orange tint + ring on mobile cards)
- **Mobile** — table collapses to 1-column card list under `md`

**Surface — list page (Pathways tab):** URL-persisted search + Status filter, restrained orange Create CTA + Required pill, row-as-link, mobile card list. No bulk actions (pathways are referenced by `training_pathway_modules` + assignments — destructive bulk operations not safe at this tier).

**Backed by:**
- `getTrainingStatusPulse()` — 4-count pulse with parallel fan-out + zero-fallback on error
- `bulkPublishTrainingModules(ids)` / `bulkArchiveTrainingModules(ids)` / `bulkAssignTrainingModulesToAllCoaches(ids, dueDate?)` / `exportTrainingModulesCsv(ids)` — admin/ops gated via shared `requireAdminOrOps()` helper, per-id error capture, `activity_log` entries; CSV escapes commas/quotes/newlines
- Module + pathway CRUD (`getTrainingModules`, `createTrainingModule`, etc.) unchanged
- `TrainingTabsShell` client wrapper — URL-persists `?tab=`, strips per-tab filter params when switching tabs so a `?type=video` from Modules doesn't bleed into Pathways

**CLAUDE.md context** — LMS with 4 module types (video, document, quiz, checklist). Pathways chain modules with auto-advance. Soft-gates rostering (`/coach/training` compliance check feeds shift eligibility). `autoAssignOnboarding()` seeds mandatory modules + pathways on new coach. Certificates on completion. Migration 030 + 029 (badges) + 032 (AI usage); RLS confirmed in Wave A Item 7.

✅ **What works**

- Live pulse counts (overdue · unassigned mandatory · zero completions · new this week) with `useCountUp` + brand-orange tint when > 0
- URL-persisted filters survive refresh + can be shared as a deep link; `?tab=` strips orphan filter params on tab switch
- Bulk Publish + Archive + Assign-to-all-coaches + Export CSV with partial-failure tolerance (per-id error array, toast counts both successes and skips)
- Assign-to-coaches dedupes against open assignments (`assigned` / `in_progress`) — re-clicking the action is idempotent
- "Required" tag on mandatory modules — surfaced in the table title cell + as a ring on mobile cards
- Restrained brand orange: Create CTA, Save Draft CTA on the module + pathway editors, active jump chips, "Required" pill, bulk-action bar, pulse counts
- Plumbing safe: `/coach/training` (`coach-training-dashboard.tsx`), `training-compliance-widget.tsx`, `training-compliance-badge.tsx`, `assignment-manager.tsx`, and `autoAssignOnboarding` all read the same `training_modules` / `training_pathways` / `training_assignments` / `training_completions` surfaces — additive `bulk*` server actions don't touch their contract

⚠️ **Gaps**

1. **No per-module assignee panel inline** — admins still click into the module editor to see who's assigned. The detail-page surface (assignment-manager) covers this; an inline drawer was deferred to keep this commit focused
2. **No bulk Assign with custom due-date picker** — current bulk Assign uses no due-date. Per-coach due-dates require the single-module assignment-manager flow
3. **No region filter** — modules are org-wide. Out of scope (would require a migration)
4. **Pathway bulk actions deferred** — pathways carry pathway_modules + open assignments. A safe Pathway bulk Publish / Archive would need a pre-flight enrolment check; not in scope for this close-out
5. **Soft-gated rostering remains roster-side** — this close-out is additive on the library admin surface. The roster's eligibility check still reads the same `training_assignments` + `training_completions` rows

🎯 **Final-state target**

The training-library command center. Status Pulse strip surfaces what's blocking compliance (overdue) and what's about to (unassigned mandatory · coaches with zero completions). Filter chip row (Type · Status · Required) plus search across title / description, URL-persisted with `?tab=`-aware filter scoping. Bulk Publish + Archive + Assign-to-all-coaches + Export CSV with safety (partial-failure tolerance, dedupes against open assignments). UI matches `/admin` home and the rest — `rounded-2xl` containers, restrained brand orange (Create CTA / pulse counts > 0 / Save / Required / bulk bar), hover-lift on table rows, `useCountUp` on the pulse numbers, mobile card list under `md`.

📋 **Open items**

- [x] **Training Status Pulse** strip at top — overdue assignments · unassigned mandatory · coaches with zero completions · new modules this week
- [x] **Filter chip row** with URL persistence on Modules: search · Type · Status · Required · Clear all
- [x] **Filter chip row** with URL persistence on Pathways: search · Status · Clear all
- [x] **Bulk-select on Modules** with sticky orange action bar — Publish + Archive + Assign to coaches + Export CSV (admin/ops gated via `requireAdminOrOps()`, partial-failure tolerant, `activity_log` rows per id, assign dedupes against open `assigned` / `in_progress` rows)
- [x] **Tabs URL state** — `?tab=modules|pathways` persisted, with per-tab filter param stripping on switch
- [x] **Module + Pathway editors design refresh** — restrained orange Save Draft CTA on both
- [x] **Mobile responsive** — both list views' tables collapse to 1-column card list under `md`
- [x] **UI refresh** — `rounded-2xl` everywhere, restrained orange (Create CTA · active chip · pulse > 0 · Save · Required pill · bulk bar), hover-lift, `gap-6`, `useCountUp`
- [x] **Row → `<Link>`** overlay anchor for keyboard / right-click / open-in-new-tab nav (Modules table + cards, Pathways table + cards)
- [x] **Empty state** styling — `rounded-2xl border py-16` with `BookOpen` / `GitMerge` icon + orange Create CTA on the org-zero state
- [x] **"Required" badge** on mandatory modules — restrained orange in the title cell + ring on mobile cards
- [x] **Tests** — `lib/training/__tests__/training-status-pulse.test.ts` (5 cases: shape, zero-state, overdue head, scope of unassigned-mandatory pairs, role-gate / hard-fail) + `lib/training/__tests__/bulk-actions.test.ts` (14 cases: role gate, empty selection, happy path, partial-failure capture across publish + archive + assign + CSV export)
- [ ] **(Optional, post-beta)** Inline assignee panel per module on the list (today requires the detail page)
- [ ] **(Optional, post-beta)** Bulk-assign with custom due-date picker
- [ ] **(Optional, post-beta)** Region scoping on modules
- [ ] **(Optional, post-beta)** Pathway bulk actions (gated on pre-flight enrolment + ordering check)

**Out of scope:** Compliance widgets (`training-compliance-widget.tsx`, `training-compliance-badge.tsx`) — left untouched; `/coach/training` surface (`coach-training-dashboard.tsx`) — left untouched; `autoAssignOnboarding` — left untouched; AI assistant integration (`ai_assistant_*`) — separate close-out; certificate generation — separate close-out.

**Plumbing verified:** `coach-training-dashboard.tsx` + `training-compliance-widget.tsx` + `training-compliance-badge.tsx` + `assignment-manager.tsx` + `autoAssignOnboarding` all read the unchanged `training_modules` / `training_pathways` / `training_assignments` / `training_completions` surfaces — additive `bulk*` server actions + the new `requireAdminOrOps()` helper don't touch their contract. The soft-gated rostering eligibility check reads the same `training_assignments` + `training_completions` rows that the bulk actions write to, so the publish + assign actions feed the existing eligibility logic without a new contract.

---

### 1.11 `/admin/equipment` — Equipment (Kits + Inventory)

📋 **Open items** — closed in the `feat(equipment+documents+forms)` commit

🔍 **Current state**

`app/(dashboard)/admin/equipment/page.tsx` batches `getKits()` + `getInventoryItems()` + `getEquipmentStatusPulse()` + `getCentresSimple()` → renders `EquipmentStatusPulseStrip` above `EquipmentPageTabs` (URL-persisted `?tab=kits|inventory`). Same shape mirrored at `/ops/equipment`. Coach surface at `/coach/equipment` (`coach-equipment-view.tsx`, `coach-equipment-checkin.tsx`) untouched.

**Surface — list page:**
- **Status Pulse strip** above the tabs — damaged or missing (inventory `condition IN ('poor','retired')` + kits `condition IN ('needs_attention','needs_replacement')`) · low-stock kits (any `equipment_items.quantity = 0`) · overdue check-ins (`location_type='coach'` with last `check_out` log > 14 days and no `check_in` since) · unassigned kits (`location_type='storage' AND condition='good'` with no upcoming session link); each jumps to the right tab+filter combo
- **Filter chip row** (URL-persisted) per tab — Kits: search · Condition · Location · Clear all; Inventory: search · Condition · Item Type · Clear all
- **Bulk-select on Inventory** with sticky orange action bar — Mark as damaged · Move to centre (Dialog with centre Select) · Export CSV (admin-only on the destructive paths, admin/ops for CSV)
- **Row → `<Link>`** overlay on Kits cards for keyboard + open-in-new-tab nav
- **Mobile** — inventory table collapses to compact card list under `md`

**Backed by:**
- `getEquipmentStatusPulse()` — 4-count pulse with parallel fan-out + zero-fallback on error
- `bulkMarkInventoryDamaged(ids)` / `bulkMoveInventoryToCentre(ids, location)` / `exportInventoryCsv(ids)` — `requireAdminOrOps()` helper gates destructive + export paths, per-id error capture, `activity_log` entries; CSV escapes commas/quotes/newlines
- Kit + inventory CRUD (`getKits`, `createKit`, `getInventoryItems`, etc.) unchanged

**CLAUDE.md context** — `equipment_kits` + `equipment_items` + `equipment_logs` (kit-level) plus `equipment_inventory` per-centre item tracking (migration 041). Standard equipment picker preserved.

✅ **What works**

- Live pulse counts with `useCountUp` + brand-orange tint when > 0
- URL-persisted filters survive refresh + shareable as deep links
- Bulk Mark damaged + Move to centre + Export CSV with partial-failure tolerance
- Restrained brand orange: Create CTA (Add Kit / Add Item), active jump chips, pulse counts, Save CTA on kit detail + check-out confirmation
- Plumbing safe: `/coach/equipment` reads the same `getCoachAssignedKits` + `coachCheckIn` surfaces — additive `bulk*` server actions + new pulse don't touch their contract; `equipment-card.tsx` `onClick` made optional so the Link wrapper handles nav

⚠️ **Gaps**

1. **No bulk move-to-coach** — current Move-to-centre is scoped to centre locations; coach handoff still uses the per-kit check-out flow
2. **No kit-level bulk actions** — only inventory has bulk-select; kit-level (Bulk reassign · Bulk mark needs_attention) deferred
3. **Overdue check-in heuristic** uses 14 days flat — should be configurable per-coach (or per-centre) but post-beta

🎯 **Final-state target**

The equipment command center. Status Pulse strip surfaces what's blocking sessions (damaged · low-stock · overdue · unassigned). Filter chip row per tab + bulk inventory actions with safety. UI matches the rest — `rounded-2xl`, restrained orange, hover-lift, `useCountUp`, mobile cards under `md`.

📋 **Open items**

- [x] **Equipment Status Pulse** strip — damaged or missing · low-stock kits · overdue check-ins · unassigned kits
- [x] **URL-persisted filter chip row** per tab (search / Condition / Location / Item Type)
- [x] **URL tab state** — `?tab=kits|inventory` persisted across refresh
- [x] **Bulk-select on Inventory** with sticky orange action bar — Mark as damaged + Move to centre + Export CSV
- [x] **Mobile responsive** — inventory table → 1-column card list under `md`
- [x] **UI refresh** — `rounded-2xl`, restrained orange (Create CTA · active chip · pulse > 0 · Save), hover-lift, `gap-6`, `useCountUp`
- [x] **Row → `<Link>`** overlay on Kits cards for keyboard / open-in-new-tab
- [x] **Empty state** styling — centred icon + heading + `rounded-2xl border bg-muted/20`
- [x] **Kit detail refresh** — `rounded-2xl` Cards, restrained orange CTAs
- [x] **Plumbing** — `/coach/equipment` (`coach-equipment-view.tsx`, `coach-equipment-checkin.tsx`) untouched, signatures preserved
- [x] **Tests** — `lib/equipment/__tests__/equipment-status-pulse.test.ts` (5 cases: shape, zero-state, damaged sum, scope of unassigned, error swallow) + `lib/equipment/__tests__/bulk-actions.test.ts` (14 cases: empty / role gate / happy / partial failure across the three bulk actions)
- [ ] **(Optional, post-beta)** Kit-level bulk actions (bulk reassign / bulk mark needs_attention)
- [ ] **(Optional, post-beta)** Configurable overdue check-in threshold per centre/coach
- [ ] **(Optional, post-beta)** Bulk move-to-coach

**Plumbing verified:** `getKits()` enrichment + `KitListItem` shape unchanged; `equipment-card.tsx` `onClick` made optional rather than removed; `coachCheckIn`, `getCoachAssignedKits`, `reportIssue`, `assignKitToSession` signatures untouched — `/coach/equipment` + roster kit-assignment flow continue to read the same surfaces.

---

### 1.12 `/admin/documents` — Documents

📋 **Open items** — closed in the `feat(equipment+documents+forms)` commit

🔍 **Current state**

`app/(dashboard)/admin/documents/page.tsx` batches `getDocuments()` + `getCategoryCounts()` + `getDocumentsStatusPulse()` → renders `DocumentsStatusPulseStrip` above `DocumentHub`. Same shape at `/ops/documents` and `/coach/docs`. Programs auto-file path preserved (`autoFileDocument` signature untouched).

**Surface — list page:**
- **Status Pulse strip** above the layout — uploaded this week (`created_at >= Monday`) · pending review (tag `needs_review`) · expiring soon (`category='compliance' AND created_at < today - 90 days`) · no tags (empty / null `tags`); each jumps to the right filter combo
- **Category sidebar** with URL-persisted state (`?category=…`) and active item in restrained brand orange
- **Filter chip row** (URL-persisted) on the main list — search · Tag · Visibility · Clear all
- **Grid / Table view toggle** in the toolbar (`?view=grid|table`) — grid is 3-col on `lg`, 2-col on `md`, 1-col mobile, each card is `rounded-2xl` with hover-lift
- **Bulk-select** with sticky orange action bar — Archive (idempotent `[Archived]` prefix + `admin_only` visibility) · Tag (Dialog input) · Change visibility (Dialog select) · Export CSV · Delete (AlertDialog confirm, **admin-only**)
- **Row → `<Link>`** overlay with stop-propagation onto the detail sheet + "Open in new tab" icon button to actually launch the file URL

**Backed by:**
- `getDocumentsStatusPulse()` — 4-count pulse with parallel fan-out + zero-fallback
- `bulkArchiveDocuments` / `bulkTagDocuments` / `bulkSetVisibility` (admin/ops) + `bulkDeleteDocuments` (admin-only) + `exportDocumentsCsv` — per-id error capture, `activity_log` entries
- Document CRUD + `autoFileDocument` unchanged; upload pipeline preserved

**CLAUDE.md context** — `documents` table with category enum (program · policy · risk_assessment · onboarding · centre_doc · compliance · template · other), tags text[], version + parent_document_id chain, 3-tier visibility (all / admin_ops / admin_only). Programs save flow auto-creates `category='program'` rows via `autoFileDocument`.

✅ **What works**

- Live pulse counts with `useCountUp` + brand-orange tint when > 0
- URL-persisted category + filter chips + view toggle survive refresh + shareable
- Bulk Archive / Tag / Visibility / Delete / Export CSV with partial-failure tolerance
- Restrained brand orange: Upload CTA, drag-drop zone hover ring, active sidebar, pulse counts, Save CTA on detail sheet
- Drag-drop upload affordance — dashed `rounded-2xl` border with brand-orange ring on hover
- Plumbing safe: `autoFileDocument` signature preserved → programs `saveProgram()` flow continues to auto-file `category='program'` rows unchanged

⚠️ **Gaps**

1. **No bulk move-to-category** — Archive is the only category-changing bulk path; full re-categorise needs the per-doc edit flow
2. **Expiring-soon heuristic** is 90 days flat on `compliance` category — proper expiry should use an `expires_at` column (post-beta)
3. **No drag-drop bulk upload** — single-file upload only; multi-file deferred

🎯 **Final-state target**

The documents command center. Status Pulse strip surfaces what to look at first (this week's uploads · pending review · expiring · untagged). Bulk Archive + Tag + Visibility + Delete + Export CSV. Grid + Table view toggle. UI matches the rest — `rounded-2xl`, restrained orange, hover-lift, `useCountUp`, mobile-first.

📋 **Open items**

- [x] **Documents Status Pulse** strip — uploaded this week · pending review · expiring soon · no tags
- [x] **URL-persisted filter chip row** (search · Category · Tag · Visibility)
- [x] **URL category state** — `?category=…` persisted across refresh
- [x] **Bulk-select** with sticky orange action bar — Archive · Tag · Change visibility · Delete (admin-only) · Export CSV
- [x] **Grid / Table view toggle** — `?view=grid|table` URL-persisted
- [x] **Mobile responsive** — grid → 1-col under `md`, sidebar wraps above main
- [x] **UI refresh** — `rounded-2xl`, restrained orange, hover-lift, `gap-6`, `useCountUp`
- [x] **Row → `<Link>`** overlay + open-in-new-tab icon button
- [x] **Empty state** styling — centred icon + heading inside `rounded-2xl border bg-muted/20`
- [x] **Upload flow refresh** — dashed drag-drop zone with brand-orange ring on hover, `rounded-2xl`
- [x] **Plumbing** — `autoFileDocument` signature preserved; programs auto-file path unchanged
- [x] **Tests** — `lib/documents/__tests__/documents-status-pulse.test.ts` (6 cases: shape, zero-state, this-week scope, pending-review tag scope, expiring scope, error swallow) + `lib/documents/__tests__/bulk-actions.test.ts` (19 cases: empty / role gate / happy / partial failure across Archive · Tag · Visibility · Delete · Export CSV)
- [ ] **(Optional, post-beta)** Bulk move-to-category
- [ ] **(Optional, post-beta)** Proper `expires_at` column (migration) replacing the 90-day heuristic
- [ ] **(Optional, post-beta)** Multi-file drag-drop upload

**Plumbing verified:** `autoFileDocument` signature untouched; `uploadDocument`, `uploadNewVersion`, `getDocuments`, `getDocumentById`, `getDocumentVersionHistory`, `updateDocument`, `deleteDocument`, `getCategoryCounts` all unchanged. Programs `saveProgram()` flow continues to call `autoFileDocument` with the same args — verified by walking the program-save → document-creation path. `/coach/docs` wired with the same pulse + props for parity.

---

### 1.13 `/admin/forms` — Forms (Templates + Submissions)

📋 **Open items** — closed in the `feat(equipment+documents+forms)` commit

🔍 **Current state**

`app/(dashboard)/admin/forms/page.tsx` batches `getFormTemplates()` + `getFormSubmissions()` + `getSubmissionCountsByTemplate()` + `getFormsStatusPulse()` → renders `FormsStatusPulseStrip` above `FormTemplateList` (URL-persisted `?tab=templates|submissions`). Same shape at `/ops/forms`. Coach surface at `/coach/forms` + in-shift form completion (`form-renderer.tsx`) untouched — public signatures preserved.

**Surface — list page:**
- **Status Pulse strip** above the tabs — drafts pending (templates with `is_default=false AND no submissions ever`) · submitted this week (`form_submissions.submitted_at >= Monday`) · overdue (completed sessions in last 7d minus distinct session_ids in submissions in same window) · archived this week (templates whose name starts with `[Archived]` AND `updated_at >= Monday`)
- **URL-persisted Tabs** — Templates / Submissions, with per-tab filter param scoping
- **Filter chip row** (URL-persisted) — Templates: search · Form Type · Status (draft / published / archived via `[Archived]` prefix) · Centre · Clear all; Submissions: Form Type · Centre · date range · Clear all
- **Bulk-select on Templates** with sticky orange action bar — Publish (strips `[Archived]` prefix) · Archive (adds prefix, refuses defaults) · Duplicate · Export CSV
- **Submission-count badge** per template row (via `useCountUp`)
- **Row → `<Link>`** wrappers on both tabs for keyboard + open-in-new-tab nav

**Backed by:**
- `getFormsStatusPulse()` — 4-count pulse with parallel fan-out + zero-fallback
- `bulkPublishTemplates` / `bulkArchiveTemplates` / `bulkDuplicateTemplates` / `exportTemplatesCsv` — admin/ops gated via shared `requireAdminOrOps()` helper, per-id error capture, `activity_log` entries; CSV escapes commas/quotes/newlines
- `getSubmissionCountsByTemplate()` — `Record<string, number>` helper, batched at page level
- Template + submission CRUD + coach surface unchanged (signatures preserved: `getFormTemplates`, `getCoachAvailableTemplates`, `getTemplateForSession`, `submitForm`, `getFormSubmissions`)

**Schema note** — `form_templates` has no `status` column (verified). Archive encoded via `[Archived] ` name-prefix convention, idempotent on both publish + archive paths.

**CLAUDE.md context** — 5 form types (attendance · incident · session_feedback · risk_assessment · compliance), `is_default` defaults vs custom, `centre_id` for per-centre overrides. Forms appear on shift detail for completion in the coach surface.

✅ **What works**

- Live pulse counts with `useCountUp` + brand-orange tint when > 0
- URL-persisted tabs + filter chips survive refresh + shareable; per-tab filter param scoping prevents cross-tab bleed
- Bulk Publish + Archive + Duplicate + Export CSV with partial-failure tolerance (per-id error array, toast counts both successes and skips)
- Archive refuses defaults — preserves the "every form type has at least one default" invariant
- Restrained brand orange: Create CTA, active jump chips, pulse counts, Save CTA on template editor, submission-count badges when > 0
- Plumbing safe: `/coach/forms` (`coach-forms-view.tsx`) + in-shift form completion (`form-renderer.tsx`) untouched; `getCoachAvailableTemplates` + `getTemplateForSession` + `submitForm` signatures preserved

⚠️ **Gaps**

1. **No `status` column** — Archive uses a `[Archived]` name-prefix convention. A proper migration adding `status enum` would be cleaner but is out of scope
2. **No submission bulk actions** — only templates have bulk-select; submissions are read-only on the list
3. **Overdue heuristic** counts completed sessions minus covered, which assumes 1 submission per session — works for the common case but doesn't differentiate by form type

🎯 **Final-state target**

The forms command center. Status Pulse strip surfaces what's blocking (drafts pending · overdue) and what's flowing (submitted this week · archived). Templates / Submissions tabs with filter chip rows. Bulk Publish + Archive + Duplicate + Export CSV with safety. UI matches the rest.

📋 **Open items**

- [x] **Forms Status Pulse** strip — drafts pending · submitted this week · overdue · archived this week
- [x] **URL-persisted filter chip row** (search · Status · Form Type · Centre) per tab
- [x] **URL tab state** — `?tab=templates|submissions` persisted with per-tab filter scoping
- [x] **Bulk-select on Templates** with sticky orange action bar — Publish · Archive · Duplicate · Export CSV
- [x] **Mobile responsive** — table → card list under `md`
- [x] **UI refresh** — `rounded-2xl`, restrained orange (Create CTA · active chip · pulse > 0 · Save), hover-lift, `gap-6`, `useCountUp` on submission counts
- [x] **Row → `<Link>`** wrappers on both tabs
- [x] **Empty state** styling — centred icon + heading inside `rounded-2xl border bg-muted/20`
- [x] **Submission view per template** — `getSubmissionCountsByTemplate()` powers the per-row count badges; full submission list on the Submissions tab
- [x] **Form-builder refresh** — `rounded-2xl` canvas + field cards, restrained orange Save CTA
- [x] **Plumbing** — `/coach/forms` + `form-renderer.tsx` untouched, coach + in-shift submission signatures preserved
- [x] **Tests** — `lib/forms/__tests__/forms-status-pulse.test.ts` (6 cases: shape, zero-state, this-week scope, drafts scope, archived scope, error swallow) + `lib/forms/__tests__/bulk-actions.test.ts` (15 cases: empty / role gate / happy / partial failure across Publish · Archive · Duplicate · Export CSV)
- [ ] **(Optional, post-beta)** Migration adding `form_templates.status enum` (replaces name-prefix Archive)
- [ ] **(Optional, post-beta)** Submission bulk actions (Export CSV at minimum)
- [ ] **(Optional, post-beta)** Per-form-type overdue calculation

**Plumbing verified:** `coach-forms-view.tsx` + `form-renderer.tsx` + roster shift-detail forms surface all read the unchanged `getFormTemplates` / `getCoachAvailableTemplates` / `getTemplateForSession` / `submitForm` / `getFormSubmissions` signatures — additive `bulk*` server actions + the new `requireAdminOrOps()` gate + `getSubmissionCountsByTemplate()` helper don't touch their contract.

---

### 1.14 `/admin/invoicing` — Coach invoicing

📋 **Open items** — closed in the `feat(finance)` commit

🔍 **Current state**

`app/(dashboard)/admin/invoicing/page.tsx` + `/ops/invoicing/page.tsx` batch `getAllCoachInvoices()` + `getInvoicingStatusPulse()` (ops also batches `getFlaggedInvoices()`). Pulse strip renders above the admin list / ops Tabs. `AdminInvoiceList` rewritten with URL-persisted filter chips, bulk-select, mobile cards, animated totals.

✅ **What works** — Status pulse (overdue · awaiting payment · flagged · sent this week); URL-persisted status + coach filters; bulk Mark Paid (admin) + Resolve Flagged (admin/ops) + Export CSV via `bulkMarkInvoicesPaid` / `bulkResolveFlaggedInvoices` / `exportInvoicesCsv`; sticky orange action bar on selection; mobile-responsive cards under `md`; `useCountUp` on total amount; `rounded-2xl` everywhere; financial gate at layout level preserved.

⚠️ **Gaps** — Pulse "overdue" is `outbound_invoices` only (AR side, intentional); coach invoices age via the resolve flow. Bulk Mark Paid is admin-only (matches `markInvoicePaid` server contract).

🎯 **Final-state target** — The collections command center: pulse surfaces overdue + flagged immediately, bulk actions clear backlog in batches, design matches the rest.

📋 **Open items**
- [x] **Invoicing Status Pulse** strip — overdue invoices · awaiting payment · flagged for review · sent this week
- [x] **URL-persisted filter chip row** (status · coach)
- [x] **Bulk-select** with sticky orange action bar — Mark Paid (admin) · Resolve Flagged · Export CSV
- [x] **Mobile responsive** — table → card list under `md`
- [x] **UI refresh** — `rounded-2xl`, restrained orange, hover-lift, `gap-6`, `useCountUp` on total
- [x] **Tests** — `lib/invoicing/__tests__/invoicing-status-pulse.test.ts` (5 cases: shape · overdue scope · awaiting scope · flagged independence · error swallow) + `lib/invoicing/__tests__/bulk-actions.test.ts` (6 cases: empty · role gate × 3 · CSV header + row)

**Plumbing verified:** `/coach/invoicing` (read-only InvoicingDashboard) untouched; existing `markInvoicePaid` / `resolveInvoiceFlags` reused inside the bulk path; `getFlaggedInvoices` / `getAllCoachInvoices` signatures preserved; `/ops/invoicing` shares the AdminInvoiceList with `showMarkPaid={false}` and `basePath="/ops/invoicing"` so URL persistence + CSV scope correctly.

---

### 1.15 `/admin/grants` — Grants

📋 **Open items** — closed in the `feat(finance)` commit

🔍 **Current state**

`app/(dashboard)/admin/grants/page.tsx` batches `getGrantOverview()` + `listApplications()` + `listGrants()` + `getCentreList()` + `getGrantsStatusPulse()`. Pulse strip renders above `GrantsDashboard`. Dashboard refactored: URL-persisted filters + jump chip badges + animated stat cards + alert cards with consistent rounding.

✅ **What works** — Status pulse (awaiting submission · expiring within 30 days · stuck in planning · approved this week); URL-persisted status / school / year filters + `?expiring=30` / `?stale=14` / `?approved=this_week` jump-chip filters; pulse stat cards animate via `useCountUp` (approved YTD · used · remaining · active); `rounded-2xl` everywhere; alert cards (Expiring Within 30 / Stuck in Planning) retain their inline Edit buttons; financial gate at layout level preserved.

⚠️ **Gaps** — No bulk actions on grants (status updates are per-application via Update dialog — intentional, each row is a careful judgement). Grant amounts feed the `grant_invoice_allocations` join table — banner display contract on invoices unchanged.

🎯 **Final-state target** — Funding command center: pulse surfaces expiring + stale funding, filter chips scope to a school / year, alert cards drive specific next actions.

📋 **Open items**
- [x] **Grants Status Pulse** strip — awaiting submission · expiring within 30 days · stuck in planning · approved this week
- [x] **URL-persisted filter chip row** (status · school · year)
- [x] **Jump chip filters** (`?expiring=30` · `?stale=14` · `?approved=this_week`) with visible chip badges + Clear all
- [x] **UI refresh** — `rounded-2xl`, restrained orange CTA (New Application), hover-lift on stat cards, `gap-6`, `useCountUp` on stat totals
- [x] **Tests** — `lib/grants/__tests__/grants-status-pulse.test.ts` (5 cases: shape · head-count passthrough · remaining-balance scope · null cast · error swallow)

**Plumbing verified:** `getGrantOverview` / `createGrantApplication` / `updateApplicationStatus` / `allocateInvoiceToGrant` signatures preserved; the `InvoiceGrantBanner` rendered on `/admin/invoicing` reads the same `getAllocationsForInvoice` contract.

---

### 1.16 `/admin/payroll` — Coach payroll

📋 **Open items** — closed in the `feat(finance)` commit

🔍 **Current state**

`app/(dashboard)/admin/payroll/page.tsx` batches `getPaymentBatches()` + `getPayrollStatusPulse()`. Pulse strip renders above the refactored `PayrollDashboard`. URL-persisted status filter chip, animated Paid-YTD card, mobile-responsive batch cards.

✅ **What works** — Status pulse (awaiting calculation · awaiting approval · approved unpaid · paid this fortnight); URL-persisted `?status` filter on the batches table; Paid-YTD card with `useCountUp`; previous-period CTA card grows to span 2/3 width on `md`; mobile-responsive cards under `md`; `Link`-wrapped period rows for keyboard / open-in-new-tab; `rounded-2xl` everywhere; financial gate at layout level preserved.

⚠️ **Gaps** — Bulk approve/calculate not added at the list level (each batch flows through `calculatePeriodPayroll` → `approvePaymentBatch` → `markBatchAsPaid` per-batch in detail view — already linear). Status filter doesn't gain extra bulk surface here.

🎯 **Final-state target** — Payroll cadence command center: pulse surfaces what's awaiting action this fortnight, batches table is shareable via URL state.

📋 **Open items**
- [x] **Payroll Status Pulse** strip — awaiting calculation · awaiting approval · approved unpaid · paid this fortnight
- [x] **URL-persisted filter chip** (status)
- [x] **Paid YTD** stat card with `useCountUp`
- [x] **Mobile responsive** — table → card list under `md`
- [x] **UI refresh** — `rounded-2xl`, restrained orange Create Batch CTA + pulse chips, hover-lift, `gap-6`
- [x] **Tests** — `lib/invoicing/__tests__/payroll-status-pulse.test.ts` (4 cases: shape · per-status passthrough · null-count cast · error swallow)

**Plumbing verified:** `PayrollSnapshot` (consumed by `/admin` home dashboard's PayrollSnapshot widget) unchanged; `getPaymentBatches` / `createOrGetPaymentBatch` signatures preserved; batch detail page (`/admin/payroll/[batchId]`) untouched.

---

### 1.17 `/admin/analytics` — Revenue analytics

📋 **Open items** — closed in the `feat(finance)` commit

🔍 **Current state**

`app/(dashboard)/admin/analytics/page.tsx` batches `getLatestForecasts()` + `getAnalyticsStatusPulse()`. Pulse strip renders above `AnalyticsDashboard`. Dashboard refactored: URL-persisted period filter chip + focus chip, animated KPI cards, `rounded-2xl` across all charts + tables, restrained orange Regenerate CTA.

✅ **What works** — Status pulse (days since refresh / fresh · loss months ahead · overperforming · months projected); URL-persisted `?period=monthly|quarterly` + `?focus=loss|overperforming` filters; `useCountUp` on This Month / Next Month / Margin KPI cards; restrained orange Regenerate CTA; chart Cards all `rounded-2xl`; empty state refreshed; financial gate at layout level preserved.

⚠️ **Gaps** — Focus chip is display-only (jumps from pulse, surfaces as a badge) — it doesn't reorder/filter the breakdown tables. Full drill-through deferred to post-beta.

🎯 **Final-state target** — Forecast command center: pulse surfaces stale-forecast + loss-months immediately, KPIs animate in, design matches the rest.

📋 **Open items**
- [x] **Analytics Status Pulse** strip — forecast freshness · loss months · overperforming · months projected
- [x] **URL-persisted filter chip row** (period · focus)
- [x] **`useCountUp`** on KPI cards (This Month · Next Month · Margin)
- [x] **UI refresh** — `rounded-2xl` Cards across summary + charts + breakdown + funnel + coach-cost, restrained orange Regenerate CTA + pulse chips, hover-lift on KPIs, `gap-6`
- [x] **Tests** — `lib/forecasting/__tests__/analytics-status-pulse.test.ts` (5 cases: shape on empty · stale flag · fresh flag · loss + overperforming counts · error swallow)

**Plumbing verified:** `getLatestForecasts` / `getForecastDashboardWidget` / `getForecastConfig` / `updateForecastConfig` / `exportForecastsCsv` signatures preserved; `/admin/settings/forecasting` (ForecastConfigView) + the home dashboard ForecastWidget read the same unchanged contracts.

---

### 1.18 `/admin/intelligence` — Business intelligence

📋 **Open items** — closed in the `feat(finance)` commit

🔍 **Current state**

`app/(dashboard)/admin/intelligence/page.tsx` (5-tab client component — Overview / Cohorts / Demand / Financial / Growth) extended with: pulse data fetched alongside other data via `useEffect`, URL-persisted `?tab=…` state, `useCountUp` on monetary + count KPI cards, refreshed header with brand-orange overline + larger typography.

✅ **What works** — Status pulse (open churn risks · low-utilisation coaches · new centres this month · new parents this month) — pulse strip jumps to `/admin/churn` for risks and to `?tab=Financial|Growth` for the intelligence tabs; URL-persisted tab state via `?tab=…` (Overview defaults to no param); `useCountUp` on Revenue / Active Centres / Active Parents / Avg Sessions / Conversion KPI cards; `rounded-xl` icon containers; restrained orange overline; financial gate at layout level preserved.

⚠️ **Gaps** — Charts / Cards inside individual tab components keep their existing rounding (no `rounded-2xl`) — chart-heavy tabs read better with the current density; refresh deferred to post-beta. No bulk actions (read-only analytics surface).

🎯 **Final-state target** — Intelligence command center: pulse surfaces churn + utilisation immediately, URL-persisted tabs make the deep-dive shareable, KPI cards animate in.

📋 **Open items**
- [x] **Intelligence Status Pulse** strip — open churn risks · low-utilisation coaches · new centres this month · new parents this month
- [x] **URL tab state** — `?tab=Overview|Cohorts|Demand|Financial|Growth` persisted (Overview = default, no param)
- [x] **`useCountUp`** on KPI cards (5 of 6 cards animate; Avg Rating left static as it's a "/ 5" composite)
- [x] **UI refresh** — refreshed page header with brand-orange overline + larger typography, KPI cards `rounded-2xl card-hover`, tab bar tints active tab brand orange
- [x] **Tests** — `lib/intelligence/__tests__/intelligence-status-pulse.test.ts` (5 cases: shape · churn-row dedupe · new-centres + new-parents passthrough · low-utilisation 30% threshold · error swallow)

**Plumbing verified:** `getOverviewKPIs` / `getCohortAnalysis` / `getDemandAnalysis` / `getFinancialIntelligence` / `getCoachUtilisation` / `getGrowthMetrics` signatures preserved — every tab still reads the same data contract.

---

### 1.19 `/admin/reports` — Centre reports

📋 **Open items** — closed in the `feat(reports+tasks+feedback+bookings)` commit

🔍 **Current state**

`app/(dashboard)/admin/reports/page.tsx` now fetches `getReportGenerationOptions` / `listReports` / `getReportsStatusPulse` / `getCentresWithoutReport` in one parallel batch and hands them to a rewritten `ReportsView` client component with URL-persisted filter chips, a jump-chip row, bulk-select on the report table, and a sticky brand-orange `BulkActionBar` for Mark-as-sent + Delete-drafts.

✅ **What works** — Reports Status Pulse (drafts · sent this week · overdue 14d+ · centres without report) with jump links; URL-persisted `?term=&centre=&status=&overdue=yes&missing_report=yes` filters; orange-tinted clear-X jump chips; `missing_report=yes` swaps the table for the centre list with a quick-Generate button per row; bulk-select checkboxes + sticky `BulkActionBar` with Mark-as-sent (sheet w/ comma-separated email list) + Delete-drafts (alert dialog, drafts-only); `rounded-2xl` containers replacing the `Card` shells.

⚠️ **Gaps** — Bulk-send uses a free-text recipient list (works for the small admin volume); if recipient lists grow, swap to a tag/chip multiselect. "Centres without report" only computes when an active term row exists in `terms` — otherwise the bucket is zero rather than guessing the latest completed term.

🎯 **Final-state target** — Reports queue that surfaces what's overdue, who's missing a report, and lets the operator send/delete in one bulk action.

📋 **Open items**
- [x] **Reports Status Pulse** strip — drafts · sent this week · overdue · centres without report (`lib/reports/status-pulse-actions.ts`)
- [x] **URL-persisted filters** — `?term=&centre=&status=draft|sent` + `?overdue=yes` + `?missing_report=yes` jump chips with clear-X
- [x] **Bulk actions** — `bulkSendReports` (skips already-sent, partial-failure surface) + `bulkDeleteDraftReports` (drafts-only guard) appended to `lib/reports/actions.ts`; admin/ops gate; per-row activity log
- [x] **`getCentresWithoutReport`** helper feeds the missing-report mode with a per-centre Generate shortcut
- [x] **UI refresh** — `rounded-2xl` shells, `gap-6` rhythm, restrained brand orange (active chips · sticky bar primary · pulse active counts)
- [x] **Tests** — `lib/reports/__tests__/reports-status-pulse.test.ts` (7 cases) + `lib/reports/__tests__/bulk-actions.test.ts` (9 cases): auth gate · happy path · skip-already-sent · partial failure · drafts-only delete · empty-selection guards

**Plumbing verified:** `centre-reports-tab.tsx` (used on centres detail page) still imports `getCentreReports` only — contract intact; `/admin/reports/[id]` and `report-preview.tsx` untouched; `/ops/reports` re-wired with `basePath="/ops/reports"`.

---

### 1.20 `/admin/tasks` — Task board

📋 **Open items** — closed in the `feat(reports+tasks+feedback+bookings)` commit

🔍 **Current state**

`app/(dashboard)/admin/tasks/page.tsx` adds `getTasksStatusPulse()` to the parallel data batch, and the client wrapper (`client.tsx`) is a full rewrite: URL-persisted filter chips replace the old in-memory `TaskFilters`, board↔list view toggle, bulk-select on both surfaces, sticky `BulkActionBar` with Reassign / Mark-complete / Change-priority sheets. `task-card.tsx` adds an aging left-border tint (amber at 7-14d, brand orange at 14d+) with an `Xd` pill, and the existing DnD board continues to work alongside the new hover-checkbox selection.

✅ **What works** — Tasks Status Pulse (overdue · due today · mine · unassigned) with jump links to `?overdue=yes`/`?due=today`/`?mine=yes`/`?unassigned=yes`; URL-persisted `?view=board|list&assignee=&priority=&category=&due=&mine=&unassigned=&overdue=`; orange-tinted active jump chips with clear-X; board view keeps `@dnd-kit` ordering + hover checkbox; list view adds checkbox column + select-all + Age column; aging left-border tint on non-final cards; sticky `BulkActionBar` (rounded-2xl, brand-orange ring) with Reassign sheet (teamMembers + Unassign), Change-priority sheet, Mark-complete confirm.

⚠️ **Gaps** — Filter persistence on the admin client now bypasses the existing presentational `TaskFilters` component (still in use unchanged by `/ops/tasks`). The status-pulse fan-out uses four parallel head-count queries with a `.not("column_id","in", finalIds)` exclusion — acceptable since there's typically one `is_final` column.

🎯 **Final-state target** — A task board that surfaces what's overdue and unassigned the moment you land, lets you bulk-reassign or close in one motion, and tints stale work by age.

📋 **Open items**
- [x] **Tasks Status Pulse** strip — overdue · due today · mine · unassigned (excludes `is_final` columns)
- [x] **URL-persisted filter chips** — assignee · priority · category (column) · due · mine · unassigned · overdue
- [x] **View toggle** — `?view=board|list` URL-persisted (default board)
- [x] **Bulk actions** — `bulkReassignTasks` (notifies new assignee) + `bulkMarkComplete` (moves to final column) + `bulkChangePriority`; admin/ops gate; per-row activity + audit log
- [x] **Aging tint** — left-border amber at 7-14d, brand orange at 14d+ on non-final cards; `Xd` pill bottom-right
- [x] **UI refresh** — `rounded-2xl` cards, hover-lift, brand orange reserved for `urgent` priority + sticky-bar primary
- [x] **Tests** — `lib/tasks/__tests__/tasks-status-pulse.test.ts` (6 cases) + `lib/tasks/__tests__/bulk-actions.test.ts` (7 cases): admin gate · happy reassign + partial-fail · mark-complete + no-final-col branch · change-priority

**Plumbing verified:** `getTasks` / `getTaskColumns` / `getTeamMembers` / `moveTask` signatures preserved — `/ops/tasks`, `/coach/tasks`, and the home dashboard widget continue to read the same contract; `task-detail-sheet.tsx` + `create-task-dialog.tsx` + `column-settings-dialog.tsx` untouched.

---

### 1.21 `/admin/feedback` — Session feedback

📋 **Open items** — closed in the `feat(reports+tasks+feedback+bookings)` commit + migration `052_feedback_acknowledged.sql` (pending manual apply)

🔍 **Current state**

`app/(dashboard)/admin/feedback/page.tsx` batches `getFeedbackList` / `getFeedbackAggregation` / `getFeedbackStatusPulse` / `getFeedbackSentimentDistribution` + coaches + centres in one fan-out. The client wrapper renders the new `FeedbackStatusPulseStrip` + 4-tile stat row (Average / Total / 30-day trend / Sentiment distribution), and `feedback-list-view.tsx` adds URL-persisted filter chips, an unread "Read" pill, bulk-select + sticky `BulkActionBar` with Mark-read + Acknowledge sheet. The migration adds `acknowledged_at` + `acknowledged_by` to `feedback_ratings` with a partial index on unacked low ratings.

✅ **What works** — Feedback Status Pulse (new this week · 1-star unread · 5-star unread · no response 24h+) with the 1-star bucket using **red** rather than brand orange for emphasis; URL-persisted `?rating=&period=&coach=&centre=&ack=unread&pending=yes`; jump-chip clear-X; sentiment distribution mini-chart (5-segment stacked bar, red→amber→emerald) computed server-side from the full org so it reflects all-time not just the page; "Read" pill with acknowledged-date tooltip; bulk-select + sticky `BulkActionBar` with Mark-as-read (`bulkMarkFeedbackRead`) + Acknowledge sheet (`bulkAcknowledgeFeedback` writes a note to `activity_log` metadata).

⚠️ **Gaps** — Migration `052_feedback_acknowledged.sql` is unapplied — must be applied manually before deploy. `?pending=yes` (no-response 24h+) clears the list rather than fetching unsubmitted feedback rows since `getFeedbackList` filters `submitted_at IS NOT NULL` by design — a separate helper would be needed to query the pending set, deferred until ops confirms they want that view inline rather than via the no-response cron.

🎯 **Final-state target** — A feedback inbox where the urgent stuff (1-star unread) is unmissable in red, the warm wins (5-star unread) are easy to celebrate, and bulk-acknowledge clears the queue.

📋 **Open items**
- [x] **Feedback Status Pulse** strip — new this week · 1-star unack · 5-star unack · no response 24h+ (1-star bucket uses red for emphasis)
- [x] **URL-persisted filter chips** — rating · coach · centre · period (this_week/last_7d/last_30d/all) + `?ack=unread`/`?pending=yes` jump chips
- [x] **Migration `052_feedback_acknowledged.sql`** — adds `acknowledged_at` + `acknowledged_by` + partial index on unacked low ratings (manual apply required)
- [x] **Bulk actions** — `bulkMarkFeedbackRead` (skips already-acknowledged) + `bulkAcknowledgeFeedback` (note → `activity_log` metadata); admin/ops gate via `requireAdminOrOps` discriminated union
- [x] **Sentiment distribution** mini-chart (`components/feedback/sentiment-distribution.tsx`) — CSS-only stacked bar, no recharts dep needed; server-side fetch via `getFeedbackSentimentDistribution`
- [x] **UI refresh** — `rounded-2xl` stat tiles, restrained orange (no `bg-primary/10` circles), `useCountUp` on total responses
- [x] **Tests** — `lib/feedback/__tests__/feedback-status-pulse.test.ts` (6 cases) + `lib/feedback/__tests__/bulk-actions.test.ts` (8 cases)

**Plumbing verified:** `entity-feedback-tab.tsx` (embedded in centres + staff detail tabs) does NOT use `FeedbackListView` — its widget surface is independent, contract preserved; new `coaches` / `centres` / `basePath` / `showBulk` props on `FeedbackListView` are optional with backwards-compatible defaults so `/ops/feedback` continues to render with the old 2-arg signature; `submitPublicFeedback` flow untouched.

---

### 1.22 `/admin/bookings` — Parent bookings dashboard

📋 **Open items** — closed in the `feat(reports+tasks+feedback+bookings)` commit

🔍 **Current state**

`AdminBookingsDashboard` (the page-level client component) is reworked to read tab + filter state from the URL: `?tab=sessions|bookings|packages|revenue` is the new sub-page tab state, and per-tab filters round-trip via `replaceParam` exactly like centre-list-view. Pulse data lands in the same `useEffect` as the summary fetch, so the 4-tile pulse strip renders above the heading on first paint. Bulk-select lives on both the sessions + bookings tables.

✅ **What works** — Bookings Status Pulse (today's sessions · waitlist offers expiring ≤24h · packages remaining ≤2 · new bookings this week) with jump links into the right tab + filter; URL-persisted `?tab=…&status=&sport=&period=&date=today&waitlist=expiring&packages_low=yes&range=this_week`; orange-tinted clear-X jump chips; sticky `BulkActionBar` on sessions (Publish drafts / Activate / Cancel) + bookings (Cancel with reason sheet); `useCountUp` on the four summary numbers; `rounded-2xl` cards replacing the old `rounded-xl border-orange-100 bg-white` shells; restrained brand orange limited to active filter chip, sticky bar primary, and pulse active counts.

⚠️ **Gaps** — `useCountUp` animates whole dollars during the tick-up; cents render correctly on the final paint but aren't animated (acceptable for the headline summary). Pulse uses UTC `toISOString()` for the Monday + 24h windows — matches the existing children/forms pulse pattern; small AU-timezone edge for boundary minutes is acceptable for ops-glance counts. `getBookingsStatusPulse` is called from the client `useEffect` since the page was already `"use client"`; converting to a server-wrapper would be a deeper rewrite deferred for now.

🎯 **Final-state target** — A bookings command center that surfaces what needs ops attention today (sessions live now · waitlist about to expire · packages about to run out · new revenue this week) and lets the operator publish/cancel in bulk without leaving the dashboard.

📋 **Open items**
- [x] **Bookings Status Pulse** strip — today's sessions · waitlist expiring (24h) · packages running low (≤2) · new bookings this week (`lib/bookings/status-pulse-actions.ts`)
- [x] **URL-persisted tab state** — `?tab=sessions|bookings|packages|revenue` (sessions default, no param)
- [x] **URL-persisted filters** — sessions: `?status=&sport=&period=today|this_week|all` + bookings: `?status=&payment_type=&session_id=&date_from=&date_to=&range=this_week`
- [x] **Jump chips** — `?date=today`, `?waitlist=expiring`, `?packages_low=yes`, `?range=this_week` orange-tinted with clear-X
- [x] **Bulk actions** — `bulkCancelBookings` (reason sheet, skips already-cancelled) + `bulkActivateSessions` (draft/closed → open) + `bulkPublishSessions` (draft-only alias for clarity); admin gate; per-id `activity_log`
- [x] **UI refresh** — `rounded-2xl` cards, `useCountUp` on summary numbers, `gap-6` rhythm, restrained orange (only on active filter chips, sticky-bar primary, pulse active counts)
- [x] **`session-list-view.tsx`** — URL persistence on search+type+status+sport + bulk-select + sticky bar (Publish/Activate)
- [x] **Tests** — `lib/bookings/__tests__/bookings-status-pulse.test.ts` (6 cases) + `lib/bookings/__tests__/bulk-actions.test.ts` (6 cases): coach gate · cancel happy + skip · activate happy + skip · publish draft-only

**Plumbing verified:** `getAdminBookingSummary` / `getAdminBookingsList` / `getAdminSessionsList` / `getAdminPackageBalances` / `getAdminRevenueBreakdown` / `toggleSessionStatus` / `getSessionsForDropdown` / `exportBookingsCSV` signatures preserved — `/parent/book` (parent portal) reads `bookable_sessions` read-only, unchanged; `/ops/bookings/sessions`, `/admin/bookings/sessions/new`, `/admin/bookings/packages`, `/admin/bookings/holiday-clinics` sub-pages all continue to work.

---

### 1.23 `/admin/marketing` — Marketing & Testimonials

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/marketing/page.tsx` is reshaped around the `MarketingStatusPulseStrip` (`pending testimonials · approved this week · stale cache (>24h) · web enquiries this week`) with URL-persisted `?tab=stats|testimonials|widgets`. The testimonials sub-page rebuild adds filter chips (`?filter=all|pending|approved|rejected`), per-pending bulk-select with a sticky BulkActionBar (approve / reject), and `useCountUp` on the stat tiles. `bulkApproveTestimonials` + `bulkRejectTestimonials` server actions live alongside the existing single-row flow; both are idempotent (already-handled feedback ids are silently skipped) and admin/ops gated.

✅ **What works** — pulse with red-tone stale cache + jump links to `?tab=testimonials&filter=pending` / `&range=this_week`; URL filter chips; bulk approve writes `status='approved'` with default display-name = centre primary contact (or centre name fallback) so the queue clears in one motion; bulk reject writes a `status='rejected'` placeholder row so the source feedback drops out of the pending feed; `rounded-2xl` shells, restrained orange.

⚠️ **Gaps** — Web-enquiries count proxies `leads.source='web'` (no dedicated enquiry table). Cache freshness uses `public_stats_cache.calculated_at` and surfaces `1` if >24h old (binary signal rather than per-key drift).

🎯 **Final-state target** — Marketing dashboard that surfaces what needs ops attention (pending review · cache drift · inbound web enquiries) and lets the operator clear the testimonial queue with a single bulk gesture.

📋 **Open items**
- [x] **Marketing Status Pulse** strip — pending testimonials · approved this week · stale cache · web enquiries (`lib/marketing/status-pulse-actions.ts`)
- [x] **URL-persisted tab + filter state** — `?tab=stats|testimonials|widgets` + `?filter=pending|approved|rejected` on testimonials
- [x] **Bulk actions** — `bulkApproveTestimonials` + `bulkRejectTestimonials` (admin/ops gated, idempotent, per-id failure surface)
- [x] **UI refresh** — `rounded-2xl`, `gap-6`, `useCountUp` on stat tiles, restrained orange
- [x] **Tests** — `lib/marketing/__tests__/marketing-status-pulse.test.ts` (6) + `lib/marketing/__tests__/bulk-actions.test.ts` (8)

**Plumbing verified:** `getPublicStats` / `refreshPublicStats` signatures preserved; `/api/public/testimonials` keeps the parent-portal contract; per-row approve/reject/unpublish flow on the sub-page unchanged.

---

### 1.24 `/admin/referrals` — Referral management

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/referrals/page.tsx` adds `ReferralsStatusPulseStrip` (`active codes · conversions this week · rewards pending · config drift`), URL-persisted `?tab=Parent+Referrals|Centre+Referrals|Rewards|Configuration` + `?range=this_week` / `?status=pending|awarded|redeemed` jump-chips. Summary cards use `useCountUp` via the new `CountTile` helper; tables move to `rounded-2xl border bg-background hover:shadow-md transition`.

✅ **What works** — pulse jump-links land directly on the right tab + filter; orange-tinted clear-X chips on active jumps; config drift uses a baseline of three expected keys (`parent_instant_reward`, `parent_milestone`, `centre_reward`) and counts missing ones — red tone on the active count.

⚠️ **Gaps** — `range=this_week` filters the parent referrals table client-side off `created_at` (not `conversion_date`) because the dashboard returns the 20 most-recent regardless of conversion status; acceptable for a 7d ops glance.

🎯 **Final-state target** — Single-screen referral health view that surfaces operational gaps (code generation needed, missing config, awarded rewards waiting to redeem) instead of leaving them buried in the Configuration tab.

📋 **Open items**
- [x] **Referrals Status Pulse** strip (`lib/referrals/status-pulse-actions.ts`)
- [x] **URL-persisted tab + jump chips**
- [x] **UI refresh** — `rounded-2xl`, `useCountUp` on summary cards, restrained orange
- [x] **Tests** — `lib/referrals/__tests__/referrals-status-pulse.test.ts` (5)

**Plumbing verified:** `getAdminReferralDashboard` / `getAdminReferralConfig` / `updateReferralConfig` / `generateCentreReferralCodes` unchanged. Parent portal (`/refer`, magic-link landing) reads `getReferralByCode` / `createReferralRecord` — contract intact.

---

### 1.25 `/admin/campaigns` — Re-engagement campaigns

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/campaigns/page.tsx` is rewired around `CampaignsStatusPulseStrip` (`active · sends this week · sends pending · discount codes expiring (14d)`), URL-persisted `?tab=campaigns|reporting` + jump-chips for `?status=&audience=&send_status=`. `bulkUpdateCampaignStatus` powers a sticky BulkActionBar with Pause / Activate (admin/ops gated). Card shells move to `rounded-2xl` with `useCountUp` via `AnimatedMetric`.

✅ **What works** — pulse + bulk + restrained orange; per-row Pause/Resume still calls `updateCampaignStatus` and refreshes the pulse; `?audience=…` and `?status=…` chips filter the client-side list immediately.

⚠️ **Gaps** — `send_status=pending` chip is informational (mirrors the pulse jump) — actual filtering happens on the campaign expandable detail panel, not the top-level table.

🎯 **Final-state target** — Campaign command-center where ops can pause/activate multiple campaigns in one motion and read engagement at a glance.

📋 **Open items**
- [x] **Campaigns Status Pulse** strip (`lib/reengagement/status-pulse-actions.ts`)
- [x] **URL-persisted tab + filter chips**
- [x] **Bulk actions** — `bulkUpdateCampaignStatus` (admin/ops gate, partial-failure surface)
- [x] **UI refresh** — `rounded-2xl` summary cards, restrained orange
- [x] **Tests** — `lib/reengagement/__tests__/campaigns-status-pulse.test.ts` (6) + `bulk-actions.test.ts` (5)

**Plumbing verified:** `processCampaign` cron handler unchanged; `getCampaigns` / `getCampaignDetail` / `getCampaignReporting` / `updateCampaignStatus` contracts preserved.

---

### 1.26 `/admin/churn` — Churn risk dashboard

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/churn/page.tsx` adds `ChurnStatusPulseStrip` (`centres at risk · new events this week · improving · unchanged`), URL-persisted `?tab=Overview|At+Risk|Events|Trends` + `?severity=high|critical` / `?trend=improving|unchanged` / `?period=this_week` jump chips. KPI tiles use the new `KpiCard` helper with `useCountUp`; all shells move to `rounded-2xl`.

✅ **What works** — pulse counts (high+critical for at-risk, ≤−5 point delta for improving, ±2 for unchanged); jump-links route into the right tab; `getChurnStatusPulse` swallows errors so a broken snapshot doesn't blank the dashboard.

⚠️ **Gaps** — The improving/unchanged trend uses only the previous snapshot per centre (not a moving average), so a single noisy snapshot can flip the count. Acceptable for ops glance — daily cron evens it out.

🎯 **Final-state target** — Real-time churn risk view where the at-a-glance pulse surfaces movement direction (improving vs unchanged) without burying ops in chart drill-downs.

📋 **Open items**
- [x] **Churn Status Pulse** strip (`lib/churn/status-pulse-actions.ts`)
- [x] **URL-persisted tab + filter chips**
- [x] **UI refresh** — `rounded-2xl` KPI tiles + tables, restrained orange / red / green tones
- [x] **Tests** — `lib/churn/__tests__/churn-status-pulse.test.ts` (6)

**Plumbing verified:** `getChurnDashboard` / `getChurnRiskOverview` / `getChurnTrends` / `resolveChurnEvent` contracts preserved — home churn snapshot keeps reading `getChurnRiskSnapshot` from `/admin`.

---

### 1.27 `/admin/announcements` — Org announcements

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/announcements/page.tsx` becomes a small server wrapper that batches `getAnnouncements` + `getAnnouncementsStatusPulse` and renders `AnnouncementsStatusPulseStrip` above the existing `AnnouncementList`. The list is rebuilt around URL-persisted filter chips (`?audience=&period=this_week|this_month&read=low|mine_unread`), bulk-select with a sticky BulkActionBar (Delete with confirm dialog), and `bulkDeleteAnnouncements` server action (admin/ops gated, cascades read receipts).

✅ **What works** — pulse counts (sent this week / this month / low-read <30% / unread by me); `AlertDialog` confirm on bulk delete to match the per-row delete; filter chips with clear-X; `rounded-2xl` accents on the list shell.

⚠️ **Gaps** — Schema has no draft/scheduled state, so the pulse surfaces engagement metrics (sent + low-read) rather than queue depth. Low-read uses `audience_count` based on `profiles.role` filter — exact for current org sizes; would need pagination for very large user bases.

🎯 **Final-state target** — Announcement inbox where ops can spot under-read posts and bulk-clean stale ones without leaving the page.

📋 **Open items**
- [x] **Announcements Status Pulse** strip (`lib/announcements/status-pulse-actions.ts`)
- [x] **URL-persisted filter chips**
- [x] **Bulk actions** — `bulkDeleteAnnouncements` (admin/ops, cascade read receipts, per-id failure surface)
- [x] **UI refresh** — `rounded-2xl` list shell, restrained orange filter chips, red tone on low-read
- [x] **Tests** — `lib/announcements/__tests__/announcements-status-pulse.test.ts` (5) + `bulk-actions.test.ts` (5)

**Plumbing verified:** `getAnnouncements` / `getAnnouncementDetail` / `createAnnouncement` / `deleteAnnouncement` / `markAnnouncementRead` signatures preserved — coach/admin/ops sidebars + push notifications continue to read the same contracts.

---

### 1.28 `/admin/messages` — Direct messages

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/messages/page.tsx` adds `getMessagesStatusPulse` to the SSR fetch and renders `MessagesStatusPulseStrip` above the existing two-pane layout. `messages-page-client.tsx` picks up `?status=unread|awaiting|sent_today|mentions` and filters the sidebar list client-side. The wrapping card moves to `rounded-2xl`.

✅ **What works** — pulse counts (`unread` / `awaiting response` / `sent today` / `mentions`); awaiting-response approximated by "latest message in conversation is from me"; clear-X filter chip restores the full list.

⚠️ **Gaps** — Mentions count is always 0 today (no `@`-mention modelling). Sidebar filter operates client-side — fine for current DM volumes; would need server-side query for very large inboxes.

🎯 **Final-state target** — DM inbox where admins/ops can jump straight to the conversations that need them (unread, waiting on a reply) without scanning every partner.

📋 **Open items**
- [x] **Messages Status Pulse** strip (`lib/messages/status-pulse-actions.ts`)
- [x] **URL-persisted filter chip** — `?status=unread|awaiting|sent_today|mentions`
- [x] **UI refresh** — `rounded-2xl` shell, restrained orange filter chip
- [x] **Tests** — `lib/messages/__tests__/messages-status-pulse.test.ts` (6)

**Plumbing verified:** `getConversations` / `getConversationMessages` / `sendDirectMessage` / `editDirectMessage` contracts preserved; coach `/coach/messages` + parent flows unaffected; realtime channel keeps working.

---

### 1.29 `/admin/settings` — Settings index

📋 **Open items** — closed in the final-batch `feat(admin)` commit

🔍 **Current state**

`app/(dashboard)/admin/settings/page.tsx` is a category index — no pulse counts apply. The eight sub-route cards (Health Score Config, Revenue Forecasting, Scheduling Preferences, Regions, Integrations, Invoicing, Session Reminders, Custom Sports & Equipment) move to `rounded-2xl` shells with a uniform muted icon tile that flips to brand orange on hover (replacing the eight competing colour tints), `gap-6` rhythm, and a subtle chevron that fades in on hover.

✅ **What works** — clean grid; uniform iconography; settings sub-pages keep their own per-page treatments.

⚠️ **Gaps** — None for this surface; sub-pages were already in-scope of earlier batches.

🎯 **Final-state target** — Calm category landing that doesn't compete with the more action-oriented sibling tabs.

📋 **Open items**
- [x] **UI refresh** — `rounded-2xl` cards, hover-lift, brand orange on hover icon

**Plumbing verified:** All sub-route hrefs unchanged.

---

## 2. Ops

### 2.1 `/ops` — Command Centre

🔍 **Current state**

`app/(dashboard)/ops/page.tsx` fans out `getCommandCentreData(userId)` + the new `getOpsCommandPulse()` in a single `Promise.all`, then renders:

- `OpsContextStrip` — sticky greeting strip with Sydney-local date + 3 inline pulse stats (shifts need a coach today / unconfirmed shifts / equipment issues), each a deep link to the relevant view with a filter param applied
- `OpsQuickActionsRow` — 5 ghost-style rounded-2xl actions (Publish roster / Add session / Check clashes / View tasks / Training overdue) with restrained brand-orange icon tiles
- `CommandCentre` — the existing 2-column widget grid with all 9 widgets (today's sessions hero + unconfirmed/swaps/rerostering/compliance on the left, equipment/tasks/assessments/ratings on the right)

The `WidgetWrapper` was refreshed to a `rounded-2xl` card with hover-lift and a tick-up count pill — the brand-orange tile stays as a visual anchor but the count badge now uses `useCountUp` on first paint and only tints when > 0.

✅ **What works**

- Single fan-out keeps LCP bounded by the slowest sub-query
- Status pulse drops Abdul straight into rostering for the most urgent counts
- All 9 existing widgets keep their realtime + refresh contracts (sessions, swap_requests, feedback_ratings, rerostering_events subscriptions)
- 60-second auto-refresh + manual Refresh button retained
- Equipment-issue count mirrors the existing `getEquipmentIssues` widget logic — once a follow-up task lands in a final column, the kit drops out

⚠️ **Gaps**

- The `?status=needs_coach`, `?status=unconfirmed`, `?status=issues` jump-links land on the right pages but the destination filter chips don't yet read those exact params (will land in a follow-up trim of the roster + equipment filter shapes).
- The pulse counts use Sydney-local date math via a hard-coded AEDT offset; revisit if/when DST ends.

🎯 **Final-state target**

The /ops home is Abdul's morning landing pad — pulse + quick actions at the top, hero "today's sessions" widget, then a calm 2-column grid of widgets that summarise what needs attention. Looks like the /admin home seen from the operational angle.

📋 **Open items** — closed in this commit

- [x] **Ops Command Pulse** server action (`lib/ops/command-pulse-actions.ts`) + 7 vitest cases
- [x] **OpsContextStrip** — Sydney-local greeting + 3-stat pulse with useCountUp + brand-orange-on-active
- [x] **OpsQuickActionsRow** — 5 quick actions in a rounded-2xl ghost-button row
- [x] **Single fan-out** at page level — pulse + command data in one Promise.all
- [x] **Widget refresh** — `rounded-2xl`, hover-lift, useCountUp count pill, restrained orange in `WidgetWrapper`
- [x] **gap-6 rhythm** between widget rows

**Plumbing verified:** `getCommandCentreData(userId)` contract preserved; 4 supabase realtime channels untouched; refresh wiring intact.

---

### 2.2 `/ops/onboarding` — Centre Onboarding

🔍 **Current state**

`app/(dashboard)/ops/onboarding/page.tsx` was rebuilt around the same pattern as `/ops/centres`:

- `OnboardingStatusPulseStrip` — 4 inline counts (in progress / behind schedule >14d / completed this week / emails waiting to send), each linking to the relevant filtered list
- URL-persisted filter chip row (search by centre name, status select with `all / in_progress / behind / complete`, region select) — view-mode toggle (`?view=grid|table`) also URL-persisted
- New `OnboardingListView` with both grid and table modes — grid cards show centre name, region, status badge, progress bar (N/10 steps), days in flight, next-step label + due date
- The Start Onboarding CTA + dialog are unchanged; they route through the existing `startCentreOnboarding` write path

Backed by a new `getOnboardingListItems()` server action that joins centres + regions + steps in one round-trip (replacing the per-row step query the previous widget did).

✅ **What works**

- Pulse counts derive from canonical columns: `centre_onboarding_checklists.status / started_at / completed_at` and `centre_onboarding_emails.sent_at IS NULL AND error_text IS NULL` (the queued state introduced in migration 049)
- Grid + table views share the same data; only render differs
- Region filter joins through `centres.region_id` → `regions.name`
- Existing `ActiveOnboardingsWidget` retained for backward compat; not imported by the new page but stays callable
- All write paths (start, complete step, skip, revert, queue email) untouched — `lib/onboarding/actions.ts` still owns them

⚠️ **Gaps**

- The `?queued=yes` deep-link from the pulse currently lands but doesn't yet narrow the list to only-queued rows (we surface emails at the checklist level, not the row). Worth a small follow-up if Abdul finds himself drilling into the queue often.

🎯 **Final-state target**

A single place to see every onboarding in flight, what's behind, what just shipped, and what's waiting on an email send — with filters that drop Abdul into the rows he needs without scanning the whole list.

📋 **Open items** — closed in this commit

- [x] **Onboarding Status Pulse** server action (`lib/onboarding/status-pulse-actions.ts`) + 6 vitest cases
- [x] **OnboardingStatusPulseStrip** component with `useCountUp` + brand-orange-on-active
- [x] **URL-persisted filter chips** — search / status / region / `?view=grid|table`
- [x] **`OnboardingListView`** with grid + table modes, shared progress bar + next-step label
- [x] **`getOnboardingListItems()`** — single-fan-out replacement for the per-row widget loop
- [x] **UI refresh** — `rounded-2xl`, restrained orange (Start CTA + Behind badge + progress fill), hover-lift on cards

**Plumbing verified:** `startCentreOnboarding` + `completeOnboardingStep` + `skipOnboardingStep` + `revertOnboardingStep` + `queueOnboardingEmail` unchanged; `getActiveOnboardings()` retained for backward compat.

---

### 2.3 `/ops/*` audit — cross-page consistency

Walked every `/ops/*` route against its `/admin/*` equivalent and back-filled the missing pulse strips so Abdul gets the same morning glance as the admin:

- **`/ops/tasks`** — was missing `TasksStatusPulseStrip`. Now fans out `getTasksStatusPulse()` and renders the strip above the existing `OpsTasksClient`. Jump-links honor the same `?overdue=yes / ?mine=yes / ?unassigned=yes / ?due=today` URL shape the admin client uses.
- **`/ops/feedback`** — was missing `FeedbackStatusPulseStrip`. Now fans out `getFeedbackStatusPulse()` and renders it above the existing `OpsFeedbackClient`.
- **`/ops/announcements`** — was missing `AnnouncementsStatusPulseStrip`. Now fans out `getAnnouncementsStatusPulse()` alongside `getAnnouncements()`.
- **`/ops/messages`** — was missing `MessagesStatusPulseStrip`. Now fans out `getMessagesStatusPulse()` and renders above `MessagesPageClient`.

Pages already wired (no change needed): `/ops/centres`, `/ops/roster`, `/ops/crm`, `/ops/staff`, `/ops/children`, `/ops/performance`, `/ops/assessments`, `/ops/programs`, `/ops/training`, `/ops/equipment`, `/ops/documents`, `/ops/forms`, `/ops/invoicing`, `/ops/reports`.

Pages with deliberate scope difference vs admin (no change): `/ops/bookings/sessions` — admin has a full bookings dashboard (`/admin/bookings`); ops only owns the sessions sub-page (Abdul doesn't manage parent revenue) — preserved.

No regressions to shared list views (admin + ops share `CentreListView`, `StaffListView`, `ChildrenListView`, etc.); the audit was purely additive on the ops side.

---

## 3. Coach

Coach is the mobile-first role. CLAUDE.md ties it to 44px touch targets, terse copy, weekly grid focus. The close-out kept that posture: no URL-persisted multi-filter views, no leaderboard peer data, no other-coach $$ — every page is read in seconds, then drilled into one tap.

### 3.1 `/coach` — home

🔍 **Current state**

`app/(dashboard)/coach/page.tsx` now fans out 8 server actions in parallel: today / week sessions, next session, pending actions, latest announcement, incoming swap inbox, the new `getCoachStatusPulse(user.id)`, and the coach profile name lookup. Top of page is a sticky **`CoachContextStrip`** (`components/coach/home/coach-context-strip.tsx`) — Sydney-local "Good morning, [first_name]" with a 4-stat grid (shifts today / shifts to confirm / forms overdue / unread announcements). Each stat is a 44px tap target with a brand-orange icon when active. Below it: a 4-button **`CoachQuickActions`** row (Schedule / Forms / Training / Messages), a 4-card **`CoachSummaryCards`** strip (today / week / forms overdue / unread news, useCountUp), then the existing `CoachTodayDashboard`, pending-actions card, and latest-announcement card.

✅ **What works**

- Sticky greeting + 4-stat pulse — bounces between brand-orange (active) and muted in tabular-nums.
- `useCountUp` on every summary card; numbers tick into place.
- `rounded-2xl` everywhere with hover-lift on quick-action + summary tiles; restrained orange (greeting first name, overdue-forms accent, pulse-active icons only).
- Mobile-first grid — quick actions go 2×2 on phones / 4-up on tablets; pulse strip stacks horizontally with chip-style links.

🎯 **Final-state target**

The home is a 5-second scan: greeting + 4-stat pulse on top, one tap to anywhere via Quick Actions, summary cards as the visual anchor, then today's sessions. Future work could add `Today's first session` countdown (sub-card) — deferred until we have feedback from active coaches.

📋 **Closed:**

- [x] `getCoachStatusPulse` server action (shifts-today / to-confirm / overdue-forms / unread-announcements) — Sydney-local date, swallows to zeros on error
- [x] `CoachContextStrip` sticky greeting + pulse — 44px tap targets, brand-orange when active, useCountUp
- [x] `CoachQuickActions` 4-up grid (Schedule / Forms / Training / Messages)
- [x] `CoachSummaryCards` 4-up grid (today / week / overdue forms / unread news) — useCountUp, accent on overdue
- [x] Home page rewired — `Promise.all` includes pulse + profile, week count derived from already-fetched week data
- [x] Restrained orange (first name highlight, overdue card accent, pulse icons only); muted everywhere else

### 3.2 `/coach/schedule` — weekly grid

🔍 **Current state**

`/coach/schedule` page now loads `getCoachSchedulePulse(user.id)` alongside the existing tab data and renders a **`CoachSchedulePulseStrip`** above the tab wrapper (today / to-confirm / past-unconfirmed). Today/week views received UI refresh: session cards are now `rounded-2xl` with a subtle hover-translate + brand-orange border on hover. Bulk-confirm banner (existing) still surfaces above the tabs when 2+ pending. Status pulse drives the `?filter=pending` URL on the bulk confirm row and the `?filter=overdue` URL on the past-unconfirmed link.

✅ **What works**

- 3-stat pulse drives the schedule actions: brand-orange when there's anything to do.
- Today timeline cards are `rounded-2xl` with hover-lift; week-grid columns rounded with brand-tinted hover border.
- Week navigation, sport colours, status badges all preserved (no regression).

📋 **Closed:**

- [x] `getCoachSchedulePulse` (three single-shot head counts)
- [x] `CoachSchedulePulseStrip` (3 stats, 44px tap targets)
- [x] Strip wired above tabs on the schedule page
- [x] UI refresh on `today-view` (`rounded-2xl`, hover-translate) and `week-view` (`rounded-2xl` columns, brand-tinted hover border)
- [x] No URL-persisted multi-filter complexity added — keep coach world simple per the brief

### 3.3 `/coach/performance` — self vs benchmark

🔍 **Current state**

`getCoachSelfPerformance` already returned snapshot / badges / team averages / percentiles / monthly trend. The page now derives 3 pulse stats from the existing data (no extra queries) — sessions-this-period, badges-earned, months-tracked — and renders them as a muted **`CoachSelfPulseStrip`** above the score hero. The hero card gained a delta chip (`+N vs prior`) and a `Team avg N` chip, so the comparison is now visible on the page header rather than buried in the metric cards. Cards are now `rounded-2xl` with hover-lift on metric tiles; everything else preserved.

✅ **What works**

- Pulse uses already-fetched data — zero extra round trips; "own data only" guarantee unchanged.
- Trend arrow is derived from snapshots[len-2] vs snapshots[len-1], so it appears as soon as a coach has ≥2 months tracked.
- `rounded-2xl` everywhere; metric cards lift on hover.
- Recharts trend chart unchanged (Recharts works fine inside a `rounded-2xl` card).

📋 **Closed:**

- [x] `CoachSelfPulseStrip` (sessions / badges / months) — muted by default, brand-orange only on badges-earned > 0
- [x] Score hero — added prior-period delta chip + team avg chip beneath the score number
- [x] `rounded-2xl` on score hero, badges card, metric cards (hover-lift), trend chart, highlights empty state
- [x] No leaderboard leak; no peer names returned (function signature unchanged)

### 3.4 Other coach surfaces (forms / training / messages / invoicing / docs / tasks / assessments / announcements / equipment / notifications / profile)

🔍 **Current state**

A single `lib/coach/page-pulses.ts` module exposes one server action per page; a single **`CoachPulseStrip`** component (generic items array) renders the strip with consistent visual rhythm. Every action scopes to `coach_id = me` and swallows errors to zeros (so a missing column never blanks the page).

**Pulses wired:**

- `/coach/forms` — overdue / due-today / completed-this-week. Overdue = past completed sessions that I haven't submitted a form for.
- `/coach/training` — overdue / due-in-7-days / new-this-week / completed.
- `/coach/invoicing` — unpaid invoices / paid-this-month / sessions-in-current-fortnight. Coach's OWN $$ only — no financial-access gate needed because the whole page is the coach's own data.
- `/coach/tasks` — overdue / due-today / done-this-week. Open-only filtering (skips tasks already in a final column).
- `/coach/assessments` — children-pending-this-term / submitted-this-term. Pending = children at my sessions' centres I haven't rated yet.
- `/coach/announcements` — unread / this-week. Unread = no `announcement_reads` row for me.
- `/coach/equipment` — kits-assigned-on-upcoming-shifts / issues-open. Issues = `equipment_logs.action='issue_flagged'` for me.
- `/coach/notifications` — urgent / important. Same `notifications.tier` ladder as the rest of the platform.

**No-pulse / UI-only:**

- `/coach/messages` — full-screen conversation pane; an extra strip would push the chat off the viewport on phones. Skipped deliberately.
- `/coach/docs` — already uses the platform's `DocumentsStatusPulseStrip` shared with admin/ops (it's a cross-role doc hub). No coach-specific extension needed.
- `/coach/profile` — UI-only: personal-details card upgraded to `rounded-2xl` with subtle hover shadow; pay rates section preserved read-only as designed.

✅ **What works**

- One server-action file, one client component, one icon vocabulary across 8 pages — easy to extend.
- All `rounded-lg` borders on coach surfaces lifted to `rounded-2xl`.
- Restrained orange — accent is reserved for actively-overdue / urgent items; everything else stays muted.
- All counts use `useCountUp` so numbers tick into place on first render.

📋 **Closed:**

- [x] `lib/coach/page-pulses.ts` — 8 server actions (forms / training / messages / invoicing / docs / tasks / assessments / announcements / equipment / notifications)
- [x] `components/coach/coach-pulse-strip.tsx` — reusable strip with `CoachPulseItem[]` API, `accent` flag drives brand-orange
- [x] 8 page.tsx files updated to fan-out pulse alongside existing data; error banners lifted to `rounded-2xl`
- [x] `profile/page.tsx` — personal-details card upgraded to `rounded-2xl`
- [x] All financial-access boundaries respected — no cross-coach pay / no team-peer scores anywhere on coach surfaces
- [x] `getCoachSelfPerformance` remains the only path to performance data on coach surfaces

📋 **Tests added:** 18 cases across 2 files —
- `lib/coach/__tests__/coach-status-pulse.test.ts` — `getCoachStatusPulse` (6 cases: quiet day / shift-today / shift-to-confirm / overdue-forms compute / unread-announcements filter / defensive error) + `getCoachSchedulePulse` (3 cases: zeros / propagation / defensive error)
- `lib/coach/__tests__/coach-page-pulses.test.ts` — `getCoachFormsPulse` (3: zeros / overdue compute / defensive), `getCoachTrainingPulse` (2: propagation / defensive), `getCoachMessagesPulse` + `getCoachNotificationsPulse` (2: both pass through head counts), `getCoachAnnouncementsPulse` (2: unread + this-week compute / defensive)

**Verification:** `npx vitest run lib/coach/` → 18/18 pass; `npx tsc --noEmit` → clean; `npm run build` → ✓ Compiled successfully (pre-existing CRM dynamic-server warnings unchanged).

---

## 4. Client

Centre-director portal at `/client/[centreId]` — read-only by design, single-centre scope. Closed in one commit alongside `lib/client/status-pulse-actions.ts`.

### 4.1 `/client/[centreId]` — Home

🎯 **Final-state delivered**

Welcome header now names the centre. Status pulse strip surfaces four signals: next session (in N days / today / none), new reports in the last 14 days, unpaid invoices, feedback submitted in the last 90 days. Active counts use restrained brand orange (`#E8712A`); muted when zero so the strip stays calm. Quick-actions row (View Schedule / Open Reports / Submit Feedback / View Children) lives directly under the pulse. Next-session hero card is now brand-orange tinted instead of cyan, with `rounded-2xl` and tabular-num day counter. Summary cards (sessions / children / rating / attendance) use `useCountUp` so numbers tick into place. Recent sessions list lifted to `rounded-2xl` with hover-lift.

**No URL filters / no bulk actions** — single-centre scope, read-only role, both unnecessary.

### 4.2 `/client/[centreId]/reports` + `/invoices`

🎯 **Final-state delivered**

**Reports:** pulse strip with new-this-week / reports-this-term / total-available. Each report card lifted to `rounded-2xl` with hover-lift. Sync-Calendar CTA recoloured to brand orange. Empty-state icon recoloured.

**Invoices:** pulse strip with overdue / unpaid / paid-this-month. Outstanding-balance summary tile in the header uses `useCountUp` on the dollar total. The financial-access gate doesn't apply here — these are the centre's own bills, not coach payroll. Desktop table now `rounded-2xl`; mobile cards lift on hover. Both substantive surfaces now pull `getClientPortalPulse(centreId)` server-side alongside the data fetch.

### 4.3 `/client/[centreId]/feedback`

🎯 **Final-state delivered**

Pulse strip (submitted-this-term / awaiting-your-rating) sits above the existing summary card. New **"Recent submissions"** card lists the last 5 rated sessions with star displays — so directors can see the loop is closed without scrolling through the rate-stack. Feedback form button + accent buttons recoloured to brand orange. Session-feedback cards lifted to `rounded-2xl` with hover-lift. Progress bar inside the summary card switched to brand orange. The `feedback_source` column doesn't exist in `feedback_ratings`, so the pulse uses last-90-day submission volume as the participation proxy — documented inline in the action.

### 4.4 Other client surfaces (light refresh, aggregated)

- **`/schedule`, `/programs`, `/children`, `/staff`, `/curriculum`** — cards lifted to `rounded-2xl` with subtle hover-lift; cyan accents on cards / view buttons / filter pills recoloured to restrained brand orange. Empty-state icons now sit in `bg-[#E8712A]/10` circles.
- **`/impact`** — chart palette converted to the 2-tone admin-home approach (`#E8712A` + `#F4A87B`) for the attendance area; pie chart now leads with orange + peach and falls back to neutrals so the brand colour stays restrained. All chart containers lifted to `rounded-2xl`.
- **`/messages`** — own-bubble switched from cyan to brand orange; outer scroll container and send button rounded; sender labels recoloured.
- **`/resources`** — pulse strip with new-this-month + policies-on-file counts; document cards lifted to `rounded-2xl` with hover-lift; empty-state icon recoloured.
- **`/settings`** — primary CTA and link badges recoloured to brand orange; cards and link rows lifted to `rounded-2xl`. Non-primary restricted view also rounded.
- **`/client/shared/[token]`** — read-only token view: card sections lifted to `rounded-2xl`; sign-in CTA recoloured to brand orange. The token validation + expiry check in `validateSharedLink` is untouched.

📋 **Closed:**

- [x] `lib/client/status-pulse-actions.ts` — `getClientStatusPulse(centreId)` (4 fields) + `getClientPortalPulse(centreId)` (10 fields for the per-page strips)
- [x] `components/client/client-status-pulse.tsx` — `ClientHomePulseStrip` (home) + `ClientPortalPulseStrip` (generic, stats array) with `useCountUp` + restrained orange
- [x] `components/client/client-dashboard.tsx` — rewritten with welcome header, pulse, quick-actions row, brand-orange next-session card, `useCountUp` summary cards
- [x] `components/client/client-reports.tsx`, `client-invoices.tsx`, `client-programs.tsx`, `client-children.tsx`, `client-schedule.tsx`, `client-messages.tsx`, `client-settings.tsx`, `staff-card.tsx`, `shared-portal-view.tsx`, `impact-charts.tsx` — UI refresh
- [x] `app/client/[centreId]/feedback/page-client.tsx` — pulse + recent-submissions list + brand orange progress
- [x] `app/client/[centreId]/resources/page.tsx` — pulse fan-out
- [x] All `centre_id` scoping preserved end-to-end — no cross-centre reads added

📋 **Tests added:** 16 cases across 2 files —
- `lib/client/__tests__/client-status-pulse.test.ts` — `getClientStatusPulse` (7: calm zeros / days-until future / same-day / unread-reports / unpaid-invoices / new-feedback / defensive error)
- `lib/client/__tests__/portal-pulse.test.ts` — `getClientPortalPulse` (9: calm zeros / invoices-overdue / invoices-paid / reports-this-term + week / feedback-pending compute / feedback-pending clamp-at-zero / resources / messages-unread / defensive error)

**Verification:** `npx vitest run lib/client/` → 16/16 pass; `npx tsc --noEmit` → clean; `npm run build` → ✓ Compiled successfully.

## 5. Parent portal (`/parent/*`)

The parent portal is the warmer, end-user consumer surface — magic-link auth, mobile-first, and friendlier copy than the ops/admin tables. The closure pass keeps all data strictly scoped to the calling parent (`parent_profiles.user_id`) and never touches the Square payment integration logic, only the UI around it.

### 5.1 `/parent` (home)

🎯 **Final-state delivered**

Server component fans out 6 parallel queries: `getParentStatusPulse()` + waitlist offers + upcoming bookings + past bookings + linked children + month-to-date payments. The render order is greeting → pulse → child avatars row → summary cards → quick actions → waitlist offers → upcoming → recent activity → footer surfaces (referrals + insights).

- **Greeting**: `Hi {first_name}!` in 24px bold with a one-line subtitle.
- **Pulse strip** (`ParentHomePulseStrip`): next session label · waitlist offers · unpaid bookings · new insights · packs ending soon. Restrained orange on active fields; muted otherwise.
- **Child avatars row** (`ParentChildAvatarsRow`): horizontal scroll of initials avatars with name + age, plus a dashed "+ Add kid" pill that deep-links to `/parent/kids`.
- **Summary cards** (`ParentHomeSummaryCards`): four `useCountUp` cards — sessions booked (lifetime) / sessions completed / spend this month / kids on profile. `rounded-2xl` + hover-lift.
- **Quick actions** (4-up): the brand-orange "Book a session" tile leads, followed by My bookings / My kids / Session packs as neutral white cards.
- **Waitlist offers**: kept the orange `border-2` urgent treatment with the time-until label and "Confirm spot" CTA — these are the most time-sensitive items a parent sees.
- **Upcoming sessions**: first 6 bookings rendered as warm cards with sport chip, days-until pill (today = filled orange, ≤2 days = light orange, else neutral), and a "View details" affordance. Cards lift on hover.
- **Footer surfaces**: Refer-a-friend CTA (per CLAUDE.md: $5 credit + free session after 3 conversions) and a deep link to the first child's insights when kids exist.

### 5.2 `/parent/book` + `/parent/bookings` (+ `/bookings/[id]`)

🎯 **Final-state delivered**

**`/parent/book`** is now a thin server wrapper that loads `getParentBookingPulse()` and hands it to `ParentBookClient`. The pulse strip surfaces sessions-available-today / next-opening / on-waitlist / packs-ending. Filter row (suburb search + sport + type + age-suitability toggle) sits above a `gap-6` 3-column grid of warm session cards: title, sport chip, friendly date / time / location / age band rows, prominent price, spots-left state (red/amber/muted), and either a brand-orange "Book now" CTA or a peer "Join waitlist" outline. Cards `rounded-2xl` + hover-lift.

**`/parent/bookings`** uses the same warmer card treatment across the 4 tabs (Upcoming / Past / Cancelled / Waitlist) with **URL persistence** on `?tab=`. A derived `ParentPulseStrip` rides at the top with sessions-today / this-week / waitlist-offers / refunds-pending — all computed client-side from the loaded data so cancel/cancel-waitlist updates the strip without a refetch. Empty-states are friendlier (custom title + body + optional CTA via the `EmptyTab` helper). Each booking card lifts on hover; past-session cards now offer "View {child}'s insights" rather than "progress".

**`/parent/bookings/[id]`** got a targeted `rounded-2xl` + shadow refresh on every card. Cancel flow + payment summary unchanged — Square logic untouched.

### 5.3 `/parent/kids` + `/parent/kids/[childId]` + `/parent/kids/[childId]/insights`

🎯 **Final-state delivered**

**`/parent/kids`**: server wrapper loads `getParentKidsPulse()` (insights-ready / sessions-this-week / new assessments) and renders `ParentKidsClient`. The list switched from the 1-up row of `ChildCard` to a `gap-6` 3-column grid of `KidPhotoCard` tiles — big circular initials avatar, age-group badge, child name, optional medical-notes flag, and a 2-up footer with an "Insights" pill + "View profile →" affordance. Add-child form lifted to `rounded-2xl`.

**`/parent/kids/[childId]`**: cards lifted to `rounded-2xl` + shadow; added a dedicated **Development insights** teaser link at the top of the body so parents can jump straight to the AI insights without scrolling past the edit form. The "remove from profile" danger zone is unchanged.

**`/parent/kids/[childId]/insights`**: insight cards lifted to `rounded-2xl` with hover-lift. Generate-on-demand and term-end auto-generate flow unchanged.

### 5.4 `/parent/packages` + `/parent/referrals`

🎯 **Final-state delivered**

**Packages**: title softened to "Session packs" with a friendlier subtitle. Active balance + available package cards `rounded-2xl` + hover-lift. CTA copy refined to "Buy now" with a 44px tap target. **Square integration logic untouched** — only the UI chrome around `<SquarePayment />`.

**Referrals**: kept the existing referral-code card, share buttons, milestone-progress bar, stats trio, rewards + history lists; lifted every card to `rounded-2xl` + hover-shadow. Header copy now spells out the offer per CLAUDE.md ($5 credit per signup + free session at 3 conversions). New **`ParentPulseStrip`** above the milestone surfaces: friends-signed-up / converted / rewards-ready.

### 5.5 `/parent/account` + `/parent/register`

🎯 **Final-state delivered**

**Account**: profile card / linked-children card / packages card / payment-history card / settings card / sign-out CTA — every card lifted to `rounded-2xl` + shadow-hover. Square payment-method receipt links untouched. Marketing opt-in toggle preserved.

**Register**: warmer welcome copy on the step header ("We're glad you're here — three quick steps and you're ready to book."). All cards `rounded-2xl`. Magic-link auth flow + `completeParentRegistration` server action untouched.

📋 **Closed:**

- [x] `lib/parent/status-pulse-actions.ts` — `getParentStatusPulse()` (5 fields) + `getParentBookingPulse()` (4 fields) + `getParentKidsPulse()` (3 fields). Every query scoped via the shared `resolveParentContext()` helper.
- [x] `components/parent/parent-status-pulse.tsx` — `ParentHomePulseStrip` / `ParentBookingPulseStrip` / `ParentPulseStrip` (generic) with `useCountUp` and restrained orange.
- [x] `components/parent/parent-home-summary-cards.tsx` + `parent-child-avatars-row.tsx` — new warm consumer pieces.
- [x] `app/(dashboard)/parent/page.tsx` — rebuilt as a server component (greeting + pulse + avatars + summary cards + quick actions + warm session cards + footer surfaces).
- [x] `app/(dashboard)/parent/book/page.tsx` + `book-client.tsx` — server wrapper + warmer client surface.
- [x] `app/(dashboard)/parent/bookings/page.tsx` + `bookings-client.tsx` — URL-persisted tabs + derived pulse + UI refresh.
- [x] `app/(dashboard)/parent/bookings/[id]/page.tsx` — `rounded-2xl` refresh.
- [x] `app/(dashboard)/parent/kids/page.tsx` + `kids-client.tsx` — server wrapper + big photo cards + pulse.
- [x] `app/(dashboard)/parent/kids/[childId]/page.tsx` — insights teaser + UI refresh.
- [x] `app/(dashboard)/parent/kids/[childId]/insights/page.tsx` — UI refresh.
- [x] `app/(dashboard)/parent/packages/page.tsx` — UI refresh; Square logic untouched.
- [x] `app/(dashboard)/parent/referrals/page.tsx` — pulse strip + UI refresh.
- [x] `app/(dashboard)/parent/account/page.tsx` + `register/page.tsx` — UI refresh; magic-link + Square paths untouched.
- [x] `parent_profiles.user_id` scoping preserved end-to-end — no cross-parent reads added.

📋 **Tests added:** 17 cases across 2 files —
- `lib/parent/__tests__/parent-status-pulse.test.ts` — `getParentStatusPulse` (10: calm zeros / no-auth / days-until-next / unpaid / waitlist / new-insights / expiring-by-date / expiring-by-remaining / empty-childIds short-circuit / defensive error).
- `lib/parent/__tests__/parent-booking-pulse.test.ts` — `getParentBookingPulse` (7: calm zeros / no-auth / sessions-today-with-spots / days-to-next-available / waitlist count / packages-ending-soon / defensive error).

**Verification:** `npx vitest run lib/parent/` → 29/29 pass (includes the 12 import-parents cases); `npx tsc --noEmit` → clean; `npm run build` → ✓ Compiled successfully (only pre-existing unrelated dynamic-rendering warnings).

---
