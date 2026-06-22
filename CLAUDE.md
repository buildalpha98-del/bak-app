# Build Alpha Kids — Platform Application

## Project Context

Progressive Web App for **Build Alpha Kids**, a multi-sport coaching business in South-West Sydney. Manages operations, client engagement, sales, revenue intelligence, AI scheduling, training, coaching support, direct-to-parent bookings, referral growth, business intelligence, and predictive analytics for ~40 childcare centres and 6–8 schools.

**Current status:** MVP + Waves 1–8 schema fully shipped. Sub-projects P1–P5 of the May 2026 roster-and-programs redesign all in production:

- **P1** (commit `8b7…` lineage) — staff defaults: new coaches seeded with Mon–Fri 8:00–16:30 availability and shipped as `active` immediately.
- **P2** (`12076c3` and prior) — custom-taxonomy: org-wide `custom_sports` + `custom_equipment` tables (admin-managed via `/admin/settings/programs`), `programs.age_groups` jsonb for multi-age generation, AI prompt rewrite for multi-band scaffolds.
- **P3** (`974a385 … 68812f5`) — shift-card power moves: per-shift `sessions.notes` (migration 047), inline 3-dot menu (Swap coach / Add note / Duplicate), notes section in detail sheet, CI guard on direct writes.
- **P5** (`4207c68 … 0558b3f`) — multi-coach per shift: `session_coaches` join table (migration 048) with sync-trigger maintaining `sessions.coach_id` as a read-only cache; `setSessionCoaches` helper is the single write path; CI guard test (`lib/__tests__/no-direct-coach-id-writes.test.ts`) enforces it; cost projection per-rate-summed; conflict detection reads from `session_coaches`; UI roster grid renders "+N others" badge on primary and "↔ shared" on secondaries; detail sheet uses a drag-to-reorder `CoachChipMultiselect`.
- **P4** (drag-and-drop scheduling + colour coding + mobile polish) — **deferred**, planned for post-beta.

**Beta-readiness (Wave A — pre-launch):** 8 of 9 items closed (cron schedule verified in `vercel.json`, training RLS confirmed, CLAUDE.md updated, parent bulk-invite shipped at `/admin/parents/import`, magic-link callback + Resend wired per `docs/auth-magic-link-setup.md`, dashboard streaming + Mumbai region, workflow audit + cron hardening per `docs/workflow-audit.md`, Square env-flag plumbing per `docs/square-cutover.md`). Last item: **Square live credential flip** in Vercel env (code is ready; just paste prod keys + set `SQUARE_ENV=production`). See `docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md` for the P-series spec.

## Tech Stack

- **Frontend:** Next.js 14+ (App Router, TypeScript)
- **UI:** Tailwind CSS + shadcn/ui + Lucide React icons
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI:** Anthropic Claude API (programs, skills, coach assistant, child insights, sales proposals)
- **Email:** Resend
- **Invoicing:** Built-in native invoicing (PDF generation, email delivery, payment tracking, automated reminders, optional Square online payment, CSV export for accountants)
- **Payments:** Square Web Payments SDK (parent bookings)
- **PDF:** React-PDF (@react-pdf/renderer)
- **Hosting:** Vercel (with cron jobs)
- **PWA:** next-pwa + custom service worker
- **Charts:** recharts
- **Drag & Drop:** @dnd-kit/core
- **Testing:** vitest (unit/integration), Playwright (E2E), @testing-library/react
- **Monitoring:** Sentry (error tracking), Vercel Analytics (performance)
- **Validation:** Zod (API input validation)
- **Caching:** React Query / SWR (client-side), Next.js fetch cache (server-side)

## Branding

- **Name:** Build Alpha Kids (never abbreviated)
- **Primary:** #E8712A (orange). Dark text: #1A1A1A. Secondary: #666666
- **Client portal:** teal/blue accent. Parent portal: warmer consumer design
- **Language:** Australian English

## User Roles

| Role | Auth | Route | Access |
|------|------|-------|--------|
| Admin | Email + password | /admin | Full platform access |
| Operations | Email + password | /ops | Rostering, scheduling, programs, CRM, onboarding |
| Coach | Email + password | /coach | Own shifts, programs, forms, invoicing, training, AI assistant, performance |
| Client | Magic link | /client/[centreId] | Read-only centre data + messaging |
| Parent | Magic link | /parent | Browse, book, pay, manage children |

## All Entities (Database)

### Core Operations (MVP)
profiles, pay_rates, compliance_docs, availability_slots, centres, centre_notes, terms, term_templates, sessions, swap_requests, programs, equipment_kits, equipment_items, equipment_logs, form_templates, form_submissions, coach_invoices, outbound_invoices, announcements, announcement_reads, shift_threads, direct_messages, documents, tasks, feedback_ratings, notifications, notification_preferences, activity_log

### Client Growth (Waves 1–2)
children, centre_children, session_attendances, assessment_templates, skill_ratings, centre_reports, client_users, shared_links, health_scores, health_score_config, leads, lead_activities, email_sequences, email_sequence_steps, email_sends, revenue_forecasts, forecast_config

### Operational Intelligence (Waves 3–4)
scheduling_preferences, scheduling_runs, rerostering_events, coach_performance_snapshots, training_modules, training_pathways, training_pathway_modules, training_assignments, training_completions, ai_assistant_conversations, ai_assistant_cache, centre_onboarding_checklists, centre_onboarding_steps, centre_onboarding_emails

### Direct to Parent (Wave 5)
parent_profiles, parent_children, bookable_sessions, waitlist, packages, package_balances, bookings, payments, approved_testimonials, public_stats_cache

### Growth & Intelligence (Waves 6–8)
referral_codes, referrals, referral_rewards, referral_config, reengagement_campaigns, reengagement_sends, discount_codes, sales_proposals, regions, child_insights, churn_events, churn_risk_indicators

### Operational Hardening (post-Wave 8, May 2026)
- **Native invoicing** (migration 040): `business_settings` for ABN/GST defaults
- **Equipment inventory** (041): `equipment_inventory` per-centre item tracking
- **CRM enhancements** (042): `demo_sessions`, `lead_documents`
- **Launch foundation** (042): `email_log`, `attendance`, `session_notes`, `session_photos`, `child_observations`, `invitations`, `invoices`, `invoice_line_items`, `reminder_log`
- **Lead/grant ops** (043–045): lead field richness, `payment_batches` (weekly Monday cron), `grants` + `grant_applications` + `grant_invoice_allocations`
- **P2 — Custom taxonomy + multi-age** (046): `custom_sports`, `custom_equipment`, `programs.age_groups` jsonb
- **P3 — Shift notes** (047): `sessions.notes` text
- **P5 — Multi-coach per shift** (048): `session_coaches` join table with sync trigger + `set_session_coaches` atomic RPC; `sessions.coach_id` becomes a trigger-maintained primary cache. The `setSessionCoaches` helper at `lib/sessions/session-coaches.ts` is the **only** write path; CI guard at `lib/__tests__/no-direct-coach-id-writes.test.ts` enforces this at build time.
- **Performance enrichment**: `coach_badges` (029), `ai_assistant_usage` (032)

## Key Business Rules

### Scheduling
- AI constraint solver: hard (availability, travel ≥30min, no overlaps) + soft (familiarity +3, utilisation +2, location +1, preferences +5/-10, compliance -3, training -2/-1)
- Abdul reviews and publishes. Adjustments auto-learn as preferences
- Rerostering: semi-auto replacement suggestions, 30-min offer timeout, escalation at 4hr/2hr

### Child Tracking
- Global child records linked to multiple centres. Named attendance with headcount fallback
- Per-term skill assessments: AI-generated 5–8 skills per sport+age. Coach rates 1–5
- AI child development insights: auto at term end + on-demand. Visible to centres and parents

### Centre Health & Churn
- Health score 0–100: feedback (30%), payment (25%), cancellations (20%), communication (15%), attendance (10%)
- Risk score: enhanced with engagement trends, communication patterns, relationship factors
- Daily snapshots stored for ML training. Rules-based risk engine now, ML model when 20+ churn events

### CRM & Sales
- Pipeline: cold → contacted → interested → trial → proposal → won/lost/churned
- Email sequences with merge fields and tracking. Trial reports auto-generated
- AI sales proposals: Claude generates data-backed PDFs using nearby centre success metrics
- Won → auto-create centre → triggers onboarding wizard (10 steps, 5 automated emails)

### Referrals
- Parent: auto-generated codes, shareable links, instant $5 credit + free session after 3 conversions
- Centre: $50 invoice credit + Featured Partner badge per conversion
- Tracked from referral through registration to conversion

### Re-engagement
- 4 audiences: dormant parents (60+ days), declining centres, cold leads (30+ days), untrained coaches
- Automated email sequences with personalised merge fields. Discount codes for parent re-engagement
- 60-day re-trigger cooldown

### Payments (Parent)
- Square: card, Apple Pay, Google Pay. Packages: multi-session at discount
- Cancellation: >24hr full refund, <24hr no refund. Waitlist with 24hr offer window
- Revenue integrated into forecasting

### Regions
- Regions defined by suburb lists. Auto-assignment on centre/lead creation
- Global region filter across all admin views. Regional dashboard for expansion tracking
- Franchise-ready schema (is_franchise, data_isolation_level columns reserved)

### Performance
- 8 metrics: feedback (25%), reliability (20%), forms (15%), punctuality (15%), volume (10%), attendance (10%), equipment (5%)
- Badges: 50 Sessions, Century Coach, Five Star, Perfect Punctuality, Form Champion, Reliability Rock, Multi-Sport Master
- Coaches see own data + team benchmarks

### Training LMS
- 4 types: video, document, quiz, checklist. Pathways with auto-advance
- Soft-gated rostering. Auto-assign mandatory on new coach. Certificates on completion

### AI Coach Assistant
- Context-aware: sport, age, equipment, centre, program, group size
- Quick prompts + free chat. Cached 7 days. 20/day limit

### Notifications (Tiered)
- **Urgent:** shifts, WWCC expiry, rerostering, waitlist offers, web enquiries
- **Important:** reminders, announcements, tasks, training, health/risk changes, booking confirmations
- **Informational:** documents, equipment, invoices, badges, re-engagement

## Scheduled Tasks (Vercel Cron)

- Health scores: daily 6am
- Risk indicator snapshots: daily 6am
- Revenue forecasts: weekly Monday 5am
- Email sequences: every 6 hours
- Training overdue check: daily 7am
- Onboarding emails: daily 8am
- Performance snapshots: monthly 1st
- Stats cache: daily 5am
- Waitlist expiry: hourly
- Booking reminders: daily 6pm
- Re-engagement detection: daily 7am
- Churn risk alerts: daily (part of risk snapshot)

## Conventions

- Australian English. shadcn/ui. Mobile-first (coach, client, parent). 44px touch targets
- RLS on all tables. Zod validation on all API routes. Server actions for mutations
- activity_log for significant actions. Supabase Realtime for live updates
- React-PDF for PDFs. Resend for email. recharts for charts. Sentry for errors
- Tests: vitest unit 80%+ on /lib/utils, integration on critical flows, Playwright E2E top 5 journeys

## Sports List

Soccer, Basketball, Athletics, Yoga, Pilates, Boot Camp, Swimming, Pickleball, Golf, Hockey, Lacrosse, Motor Skills, Multi-Sport, Cricket, Netball, Tennis, Volleyball, Dance, Gymnastics

## Team

- **Owner:** Founder / strategy (Admin)
- **Abdul:** Coordinator / ops manager (Operations)
- **Daniel:** Invoicing support
- **Coaches:** 8–10 active, bench of 15–20
