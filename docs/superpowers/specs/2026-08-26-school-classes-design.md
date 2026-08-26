# School classes & year groups — design proposal

**Status:** proposal (no code). Written 2026-08-26 as part of the school-portal
build-out; the goal is to agree the shape before any migration lands.

## Problem

Schools organise children by **class** (e.g. "3B", "Kindy Red") inside **year
groups** (K–6), with a **class teacher** as the contact. The platform organises
children by `children.age_group` ("3-5", "5-8", "8-12"), which is a childcare
concept. Consequences today:

- A school session serves "8-12" rather than "Year 3 & 4", so rosters, skill
  assessments and reports can't answer the questions a principal actually asks
  ("how is 3B tracking?", "which classes haven't had athletics yet?").
- The portal roster is one flat list — a 400-student school gets a single
  searchable list with an age filter that doesn't match how they think.
- There is nowhere to record the class teacher, so session-day logistics
  (wet-weather calls, pickup points) go through the front office.

## Design principles

1. **Additive, optional structure.** Childcare centres never see classes.
   A school without class data behaves exactly as today. No behavioural change
   ships in the schema migration itself.
2. **Classes are labels over children, not a parallel enrolment system.**
   `centre_children` remains the enrolment source of truth; a class groups
   those enrolments.
3. **Terms roll over; classes belong to a school year.** "3B 2026" and
   "3B 2027" are different rows — history stays intact.

## Schema (three additive pieces)

```sql
-- 1. Classes within a school
CREATE TABLE school_classes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id     uuid NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  name          text NOT NULL,            -- "3B", "Kindy Red"
  year_group    text NOT NULL,            -- "K", "1" … "6" (text: composite/HSIE-style groups exist)
  school_year   int  NOT NULL,            -- 2026
  teacher_name  text,
  teacher_email text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (centre_id, school_year, name)
);

-- 2. Membership (a child can move classes mid-year; history kept via ended_at)
CREATE TABLE school_class_children (
  class_id   uuid NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  child_id   uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  ended_at   date,
  PRIMARY KEY (class_id, child_id)
);

-- 3. Sessions can target classes (nullable — childcare sessions ignore it)
ALTER TABLE sessions ADD COLUMN school_class_ids uuid[] DEFAULT NULL;
```

Why an array on `sessions` rather than a join table: a session typically serves
1–2 classes, the roster grid already reads `sessions` in one query, and the
P5 lesson (sync-trigger + single write path) showed join tables are worth it
only when per-row metadata exists — there is none here.

RLS mirrors migration 061: staff ALL, client SELECT via
`auth_client_centre_ids()`.

## What builds on it (in order of value)

1. **Portal roster grouped by class** — `/client/[centreId]/children` gains a
   Year/Class group-by when the centre is a school and has classes. The flat
   list stays as fallback. (Small.)
2. **Attendance + assessment rollups per class** — "3B: 92% attendance, skills
   up 0.6 this term" on the Impact page and in term reports. This is the
   feature that sells to principals; it's pure aggregation over existing data
   once membership exists. (Medium.)
3. **Session targeting** — ops assigns classes when scheduling school sessions;
   the coach's session sheet shows "Year 3 — 3B & 3G" and pre-filters the
   attendance list to those classes. (Medium.)
4. **Teacher contact on the session card** — coach sees the class teacher's
   name for day-of logistics. (Tiny, ships with #3.)

Explicitly out of scope: teacher portal logins (teachers are not
`client_users`; if a school wants a teacher to see the portal, the primary
contact invites them — colleague invites shipped 2026-08-26), timetable/bell
integration, and per-class billing.

## Data entry

Admin-side CSV import on the centre detail page ("Import class list": name,
year, class, teacher) reusing the parent bulk-invite import pattern from
`/admin/parents/import`. Schools already export this from their SIS. Manual
add/edit UI for corrections. No self-service class editing in the portal for
v1 — the class list changes once a year.

## Rollout

1. Migration (tables + RLS) — invisible, zero risk.
2. Import tooling + backfill one pilot school's class list.
3. Portal group-by (#1) behind the school check, verified with the pilot.
4. Rollups (#2) next term boundary, so the first per-class report covers a
   full term of data.

## Open questions for Jayden

- Composite classes ("5/6M") — one class row with `year_group = '5/6'`, or
  is per-child year group needed anywhere? (Proposal assumes class-level is
  enough.)
- Do we want `age_group` auto-derived for school children from year group so
  programme generation keeps working unchanged? (Proposal: yes — K–2 → "5-8",
  3–6 → "8-12", override stays possible.)
- Is teacher_email worth collecting in v1 if nothing emails them yet?
