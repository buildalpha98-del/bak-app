# Dashboard Review — 2026-05-17

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
