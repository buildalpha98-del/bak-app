# Build Alpha Kids — Platform Application

## Project Context

This is a Progressive Web App (PWA) for **Build Alpha Kids**, a multi-sport coaching business in South-West Sydney (Bankstown/Liverpool LGAs). The app manages workforce operations: rostering, programs, equipment, forms, invoicing, and communications for ~40 childcare centres and 6–8 schools.

## Tech Stack

- **Frontend:** Next.js 14+ (App Router, TypeScript)
- **UI:** Tailwind CSS + shadcn/ui (default theme) + Lucide React icons
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage)
- **AI:** Anthropic Claude API (program generation)
- **Email:** Resend
- **Invoicing:** QuickBooks Online API (outbound to centres/schools)
- **PDF:** React-PDF or Puppeteer
- **Hosting:** Vercel
- **PWA:** next-pwa + custom service worker

## Branding

- **Name:** Build Alpha Kids (never abbreviated in UI)
- **Primary colour:** #E8712A (orange)
- **Dark text:** #1A1A1A
- **Secondary text:** #666666
- **Backgrounds:** white (#FFFFFF), light grey (#F5F5F5)
- **Language:** Australian English (centre, organisation, programme)
- **Tone:** Professional but warm, parent-friendly for external content

## Folder Structure

```
/app
  /(auth)              — Login, password reset, set password
  /(dashboard)
    /admin             — Admin portal pages
    /ops               — Operations portal pages (Abdul)
    /coach             — Coach portal pages
  /api                 — API routes (notifications, AI, QuickBooks, etc.)
  /feedback/[token]    — Public session feedback page (no auth)
/components
  /ui                  — shadcn components
  /centres             — Centre-related components
  /forms               — Form engine components
  /programs            — Program display components
  /roster              — Roster/session components
  /shared              — Shared/layout components
/lib
  /supabase            — Supabase client (browser, server, middleware)
  /types               — TypeScript types and enums
  /hooks               — Custom React hooks
  /utils               — Helper functions (scheduling, pay rates, etc.)
  /ai                  — AI program generator
  /email               — Email client and templates
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
| Admin | Email + password | /admin | Full access, approvals, reporting |
| Operations (Abdul) | Email + password | /ops | Rostering, programs, equipment, forms, coach management |
| Coach (subcontractors) | Email + password | /coach | Own shifts, programs, forms, hours, invoicing, profile |
| Client (Phase 2) | Magic link | /client | Session visibility |
| Parent (Phase 2) | Magic link | /parent | Holiday clinic booking |

## Core Entities (Database)

- **profiles** — extends Supabase auth.users. Fields: role (admin/ops/coach), status (active/inactive/onboarding), default_pay_rate, ABN, WWCC details
- **pay_rates** — per-coach, per-session-type rates. Rate hierarchy: session override → session-type rate → default base rate
- **compliance_docs** — WWCC, First Aid, police check, insurance, coaching certs, signed policies. Status: pending → verified → expired
- **availability_slots** — coach weekly availability windows + location preferences
- **centres** — childcare centres and schools. Fields: type, address, lat/lng, contacts, pricing_model (centre_funded/parent_funded/per_head), agreed_rate, contract_status, session_preferences
- **centre_notes** — operational notes per centre (general, access/logistics, safety, client relationship)
- **terms** — school terms (8–10 weeks). Status: draft/active/completed
- **term_templates** — recurring weekly session patterns within a term
- **sessions** — individual coaching sessions. Status lifecycle: draft → published → pending_confirmation → confirmed → in_progress → completed/cancelled
- **swap_requests** — coach shift swap requests. Status: pending_coach → pending_ops → approved/rejected
- **programs** — AI-generated or manual session plans. Versioned (parent_version_id). Content stored as JSON
- **equipment_kits** — bags/containers with location tracking (coach/centre/storage)
- **equipment_items** — individual items within kits (type, quantity, condition)
- **equipment_logs** — audit trail of kit movements and issues
- **form_templates** — flexible form definitions (fields stored as JSON). Default types: attendance, incident, session_feedback, risk_assessment, compliance
- **form_submissions** — submitted form data (JSON) with attachments
- **coach_invoices** — fortnightly auto-generated invoices from completed sessions. Status: draft/flagged/ready/sent/paid
- **outbound_invoices** — invoices to centres/schools via QuickBooks. Status: draft/pending_approval/approved/sent/paid
- **announcements** — operational announcements with read receipts
- **shift_threads** — session-specific discussion messages
- **direct_messages** — ops-to-coach direct messages
- **documents** — centralised document storage with categories and role-based visibility
- **tasks** — Kanban tasks with entity linking (centre/session/kit/user)
- **feedback_ratings** — session ratings from centres (1–5 stars via public link)
- **notifications** — tiered notification records (urgent/important/informational)
- **activity_log** — system-wide audit trail

## Key Business Rules

### Pay Rates
- Three-tier hierarchy: session override → session-type rate → coach default rate
- Coaches set their own rates on their profile
- Admin/ops can override at the session level
- Rate unit: per_session or per_hour

### Session Types & Default Rates
- Childcare session (45 min): ~$40/session
- School local: ~$35/hour
- School with travel: ~$40/hour
- Holiday clinic: configurable
- Custom types can be added

### Pricing to Centres/Schools
- Centre-funded: $160–$180 per session
- Parent-funded: $10/child/session
- School per-head: $5/child/session

### Compliance
- Soft gate: system warns when assigning a coach with expired docs but does not block
- Expiry alerts at 30 days and 7 days
- Documents require admin verification (status: pending → verified)

### Rostering
- Term template with weekly tweaks model
- Coaches confirm/decline shifts
- Swap request flow: Coach A → Coach B accepts → Ops approves
- Clash detection: time overlaps, insufficient travel buffer, compliance gaps
- Replacement suggestions ranked by availability, location, utilisation, sport experience

### Forms
- Flexible template engine (not hardcoded)
- Standardised locked fields auto-populate from session context
- Customisable fields per form type and per centre
- Offline submission with sync

### Coach Session Workflow (Single Guided Flow)
1. Start Session → 2. Attendance (headcount) → 3. Deliver session → 4. End Session → 5. Quick feedback (engagement rating + observations) → 5a. Incident report (expandable if needed) → 6. Complete (hours auto-logged)
Target: under 90 seconds for standard flow (no incidents)

### Invoicing
- **Inbound (coaches → BAK):** Fortnightly auto-generated from completed sessions. Coach previews, can flag disputes, then sends as PDF email
- **Outbound (BAK → centres):** Generated from session data + pricing. Ops drafts → Admin approves → pushes to QuickBooks

### Notifications (Tiered)
- **Urgent** (push + email always): shift assignment, cancellation, WWCC expiry 7 days, swap request
- **Important** (push + email fallback at 2hr): shift reminder, form reminder, announcement, task assigned
- **Informational** (in-app badge only): document added, equipment changed, invoice status, feedback received
- DND auto-activates during rostered sessions

### Equipment
- Two-level tracking: kits (bags) containing itemised inventory
- Linked to roster via smart defaults (sport → suggested kit)
- Simplified check-in: "All good" (one tap) or "Report Issue"
- Issues auto-create Kanban tasks

### Offline (PWA)
- Coach schedule, programs, centre notes: cached for offline viewing
- Forms: fillable offline, queue in IndexedDB, background sync on reconnect
- Sync indicator: synced (green) / pending (amber) / offline (amber with label)

## Conventions

- Use Australian English in all UI text and comments
- Use shadcn/ui components consistently
- Mobile-first design for coach portal (minimum 44px touch targets)
- All Supabase queries use RLS — never bypass with service role on client side
- Server actions for all state mutations (never mutate from client directly)
- Log all significant actions to activity_log
- Use Supabase Realtime for live updates on roster and notifications

## Sports List
Soccer, Basketball, Athletics, Yoga, Pilates, Boot Camp, Swimming, Pickleball, Golf, Hockey, Lacrosse, Motor Skills, Multi-Sport, Cricket, Netball, Tennis, Volleyball, Dance, Gymnastics

## Current Team
- **Owner:** Founder / strategy (Admin role)
- **Abdul:** Coordinator / ops manager — primary ops portal user
- **Daniel:** Invoicing support
- **Coaches:** 8–10 active subcontractors, bench of 15–20
