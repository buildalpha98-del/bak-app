# Children & Named Attendance — Design Spec

## Overview

Extend the BAK platform from headcount-only attendance to per-child named attendance tracking. Introduces child records, centre-child relationships, and session-level attendance records.

## Database Schema

### New Enums
- `age_group_enum`: '3-5', '5-8', '8-12'
- `gender_enum`: male, female, other, prefer_not_to_say
- `child_status_enum`: active, inactive
- `enrolment_status_enum`: active, withdrawn

### New Tables

**children** — global child records
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| date_of_birth | date | nullable |
| age_group | age_group_enum | NOT NULL |
| gender | gender_enum | nullable |
| medical_notes | text | nullable |
| parent_name | text | nullable |
| parent_phone | text | nullable |
| parent_email | text | nullable |
| photo_url | text | nullable |
| status | child_status_enum | NOT NULL DEFAULT 'active' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**centre_children** — many-to-many link
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| child_id | uuid | FK children, NOT NULL |
| centre_id | uuid | FK centres, NOT NULL |
| enrolled_at | date | DEFAULT CURRENT_DATE |
| status | enrolment_status_enum | NOT NULL DEFAULT 'active' |
| created_at | timestamptz | DEFAULT now() |
| UNIQUE(child_id, centre_id) |

**session_attendances** — per-session attendance
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK |
| session_id | uuid | FK sessions, NOT NULL |
| child_id | uuid | FK children, NOT NULL |
| present | boolean | NOT NULL DEFAULT false |
| created_at | timestamptz | DEFAULT now() |
| UNIQUE(session_id, child_id) |

### RLS Policies
- Admin/Ops: full CRUD on all three tables
- Coach: SELECT children via centre_children linked to centres where they have sessions; INSERT children (quick-add); INSERT/UPDATE session_attendances for own sessions
- Client (prep): SELECT children linked to their centre

## Pages & Components

### Children Management (/ops/children, /admin/children)
- **List view**: searchable, filterable (centre, age group, status), sortable table
- **Add child form**: all fields + multi-select centre assignment
- **Detail page** (/ops/children/[id]): editable fields, linked centres, attendance history with stats

### CSV Import (/ops/children/import)
- Upload CSV, preview rows, select target centre
- Duplicate detection on first_name + last_name at same centre
- Import summary: created / skipped / errors

### Centre Detail — Children Tab
- List children at this centre with attendance stats
- Add Child / Import CSV buttons
- Withdraw action (sets centre_children.status = 'withdrawn')

### Updated Session Workflow — Attendance Step
- Pre-populated list of children at session's centre (filtered by age group if set)
- Tap-to-toggle present/absent (all default absent)
- Quick-add child inline (name + age group → create + link + mark present)
- Auto headcount from present count
- "Headcount Only" toggle fallback
- On complete: upsert session_attendances records

### Attendance Display
- Session detail (ops/admin): attendance list with names + status
- Coach completed session: submitted attendance review
- Centre children tab: per-child attendance % (attended / total sessions)

## Server Actions

- `lib/children/actions.ts`: CRUD children, link/unlink centres, search, import
- `lib/attendance/actions.ts`: get attendance for session, save attendance, get child stats

## Key UX Constraint
15-child attendance in under 30 seconds. Pre-populated tap-to-toggle list is critical.
