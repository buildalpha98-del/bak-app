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
