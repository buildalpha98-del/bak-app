# Build Alpha Kids — Launch Checklist

Pre-launch stress test completed **15 March 2026**. Platform audited across all 5 portals (Admin, Ops, Coach, Parent, Client), 210+ routes, 209 components, 170+ server action files, and 85+ database tables.

---

## A. External Services to Connect

| Service | Purpose | Env Variables | Setup URL | Status |
|---------|---------|---------------|-----------|--------|
| **Supabase** | Database, Auth, Storage, Realtime | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | [supabase.com/dashboard](https://supabase.com/dashboard) | ✅ Connected |
| **Resend** | Transactional email (invoices, shifts, feedback, CRM sequences, onboarding) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | [resend.com](https://resend.com) | Needs setup |
| **Anthropic (Claude)** | AI program generation, skill assessments, child insights, coach assistant, sales proposals | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Needs setup |
| **Square** | Parent booking payments (card, Apple Pay, Google Pay), optional invoice online payment | `SQUARE_ACCESS_TOKEN`, `SQUARE_ENVIRONMENT` (sandbox/production), `SQUARE_LOCATION_ID` | [developer.squareup.com](https://developer.squareup.com) | Optional — needed for parent bookings |
| **Vercel** | Hosting, cron jobs, analytics | Managed via Vercel dashboard | [vercel.com](https://vercel.com) | Needs setup |
| **Sentry** | Error tracking and monitoring | `SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | [sentry.io](https://sentry.io) | Optional — recommended |
| **Web Push (VAPID)** | PWA push notifications | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Generate with `web-push generate-vapid-keys` | Optional |

### Cron Job Verification (Vercel)

Ensure all 13 cron jobs in `vercel.json` are active:
- `daily-digest` (8pm), `overdue-tasks` (9pm), `compliance-expiry-tasks` (9pm)
- `performance-snapshot` (1st of month 10pm), `onboarding-emails` (every 2h)
- `training-overdue` (7am), `waitlist-expiry` (hourly), `booking-reminder` (8am)
- `public/refresh-stats` (5am), `reengagement` (6am), `churn-risk` (6am)
- `child-insights` (Sunday 10pm), `invoice-reminders` (7am)

All require `CRON_SECRET` env variable for bearer token auth.

---

## B. Issues Found and Fixed

### Critical Bugs (2)

1. **Parent portal login loop** — Dashboard layout queried `profiles` table for all users, but parent users only have `parent_profiles`. Parents were redirected to `/login` in an infinite loop. **Fixed:** Added `parent_profiles` fallback check in `app/(dashboard)/layout.tsx`.

2. **Broken waitlist booking links** — Parent dashboard and bookings page linked to non-existent routes (`/parent/sessions/...` and `/parent/book?session=...`). **Fixed:** Corrected to `/parent/book/${sessionId}?waitlist=...`.

### Medium Bugs (8)

3. **Invoice list missing status badges** — `partially_paid`, `overdue`, `void` statuses showed as "Draft" fallback. **Fixed:** Added all 8 statuses to STATUS_STYLES map in `invoice-list.tsx`.

4. **Invoice detail stale UI** — After recording payment, sending invoice, or voiding, the UI showed stale data until manual refresh. **Fixed:** Added `window.location.reload()` after every successful server action.

5. **Line item edits ignored GST recalculation** — `updateOutboundLineItems` updated `amount` but left `subtotal_cents`, `gst_amount_cents`, `total_cents` stale. **Fixed:** Now recalculates all cents fields using business settings GST rate.

6. **Client invoices showed pre-GST amount** — Client portal displayed `invoice.amount` (subtotal) instead of `total_cents` (incl. GST). **Fixed:** Now shows `total_cents / 100` with `amount` fallback.

7. **Referral links not publicly accessible** — Unauthenticated users clicking referral links (`/refer/CODE`) were redirected to login. **Fixed:** Added `/refer` to `PUBLIC_ROUTES` in middleware.

8. **Ageing report Due Date column** — "Due Date" column header displayed redundant overdue text instead of actual due date. **Fixed:** Added `dueDate` field to AgeingBracket type and rendered actual date.

9. **API routes exposing raw errors** — `proposals/generate` and `insights/generate` returned raw `err.message` to clients. **Fixed:** Generic error messages with server-side error tracking.

10. **recordPayment missing status validation** — Server action allowed recording payments on draft/void invoices. **Fixed:** Added payable status check (`sent`, `partially_paid`, `overdue`).

### Code Quality (38)

11. **34 missing loading.tsx files** — Created skeleton loading states for admin (13), ops (8), coach (3), parent (8), client (8) directories.

12. **Console.log in production code** — 4 instances in `reengagement.ts` converted to `console.info` for proper log-level semantics.

13. **Client invoice void badge** — Added `void` status styling to client-facing invoice component.

14. **Redundant ternary** — `colSpan={isDraft ? 5 : 5}` simplified to `colSpan={5}`.

---

## C. Known Limitations

### Acceptable for Launch

1. **AI features require Anthropic API key** — Program generation, skill assessments, child insights, coach assistant, and sales proposals will show graceful error states without `ANTHROPIC_API_KEY`. All non-AI features work independently.

2. **Square payments require sandbox setup** — Parent booking payments need Square credentials. The booking flow handles this gracefully — users see payment step but can't complete without Square configured. Invoice online payment links also require Square.

3. **Email delivery requires Resend** — Without `RESEND_API_KEY`, email-dependent features (invoice sending, shift notifications, magic links, CRM sequences) will fail silently. All data operations still work, just no emails sent.

4. **Push notifications need VAPID keys** — PWA push notifications are optional. In-app notifications still work without VAPID.

5. **No ESLint config** — Project uses TypeScript strict mode for type safety but doesn't have a root-level ESLint config. TypeScript compilation (`tsc --noEmit`) is the primary quality gate and passes clean.

6. **Some nav pages reachable only via deep links** — CRM, Feedback, Children, Assessments, Reports, and Analytics pages exist but have no sidebar nav entries. They're accessible via internal links from dashboard widgets and related pages. This is intentional — sidebar nav is curated for most-used features.

7. **Offline mode is best-effort** — Service worker caches static assets and provides offline fallback page. Form and attendance queues exist but require testing with actual offline scenarios.

### Not Yet Implemented

8. **ML churn prediction** — Currently rules-based risk scoring. ML model planned when 20+ churn events collected.

9. **Revenue from parent bookings in forecasting** — Forecasting uses centre invoicing data. Parent booking revenue integration is planned.

---

## D. Post-Launch Monitoring (First 48 Hours)

### Watch Closely

- [ ] **Auth flows** — Verify all 4 login methods work (staff email/password, client magic link, parent magic link, shared link)
- [ ] **Cron jobs** — Check Vercel function logs to confirm all 13 cron jobs execute on schedule
- [ ] **Database queries** — Monitor Supabase dashboard for slow queries (>500ms) and connection pool usage
- [ ] **Error rates** — If Sentry configured, watch for new error spikes especially on coach and parent portals
- [ ] **Email delivery** — Check Resend dashboard for delivery rates and bounces
- [ ] **Session status transitions** — Verify sessions move through draft → published → confirmed → completed correctly
- [ ] **Invoice generation** — Run a test invoice generation cycle to verify PDF creation, email sending, and payment recording

### Health Checks

- Supabase dashboard → Database → Query Performance
- Vercel dashboard → Functions → Cron job execution logs
- Resend dashboard → Emails → Delivery status
- Browser console on each portal for JavaScript errors

### Rollback Plan

If critical issues found:
1. Vercel supports instant rollback to previous deployment
2. Database migrations are forward-only — any schema rollback needs a new migration
3. All server actions have try/catch with graceful error states — broken features won't crash the entire app

---

## E. Quick-Start Guide

### 1. Admin (First Day Setup)

1. **Log in** at `/login` with `admin@buildalphakids.com.au` / `BuildAlpha2026!`
2. **Configure business settings** at `/admin/settings/invoicing`:
   - Set ABN, business name, bank account details (BSB + Account)
   - Set payment terms (default 14 days)
   - Enable/disable GST (10% default)
3. **Add centres** at `/admin/centres/add`:
   - Enter centre name, address, contact details, pricing model
   - Set contract status (active/trial)
   - Add operational notes (gate codes, parking, reception process)
4. **Add coaches** at `/admin/staff/new`:
   - Enter name, email, phone — they'll receive a login email
   - Upload compliance docs (WWCC, First Aid)
   - Set pay rates (per session type)
5. **Create a term** at `/admin/roster/terms`:
   - Set term name, start/end dates
   - Build the weekly template with sessions across centres
   - Publish the roster
6. **Review settings**:
   - Health scores: `/admin/settings/health-scores`
   - Scheduling: `/admin/settings/scheduling`
   - Forecasting: `/admin/settings/forecasting`
   - Regions: `/admin/settings/regions`

### 2. Abdul — Operations Manager (First Week)

1. **Log in** at `/login` with `abdul@buildalphakids.com.au` / `BuildAlpha2026!`
2. **Review Command Centre** at `/ops` — all widgets show real-time operational data
3. **Build the week's roster**:
   - Go to `/ops/roster` → check unassigned sessions
   - Use AI Generate (if Anthropic key set) or manually assign coaches
   - Review clash detection alerts
   - Publish confirmed sessions (coaches get email notifications)
4. **Manage swap requests** at `/ops/roster/swaps` — approve/reject coach swaps
5. **Track invoicing** at `/ops/invoicing/outbound` — review pending invoices, approve/reject
6. **Monitor equipment** at `/ops/equipment` — check for flagged issues
7. **Check compliance alerts** — dashboard widget shows expiring WWCC/First Aid

### 3. Coaches (First Login)

1. **Receive invite email** → Click link → Set password at `/set-password`
2. **Complete profile** at `/coach/profile`:
   - Add phone number, address, emergency contact
   - Upload WWCC and First Aid certificates
   - Set availability (which days/times you can work)
3. **Check your schedule** at `/coach/schedule`:
   - Today view shows your sessions for the day
   - Confirm pending sessions
   - View centre details (address, gate code, parking, contact)
4. **Before each session**: Check session detail for program plan, equipment kit, and centre notes
5. **After each session**: Submit session feedback form (attendance, notes, any incidents)
6. **Monthly**: Generate your invoice at `/coach/invoicing`

### 4. Centres (Client Portal Invite)

1. **Admin creates client user**: `/admin/centres/[id]` → Client Portal tab → Send invite
2. **Centre contact receives magic link email** → Clicks to access `/client/[centreId]`
3. **Available to centres**:
   - View upcoming and past sessions
   - View children enrolled and their attendance
   - Download skill assessment reports
   - View and download invoices (PDF)
   - Send messages to the BAK team
   - View centre reports

---

*Generated by pre-launch stress test — 15 March 2026*
