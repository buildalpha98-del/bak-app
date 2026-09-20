# Teacher assessments in the portal + rollout hardening — design

**Date:** 2026-09-20
**Status:** approved by the founder's brief ("work on the gaps … fully viable the first
day for the PDHPE department, then duplicate to English and Maths"). Written and decided
autonomously after the production rollout rehearsal; assumptions are called out inline.

## Why

The 20 Sep rehearsal proved the whole school workflow end to end on production, and
left three gaps that decide whether a $50–60M school can run a PDHPE department on the
platform from day one:

1. **Teachers cannot enter anything.** Every mark on a report card is coach-entered; the
   client role is read-only apart from feedback, messages and change requests. The
   founder's vision is AI builds the curriculum, the school completes the assessments.
2. **A term can end with an empty report while everything "worked".** Nothing completes
   a past session; the term report counts only completed sessions.
3. **An assessment created without a term produces no tasks** and the dialog defaults to
   "All terms".

Out of scope for this spec (deliberately): quizzes for students, a subject abstraction
beyond PDHPE, Scope & Sequence copy polish, multi-campus contacts.

## Sub-project A — Teacher role and teacher-entered assessments

### Approaches considered

- **A1 (chosen): the portal gets an Assessments page that reuses the coach rating flow
  and writes `skill_ratings`.** One table, one report pipeline, one CSV. Teachers are
  `client_users` rows with `role = 'teacher'` and an optional class scope.
- A2: a separate `teacher_assessments` table merged at report time. Rejected — every
  reader (report card, term report, rollups, Impact, CSV, insights) would need a second
  source, and "movement" between terms would have to reconcile two tables.
- A3: teachers get coach (`profiles`) accounts. Rejected — coaches see pay, invoicing,
  rostering; RLS for `coach` is built around `session_coaches`; teachers would be
  phantom staff.

### Data model (migration 088)

- `client_users.class_ids uuid[] NOT NULL DEFAULT '{}'` — the classes a teacher may
  assess. Empty means every class at the centre (principals, colleagues).
  `role` stays free text; the new value is `'teacher'`.
- `skill_ratings.coach_id` becomes nullable; new `skill_ratings.client_user_id uuid
  REFERENCES client_users(id) ON DELETE SET NULL`; `CHECK (coach_id IS NOT NULL OR
  client_user_id IS NOT NULL)`. Who assessed is whichever is set.
- `auth_client_user_ids()` — SECURITY DEFINER helper in the same bypass-RLS pattern as
  `auth_client_centre_ids()`, returning the caller's `client_users.id`s.
- Policies on `skill_ratings` for the client role:
  - INSERT `WITH CHECK`: `client_user_id IN (SELECT auth_client_user_ids())`, the child
    is in `centre_children` for one of the caller's centres, and the template is global
    or belongs to one of those centres.
  - UPDATE `USING`/`WITH CHECK`: the same, so a teacher can re-rate but never rewrite a
    coach's row (a coach row has `client_user_id IS NULL`, which fails the first clause).
  Class scope is enforced in the application layer, not RLS — a teacher is school staff
  and the school already reads every student.

### Server actions — `lib/client/assessment-actions.ts` (cookie client; RLS decides)

- `getClientAssessmentTasks(centreId)` — mirrors `getCoachAssessmentTasks` but keyed by
  centre rather than by coach sessions: active term → templates for that term that are
  global or the centre's → one task per current class (filtered to the caller's
  `class_ids` when non-empty; centres without classes get one band-wide task) →
  children by age band with `already_rated`. Returns the same `AssessmentTask` shape
  the coach flow consumes.
- `saveClientChildRating(input)` — upsert on `(assessment_template_id, child_id,
  term_id)` with `client_user_id` = caller's row for that centre and `coach_id = null`.
  Rejects when the caller has a class scope and the child is outside it.

### UI

- `components/assessments/assessment-rating-flow.tsx` — the existing coach view with the
  save injected (`save: (input) => Promise<{ error }>`) and the noun configurable
  ("children" / "students"). `coach-assessment-view.tsx` becomes a thin wrapper so the
  coach page is byte-for-byte unchanged in behaviour.
- `app/client/[centreId]/assessments/page.tsx` — schools only; nav item "Assessments"
  between Students and Our Coaches. Teachers, colleagues and the primary contact all get
  it; teachers see only their classes.
- Report card: a rating row entered by a teacher shows its `notes` as **Teacher
  comment** under that sport's marks (coach notes were never printed; that stays).
- Portal child page and admin assessment detail: "Assessed by" falls back to the
  client user's name when `coach_id` is null.
- Inviting a teacher: on the centre's Classes tab each class card gets **Invite
  teacher** (name prefilled from the class's `teacher_name`, email typed). Calls
  `inviteClientUser` extended with `role` and `classIds`; existing `provisionPortalUser`
  gains those two fields. A teacher already invited for another class gets the class
  appended rather than a duplicate row.
- Teacher role in the shell: no Invoices, no Settings team management (they can still
  edit their own name). Everything else is the same read portal.

### Testing

- Unit: task construction (class filter, band grouping, already_rated), save guard
  (class scope), outcome of `assessedByLabel`. Migration guard test that no code path
  writes `skill_ratings` without exactly one of `coach_id`/`client_user_id`.
- Seam (e2e, read-only exception like feedback-RLS): sign in as a teacher client user,
  insert one rating through the cookie client, read it back on the child page, delete
  via service role in `finally`.

## Sub-project B — Nightly session auto-complete

`app/api/cron/session-autocomplete/route.ts`, daily at 13:30 UTC (23:30 Sydney).
Sessions with `status IN ('published','pending_confirmation','confirmed')` and
`date < sydneyTodayIso()` become `completed` with `completed_at = now()`,
`needs_ops_review = true` and an `activity_log` row, so the roster's review queue shows
them and the term report stops silently dropping them. Drafts and cancelled sessions are
untouched; `in_progress` sessions the coach forgot to close are completed the same way.
The date predicate lives in a pure helper with a unit test at a fixed instant.

## Sub-project C — Create assessment defaults to the active term

The admin Assessments page already loads terms; it passes `activeTermId` and the dialog
initialises `termId` to it. "All terms" remains selectable. Duplicate warning unchanged.

## Sequencing

C (15 min) → B (1 h) → A migration + actions + tests → A UI → A invite → seam test →
playbook update. Each lands as its own PR on `main`, verified against production data
where the rehearsal school still exists.

## Toward English and Maths

Nothing here is PDHPE-specific except the outcome-code prefixes in
`lib/schools/outcome-codes.ts` and the sport-keyed templates. The duplication path is a
`subject` on `assessment_templates` and `programs` with a per-subject outcome-code map;
the teacher role, rating flow, report card and rollups carry over unchanged. Not built
now.
