# Build Alpha Kids — Platform Application

## Project Context

This is a Progressive Web App (PWA) for **Build Alpha Kids**, a multi-sport coaching business in South-West Sydney (Bankstown/Liverpool LGAs). The app manages workforce operations, client engagement, sales, and revenue intelligence for ~40 childcare centres and 6–8 schools.

**Current status:** MVP deployed. Building Waves 1 & 2 (client growth and revenue intelligence features).

## Tech Stack

- **Frontend:** Next.js 14+ (App Router, TypeScript)
- **UI:** Tailwind CSS + shadcn/ui (default theme) + Lucide React icons
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI:** Anthropic Claude API (program generation, skill framework generation)
- **Email:** Resend (notifications, coach invoices, CRM sequences, feedback links, client portal invites)
- **Invoicing:** QuickBooks Online API (outbound to centres/schools)
- **PDF:** React-PDF (@react-pdf/renderer) for reports, invoices, trial reports
- **Hosting:** Vercel
- **PWA:** next-pwa + custom service worker

## Branding

- **Name:** Build Alpha Kids (never abbreviated in UI)
- **Primary colour:** #E8712A (orange)
- **Dark text:** #1A1A1A
- **Secondary text:** #666666
- **Backgrounds:** white (#FFFFFF), light grey (#F5F5F5)
- **Client portal accent:** softer teal/blue (visually distinct from staff portals)
- **Language:** Australian English (centre, organisation, programme)

## Folder Structure

```
/app
  /(auth)              — Staff login, password reset, set password
    /client-login      — Centre client magic link login
  /(dashboard)
    /admin             — Admin portal pages
    /ops               — Operations portal pages (Abdul)
    /coach             — Coach portal pages
    /client/[centreId] — Centre client portal pages
  /api                 — API routes
    /crm               — CRM endpoints (enquiry form, sequences)
    /assessments       — Skill generation
    /health-scores     — Health score calculation
    /forecasts         — Revenue forecast generation
  /feedback/[token]    — Public session feedback page (no auth)
  /client/shared/[token] — Shared read-only client portal link
/components
  /ui                  — shadcn components
  /centres             — Centre-related components
  /forms               — Form engine components
  /programs            — Program display components
  /roster              — Roster/session components
  /crm                 — CRM pipeline and lead components
  /reports             — Centre report components
  /charts              — Recharts-based analytics components
  /shared              — Shared/layout components
/lib
  /supabase            — Supabase client (browser, server, middleware)
  /types               — TypeScript types and enums
  /hooks               — Custom React hooks
  /utils               — Helper functions (scheduling, pay rates, health scores, forecasting)
  /ai                  — AI program generator, skill framework generator
  /email               — Email client, templates, sequence engine
  /offline             — Offline queue and sync utilities
  /notifications       — Notification sending logic
/public                — PWA manifest, icons, service worker
/supabase
  /migrations          — Database migration SQL files
  /seed.sql            — Seed data
```

## User Roles

| Role | Auth | Portal Route | Access |
|------|------|-------------|--------|
| Admin | Email + password | /admin | Full access, approvals, reporting, CRM, analytics |
| Operations (Abdul) | Email + password | /ops | Rostering, programs, equipment, forms, coach management, CRM |
| Coach (subcontractors) | Email + password | /coach | Own shifts, programs, forms, hours, invoicing, assessments, profile |
| Client (centre contact) | Magic link | /client/[centreId] | Read-only: schedule, summaries, reports, children, skills, invoices + messaging |
| Parent (Phase 4) | Magic link | /parent | Holiday clinic booking |

## Core Entities (Database)

### MVP Entities
- **profiles** — extends auth.users. Role, status, default_pay_rate, ABN, WWCC
- **pay_rates** — per-coach, per-session-type. Hierarchy: override → type rate → default
- **compliance_docs** — WWCC, First Aid, police check, insurance, certs, policies
- **availability_slots** — coach weekly windows + location preferences
- **centres** — centres/schools. Type, address, lat/lng, contacts, pricing, contract_status, logo_url, branding_mode, health_score, health_status, churn_risk
- **centre_notes** — operational notes per centre (general, access, safety, relationship)
- **terms** — school terms (8–10 weeks)
- **term_templates** — recurring weekly session patterns
- **sessions** — individual sessions. Status: draft → published → pending_confirmation → confirmed → in_progress → completed/cancelled. is_trial flag for CRM trial sessions
- **swap_requests** — coach shift swap requests
- **programs** — session plans (AI-generated or manual). Versioned
- **equipment_kits** / **equipment_items** / **equipment_logs** — dual-level equipment tracking
- **form_templates** / **form_submissions** — flexible forms engine
- **coach_invoices** — fortnightly auto-generated from completed sessions
- **outbound_invoices** — to centres via QuickBooks
- **announcements** / **announcement_reads** — operational announcements
- **shift_threads** / **direct_messages** — operational comms
- **documents** — centralised document storage
- **tasks** — Kanban tasks with entity linking
- **feedback_ratings** — session ratings from centres (1–5 via public link)
- **notifications** / **notification_preferences** — tiered notification system
- **activity_log** — system-wide audit trail

### Wave 1+2 Entities
- **children** — global child records (name, DOB, age_group, medical notes, parent details)
- **centre_children** — many-to-many link (child ↔ centre). Status: active/withdrawn
- **session_attendances** — named attendance per session (child + present/absent)
- **assessment_templates** — AI-generated skill frameworks per sport + age group
- **skill_ratings** — per-child, per-term skill assessments (1–5 per skill)
- **centre_reports** — generated term-end PDF reports per centre
- **client_users** — centre portal access (linked to centres)
- **shared_links** — read-only shareable portal links with expiry
- **health_scores** — historical health score snapshots per centre
- **health_score_config** — configurable signal weights and thresholds
- **leads** — CRM lead records (pipeline: cold → contacted → interested → trial → proposal → won/lost/churned)
- **lead_activities** — CRM activity log per lead (notes, emails, calls, meetings, stage changes)
- **email_sequences** / **email_sequence_steps** — automated email templates
- **email_sends** — track sent CRM emails (status, opens, clicks)
- **revenue_forecasts** — cached forecast calculations
- **forecast_config** — conversion rates, seasonal factors, session frequency assumptions

## Key Business Rules

### Pay Rates
- Three-tier hierarchy: session override → session-type rate → coach default rate
- Coaches set own rates. Admin/ops can override per session
- Rate unit: per_session or per_hour

### Pricing to Centres/Schools
- Centre-funded: $160–$180/session
- Parent-funded: $10/child/session
- School per-head: $5/child/session

### Compliance
- Soft gate: warns on assignment of coaches with expired docs, doesn't block
- Expiry alerts at 30 and 7 days. Admin verification required

### Rostering
- Term template + weekly tweaks. Confirm/decline shifts. Swap requests
- Clash detection, availability matching, replacement suggestions

### Guided Session Workflow
1. Start → 2. Named attendance (tap present/absent, quick-add child) → 3. Deliver → 4. End → 5. Feedback → 5a. Incident (if needed) → 6. Complete
Target: under 90 seconds standard flow

### Child Attendance
- Global child records linked to multiple centres
- Named attendance with headcount fallback (tap-to-toggle, quick-add inline)
- CSV import or coach-built lists
- Attendance is immutable after coach submission; only ops/admin can override with audit log entry
- Withdrawn children (centre_children.status = 'withdrawn') excluded from attendance lists
- Multi-centre children tracked independently per centre
- Offline: child lists cached per centre in IndexedDB, attendance queued for sync

### Skill Assessments
- Per-term, AI-generated skills per sport + age group (5–8 skills)
- Ops creates templates, optionally edits AI-generated skills, assigns to coach
- Coach rates each child 1–5 per skill via mobile-optimised tap-to-rate flow
- Save & exit with partial progress support
- Term-over-term progression tracking with per-skill change indicators
- Assessment ready notification (important tier) sent to assigned coach
- Reminder notification after 7 days if incomplete

### Centre Reports
- Auto-generated term-end PDFs
- Content: sessions, attendance, skills, feedback, photos, programs
- BAK branded or co-branded (per centre toggle)
- Ops reviews before sending

### Centre Health Score
- Weighted signals: feedback (30%), payment speed (25%), cancellations (20%), communication (15%), attendance (10%)
- Score 0–100: green (≥75), amber (50–74), red (<50)
- Auto-notify on status change, auto-task on red, churn risk flag at 30 days red

### CRM Pipeline
- Stages: cold_lead → contacted → interested → free_trial → proposal_sent → won / lost / churned
- Lead entry: manual, CSV import, web form
- Email sequences: automated with merge fields, tracking (opens/clicks)
- Trial tracking: tagged sessions, auto-report at trial end, conversion prompt
- Won → auto-create centre record with data carried over

### Revenue Forecasting
- Monthly (3 months) + quarterly (12 months)
- Committed (active centres) + pipeline (weighted by stage conversion probability)
- Breakdowns: centre type, individual centre, pricing model, coach costs, profit margin
- Configurable: conversion rates, seasonal factors, session frequency defaults

### Notifications (Tiered)
- **Urgent** (push + email): shift assignment, cancellation, WWCC expiry, swap request, web form enquiry
- **Important** (push + email fallback): shift reminder, form reminder, announcement, task, assessment ready, health score change
- **Informational** (in-app only): document added, equipment changed, invoice status, feedback received

### Invoicing
- **Inbound (coaches → BAK):** Fortnightly auto-generated from completed sessions. Coach previews, can flag disputes, then sends as PDF email
- **Outbound (BAK → centres):** Generated from session data + pricing. Ops drafts → Admin approves → pushes to QuickBooks

### Equipment
- Two-level tracking: kits (bags) containing itemised inventory
- Linked to roster via smart defaults (sport → suggested kit)
- Simplified check-in: "All good" (one tap) or "Report Issue"
- Issues auto-create Kanban tasks

### Offline (PWA)
- Coach schedule, programs, centre notes: cached for offline viewing
- Forms: fillable offline, queue in IndexedDB, background sync on reconnect
- Named attendance: child lists cached per centre, attendance entries queued in session queue
- Quick-add children offline: child creation + attendance queued together for sync
- Sync indicator: synced (green) / pending (amber) / offline (amber with label)

## Conventions

- Australian English in all UI text
- shadcn/ui components consistently
- Mobile-first for coach and client portals
- RLS on all tables — never bypass on client side
- Server actions for all mutations
- Log significant actions to activity_log
- Supabase Realtime for live updates
- React-PDF for all PDF generation (reports, invoices, trial reports)
- Resend for all transactional email
- recharts for all charts/analytics

## Sports List
Soccer, Basketball, Athletics, Yoga, Pilates, Boot Camp, Swimming, Pickleball, Golf, Hockey, Lacrosse, Motor Skills, Multi-Sport, Cricket, Netball, Tennis, Volleyball, Dance, Gymnastics

## Team
- **Owner:** Founder / strategy (Admin role)
- **Abdul:** Coordinator / ops manager (Ops role)
- **Daniel:** Invoicing support
- **Coaches:** 8–10 active subcontractors
