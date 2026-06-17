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
