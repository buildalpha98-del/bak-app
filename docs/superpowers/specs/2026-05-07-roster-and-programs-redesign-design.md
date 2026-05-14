# Roster + Program Generation redesign

**Status**: design approved by Jayden, pending spec review
**Date**: 2026-05-07
**Author**: Claude (paired with Jayden)
**Implementation order**: P1 → P2 → P3 → P5 → P4 (each ships independently)

---

## 1. Why this exists

Today's roster and program-generation flows have five concrete UX gaps:

1. AI program generation is locked to the hard-coded `SPORTS` and `STANDARD_EQUIPMENT` enums and a single `ageGroup`. Build Alpha Kids actually runs Multi-Sport programs (Oztag, European Handball, etc.) across mixed age bands (e.g. K–2 + 3–4). The form blocks that.
2. New staff land as `status: 'onboarding'` with zero `availability_slots`. They don't appear on the roster grid (which filters to `status='active'`) and can't be rostered until ops manually flips status and adds slots — duplicate clicks for every new hire.
3. Re-assigning a coach to a shift requires opening the full edit dialog. Duplicating a shift means re-entering everything. Per-shift notes have no home.
4. Re-scheduling means opening every shift to change a date or coach. Modern scheduling apps (Deputy, Google Calendar) let ops drag a card to a new day or row in 1 second.
5. The grid has no visual differentiation between unassigned / confirmed / conflicting / multi-staff shifts. Conflicts (same coach, overlapping times) are invisible until invoicing.

The redesign also unblocks **multi-coach shifts**, which BAK-APP needs for double-coach sessions (large groups, training shadow-shifts) but the schema currently makes impossible (`sessions.coach_id` is single).

## 2. Feature breakdown

| # | Project | Scope summary |
|---|---|---|
| **P1** | **Staff defaults** | New staff land active + auto-seeded Mon–Fri 8:00am–4:30pm availability |
| **P2** | **Program form upgrades** | Custom sport combobox, multi age-group, custom equipment, persistence |
| **P3** | **Shift card power moves** | Inline coach swap, duplicate, notes |
| **P4** | **Drag-and-drop roster + UX polish** | dnd-kit, auto-save, conflict highlighting, mobile, color coding |
| **P5** | **Multi-coach per shift** | `session_coaches` join table, all reads/writes |

## 3. Ordering

Build order: **P1 → P2 → P3 → P5 → P4**.

P5 lands before P4 deliberately. Multi-coach changes what a "shift card" represents — building drag-and-drop for single-coach cards and then rewriting it for multi-coach is wasted work. Better to land the data model first, then build the new UI on top.

P1, P2, P3 are independent quick wins ordered by isolation (P1 has no UI impact, P2 only touches the program form, P3 only touches the session detail surfaces).

---

## 4. Database changes

### P1 — Staff defaults: none

`profiles.status` and `availability_slots` already exist. Change is in application code.

### P2 — Program form + persistence

```sql
-- Custom sports list, org-wide
CREATE TABLE custom_sports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness via functional index (table-constraint
-- form doesn't accept expressions in Postgres)
CREATE UNIQUE INDEX custom_sports_name_unique
  ON custom_sports (lower(name));

-- Custom equipment list, org-wide
CREATE TABLE custom_equipment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_equipment_name_unique
  ON custom_equipment (lower(name));

-- Multi age group on programs (currently single varchar(50))
ALTER TABLE programs
  ADD COLUMN age_groups jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Backfill from existing single age_group column:
UPDATE programs SET age_groups = jsonb_build_array(age_group) WHERE age_group IS NOT NULL;
-- Keep age_group column for v1 (denormalised "primary band") — drop in a later migration.
```

RLS: admin/ops can write `custom_sports` and `custom_equipment`; coach can read.

### P3 — Shift notes

```sql
ALTER TABLE sessions
  ADD COLUMN notes text;
```

`shift_threads` already exists for threaded discussion. The new column is for a quick "single source of truth" note (e.g. "parent collecting at 3:45, check-in required"). Threads remain for longer back-and-forth between ops and the coach.

Decision rationale: a text column is the fastest ship + the simplest UX (one field, edit in place). If we end up wanting history we can graduate to threads later — but you'd have already been using the column productively.

### P4 — DnD: none, plus a small gap-fix in `updateSession`

All drops go through `updateSession`. The existing cert guard only fires when `data.coach_id` is in the patch — so a date-only drop (column change, same coach) currently bypasses it. Fix in P4 (not a schema change, but a behaviour fix to call out): when `date` is in the patch, fetch **all assigned coaches from `session_coaches`** (post-P5 source of truth) and run `bulkCheckCoachCertsForSessions` against the new date. If **any** coach is now invalid for the new date, refuse the drop. This handles both single-coach (today) and multi-coach (post-P5) cleanly.

P4 ships after P5, so by the time the fix lands, `session_coaches` is the authoritative source. The pre-P5 implementation of this fix wouldn't exist — we'd ship P4 in a world where `sessions.coach_id` was still authoritative — but since the build order is P5 then P4, the fan-out version is the only one written.

### P5 — Multi-coach shifts

```sql
BEGIN;

CREATE TABLE session_coaches (
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  assigned_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_session_coaches_user ON session_coaches(user_id);

-- Exactly one primary per session
CREATE UNIQUE INDEX session_coaches_primary
  ON session_coaches(session_id) WHERE is_primary = true;

-- Forward sync: when session_coaches changes, update sessions.coach_id
-- to reflect the current primary (or NULL if no rows remain).
CREATE OR REPLACE FUNCTION sync_sessions_primary_coach()
RETURNS TRIGGER AS $$
DECLARE
  sid uuid := COALESCE(NEW.session_id, OLD.session_id);
  new_primary uuid;
BEGIN
  SELECT user_id INTO new_primary FROM session_coaches
   WHERE session_id = sid AND is_primary = true LIMIT 1;

  UPDATE sessions SET coach_id = new_primary WHERE id = sid;

  -- Auto-transition to needs_replacement when the last coach is removed
  -- from a confirmed/published shift (edge case 4 in section 9).
  IF new_primary IS NULL THEN
    UPDATE sessions
       SET status = 'needs_replacement'
     WHERE id = sid
       AND status IN ('published','pending_confirmation','confirmed');
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_coaches_sync_primary
  AFTER INSERT OR UPDATE OR DELETE ON session_coaches
  FOR EACH ROW EXECUTE FUNCTION sync_sessions_primary_coach();

-- Backfill (inside the same transaction so there's no race window
-- between trigger install and pre-existing rows being mirrored).
INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_at, assigned_by)
SELECT id, coach_id, true, created_at, NULL
FROM sessions
WHERE coach_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
```

**`sessions.coach_id` becomes a read-only cache.** All write paths in the codebase get migrated to write through `session_coaches` (via a new `setSessionCoaches` helper, see §6 P5). This is non-negotiable — leaving direct `coach_id` writes alive would silently desync the join table. Specific call sites to migrate as part of P5:

| File | Function | Change |
|---|---|---|
| `lib/sessions/actions.ts` | `createSession` | After inserting the row, if `coach_id` was provided, insert a primary row in `session_coaches`. Do not write `coach_id` directly on insert. |
| `lib/sessions/actions.ts` | `updateSession` | When `coach_id` is in the patch, route through `setSessionCoaches(sessionId, [coachId])` (deletes existing rows, inserts new primary). Strip `coach_id` from the direct UPDATE payload. |
| `lib/sessions/actions.ts` | `bulkReassignCoach` | Loop through ids, call `setSessionCoaches` for each. |
| `lib/sessions/shift-actions.ts` | `opsApproveSwap` | Replace direct `coach_id` write with `setSessionCoaches(session_id, [proposed_coach_id])`. |
| `lib/sessions/shift-actions.ts` | `declineShift` (line 159) | Current code does `.update({ status: "published", coach_id: null })`. Replace with `setSessionCoaches(sessionId, [])` then `updateSession({ status: "published" })`. The trigger handles coach_id cache; the empty-set won't auto-flip status because the explicit `"published"` write comes immediately after. |
| `lib/rerostering/actions.ts` | `respondToReplacementOffer` (accept path) | Same — write through `setSessionCoaches`. |
| `lib/rerostering/actions.ts` | `cancelSessionAsCoach` (and any other path setting `coach_id: null` during rerostering) | Same pattern as `declineShift`: empty-set via `setSessionCoaches`, then explicit status change. |
| `lib/scheduling/actions.ts` | `recordAdjustment` | Same. |
| `lib/scheduling/actions.ts` | `publishSchedulingRun` | When applying assignments, route through `setSessionCoaches` per session (still one coach each for the AI path; multi-coach UI is a separate flow). |
| `app/api/scheduling/generate/route.ts` | bulk apply loop | Same — replace direct UPDATE with `setSessionCoaches`. |

The CI grep test in §8 (P5) is the safety net: it scans the same directories for any `coach_id` in an `.update({...})` or `.insert({...})` payload outside the `setSessionCoaches` helper file, and fails the build if found. Future call sites can't be missed silently.

All 181 read sites that select `sessions.coach_id` continue to work unchanged — they're reading the trigger-maintained cache. Only writes are migrated. This is the cleanest design we can ship without rewriting 181 read sites in one PR.

A defensive DB trigger that intercepts direct `coach_id` writes is intentionally **not** added — it'd produce trigger recursion (write to coach_id fires reverse trigger → updates session_coaches → fires forward trigger → updates coach_id...). Discipline via the helper function is the simpler and safer mechanism. CI test (see §8) verifies no call site writes `coach_id` directly post-migration.

---

## 5. Frontend / UX changes

### P1 — Staff defaults

UI is unchanged. The Add Staff form's success state already shows "Welcome email sent" — we append "default availability seeded (Mon–Fri 8am–4:30pm). Edit anytime in the Availability tab."

### P2 — Program form

**Sport field**: shadcn `Command` + `Popover` combobox. Typing filters the merged list of `SPORTS` (preset 19) ∪ `custom_sports`. If no exact match, the dropdown shows `+ Add "Oztag"` — pressing it inserts into `custom_sports`, selects the new value, and closes.

**Age group field**: `Checkbox` group, not Select. Visible options: 3–5, 5–8, 8–12 (the existing AgeGroup values). Min 1, no max. Selected values become `ageGroups: string[]` in the API call.

**Equipment**: existing pill picker grows a `+ Add custom equipment` row at the bottom — text input + Add button. On Add: insert into `custom_equipment`, append to the picker pool, select.

**Custom items management**: a new section under `/admin/settings/programs` listing org-wide custom sports + equipment with rename / delete (admin only). Decision C: org-wide = anyone can add, only admin can delete. Prevents typos from polluting forever.

### P3 — Shift card power moves

Each card in the weekly grid grows a 3-dot menu in the top-right (icon button, shows on hover/focus, always visible on mobile):

- **Swap coach** — pops a coach Select tethered to the card (Popover, not full dialog). Selecting saves immediately via `updateSession`. Cert-guarded.
- **Duplicate shift** — creates a new draft session with same date/time/centre/sport but `coach_id=null`, opens the new card in edit mode so the admin can refine. Useful for "same shift Tuesday too".
- **Add note** — small textarea Popover, persists `sessions.notes` on save. Card grows a small "📝" indicator if a note exists, hover shows preview.

### P4 — Drag-and-drop + visual upgrade

**Mechanics**:
- Whole card is draggable (`@dnd-kit/core` + `useDraggable`).
- Drop targets: every cell in the coach × day grid + an "Open shifts" row pinned at the top.
- Drag preview: a translucent clone of the card follows the cursor.
- Drop targets show a 2px dashed outline + light orange wash on hover.
- Snap-to-cell on drop.

**Auto-save**: every drop fires the appropriate server action (`updateSession({ coach_id })` if row changed, `updateSession({ date })` if column changed). Local state updates optimistically; on server error, revert + destructive toast.

**Optimistic concurrency**: drop payload includes `session.updated_at`. Server rejects if stale — toast "Someone else just moved this. Refreshing." then refetch.

**Conflict detection** (computed client-side on render, cheap O(N) per coach per week):
- Source data is the flattened `session_coaches` view, **not** `sessions.coach_id`. After P5, a coach can be primary on Session A and secondary on Session B — single-coach detection would miss the overlap.
- A `(coach, session)` pair is "conflicting" if the same coach appears in another non-cancelled `session_coaches` row whose session's `[time, time+duration]` overlaps on the same date.
- Conflict state: red left-border (3px), tiny red dot in the corner, tooltip "Coach is on overlapping shift at <other-centre> from <time>".
- Drop is **allowed** on conflict (per Decision D). Ops sees the red flag and decides what to do.

**Color coding**:
- Unassigned shifts: dashed border, grey background, "Open shift" label
- Confirmed/published/in-progress/completed: solid border, status-driven left-border colour (existing pattern)
- Conflicting: red left-border + dot
- Multi-staff (P5): orange "+N" badge on the primary card, "↔" indicator on linked cards

**Mobile (< 768px)**:
- DnD via `@dnd-kit` `TouchSensor` with 250ms long-press activation + 5px movement threshold (disambiguates from scroll).
- Single-column day view (one day visible, swipe left/right between days).
- Sticky day header.

### P5 — Multi-coach UI

**Session detail sheet**:
- Coach field becomes a chip-style multi-select. First selected = primary (rate driver). Drag to reorder; first chip always wins.
- Sub-text under the chips: "Primary coach drives pay rate. Others paid at their own rates."

**Roster grid**:
- A multi-coach session appears in each assigned coach's row.
- The primary's card shows the orange "+N others" badge.
- Secondary cards show a "↔ shared" badge + thinner left-border.
- Clicking any of them opens the same detail sheet.

---

## 6. Backend logic requirements

### P1

`createStaffMember`:
- Set `profiles.status = 'active'` instead of `'onboarding'` on insert.
- After profile insert, batch-insert into `availability_slots`:
  ```ts
  for (let dow = 1; dow <= 5; dow++) {
    slots.push({
      user_id, day_of_week: dow,
      start_time: '08:00:00', end_time: '16:30:00',
      location_preferences: [],
    });
  }
  ```
- Only seed if no existing slots (don't overwrite an admin who manually added some).
- Both changes are non-fatal on failure: log + return success anyway (status is more important).

### P2

`getCustomSports()` / `addCustomSport(name)` / `deleteCustomSport(id)` server actions; similar for equipment.

`saveProgram` accepts `ageGroups: string[]` (writes to `programs.age_groups`), keeps backfilling `age_group` to the first element until v2.

AI prompt update (`lib/ai/generate-program.ts`):
- Accept `ageGroups: string[]`.
- **Output shape is locked to a single activity set with explicit per-band scaffolds**, not N parallel programs. Each activity in the returned JSON has a new optional `scaffolds: Record<AgeBand, string>` field where the keys are the requested age groups and the values are 1-2 line modifications ("for 3–5s: walk instead of run; for 5–8s: standard; for 8–12s: add an obstacle"). When only one band is selected, `scaffolds` is omitted.
- Prompt: "You are building one coaching session a single coach can deliver to a mixed-age group. Design activities at the youngest selected band's level. For each activity, provide scaffolds: how to adjust the activity for the other selected bands. Return a single program — never a list of programs."
- `ProgramContentJson` schema gets a new optional `scaffolds: Record<string, string>` per activity. Frontend renderer (`ProgramView`) shows scaffolds as a small "By age" section under each activity when present.
- For unknown sports (custom): "If the sport is unfamiliar, focus on general fundamentals appropriate to the youngest selected age band: ball-handling, evasion, balance, teamwork."

### P3

- `duplicateSession(id)` server action: select original by id (admin/ops only), insert new row with same fields except `id`, `coach_id=null`, `status='draft'`, `started_at=null`, `completed_at=null`. Returns new session id; revalidate roster.
- `updateSessionNotes(id, notes)` server action: write-through. **Permission**: admin/ops, OR any coach in `session_coaches` for the shift (covers both single-coach today and multi-coach after P5). Single rule, no ambiguity. Activity log entry.

### P4

- No new server actions. Drops route through `updateSession`.
- **Cert-guard gap fix**: extend `updateSession` so the guard runs when **either** `coach_id` **or** `date` is in the patch. When `date` is in the patch, fetch **every assigned coach from `session_coaches`** for that session and call `bulkCheckCoachCertsForSessions([{coachId, sessionId, sessionDate: newDate}, ...])`. If any coach is blocked for the new date, refuse the whole drop. (Post-P5, sessions can have multiple coaches; the guard must fan out, not check a single `coach_id` cache.) Without this fix, a column-only drop bypasses the guard.
- Optimistic concurrency: client passes `expectedUpdatedAt` in the patch. Server reads current `updated_at`, rejects with a 409-equivalent (`{ error: "stale", currentUpdatedAt }`) if mismatched. Existing `updateSession` doesn't do this — extend it with an **optional** `expectedUpdatedAt` parameter so existing callers (status transitions, swap accept, scheduling apply) are unchanged. Only the DnD path passes it. Callers that don't pass it remain non-concurrency-checked; that's the existing behaviour and acceptable for now (a follow-up task to apply checks everywhere is captured in §11 out-of-scope).
- Existing realtime hook (`useSessionsRealtime`) propagates moves to other ops sessions.

### P5

- New `setSessionCoaches(sessionId, coachIds: { userId: string; isPrimary: boolean }[])` helper — the **only** write path to `session_coaches`. Used by everything from single-coach `createSession` (just `[{ id, primary: true }]`) through to multi-coach assignment. Inside one transaction: delete rows not in the new set, upsert the rest, validate exactly one `isPrimary: true`.
- New `assignCoaches(sessionId, coachIds[])` server action wraps `setSessionCoaches` for the multi-coach UI flow (admin/ops auth, cert-guard fan-out, activity log).
- `bulkReassignCoach` continues to exist but is rewritten internally to call `setSessionCoaches` per session.
- Cert guard: per-coach. `bulkCheckCoachCertsForSessions` already supports this shape. If any coach fails, the whole assignment rejects with a list of who's blocked and why — no partial writes.
- Cost projection (`lib/utils/roster/cost-projection.ts`): for each `session_coach`, price at that coach's resolved rate × hours. Sum across all assigned coaches. **Decision E**: per-rate-summed.
- Notifications: every assigned coach gets a roster notification; primary's includes "you're the lead, X and Y are with you".
- Swap requests: scoped to `(session_id, requesting_coach_id)` — a single coach can swap out of their slot without taking the others with them.
- **Activity log**: per-coach entries — `staff_assigned_to_session`, `staff_removed_from_session`, `session_primary_changed`. One row per change, not one per session.
- **Zero-coach state**: if `setSessionCoaches` is called with an empty array, the trigger flips a `published`/`pending_confirmation`/`confirmed` session to `needs_replacement` automatically (see §4 P5 trigger body). `draft` sessions stay `draft`. `setSessionCoaches` does not refuse the empty case — ops needs to be able to clear a shift without it.

---

## 7. Tech implementation

| Need | Tool / Pattern |
|---|---|
| Combobox (custom sport) | shadcn `Command` + `Popover` — already in deps |
| Multi-select checkboxes | `Checkbox` from `components/ui` |
| DnD core | `@dnd-kit/core` + `@dnd-kit/sortable` — already in deps |
| Touch / long-press | `@dnd-kit` `TouchSensor`, 250ms activation, 5px tolerance |
| Optimistic updates | `revalidatePath` + local state rollback on error |
| Realtime collision | Existing `useSessionsRealtime` |
| Migration runner | Supabase migration files in `supabase/migrations/` |

No new top-level dependencies.

## 8. Testing strategy

- **P1**: unit test the default-slot generation helper (5 rows, correct day_of_week + times). Integration check the createStaffMember code path.
- **P2**: unit test the program form's "+ Add custom" flow (mock the server action), unit test the AI prompt builder with `ageGroups: ['3-5', '5-8']`.
- **P3**: unit test `duplicateSession` (correct field copy, status reset, returns new id).
- **P4**: unit test the conflict detection helper (overlapping time math); integration test the drop → server action → revalidate path; mobile interaction test via TouchSensor mock.
- **P5**: unit tests for `setSessionCoaches` / `assignCoaches` (one-primary invariant, cert-guard fan-out, atomic write, empty-set zero-coach transition); migration sanity test (backfill correctness — every session with coach_id ends up with a primary row); **CI guard test** that greps `lib/`, `app/`, `components/` for any direct `coach_id` writes outside `setSessionCoaches` and fails the build if found.

All existing tests should continue to pass — the `coach_id` denormalisation specifically preserves the current contract for read sites. Existing write sites are migrated to `setSessionCoaches`; their tests are updated to assert the new write path.

---

## 9. Edge cases

| | Case | Plan |
|---|---|---|
| 1 | Drag-drop to a date where assigned coach's WWCC just expired | Cert guard refuses; optimistic UI reverts; toast explains |
| 2 | Two ops drag the same shift simultaneously | `expectedUpdatedAt` optimistic concurrency + realtime refresh |
| 3 | Multi-coach where one coach is archived/`inactive` | UI hides archived from picker; existing rows show "(archived)" tag; can still demote primary to remove |
| 4 | Last coach removed from a confirmed shift | Trigger auto-flips status to `needs_replacement` (only when status was published/pending_confirmation/confirmed). Existing rerostering offer flow then handles replacement. |
| 5 | Custom sport typo "Soccor" | Admin can rename/delete from `/admin/settings/programs`. Case-insensitive functional unique index prevents exact duplicates. |
| 6 | Staff defaults seeding when slots already exist | Skip seed (don't overwrite). Tested. |
| 7 | Mobile drag vs vertical scroll | TouchSensor activation distance 5px disambiguates |
| 8 | Cost projection with primary coach unpriced | Surfaces in `unpricedSessions` count (already does); per-coach split inherits |
| 9 | Conflict detection retroactive after manual create | Recompute on read each render; source is `session_coaches`, not `sessions.coach_id`. |
| 10 | Multi-age program saved without AI | Allowed; field independent of generation |
| 11 | DST boundary in default availability | Times stored as `time` (no tz). 8:00–16:30 local at the centre. Cron and roster reads stay in centre-local interpretation. |
| 12 | New code accidentally writes `sessions.coach_id` directly post-P5 | CI test asserts no `sessions.coach_id` writes outside the `setSessionCoaches` helper (grep + assertion). Defensive DB trigger NOT used (would recurse). |
| 13 | Empty `age_groups` array | Validation: min 1 selected, prevent submit |
| 14 | DnD on touch device with reduced-motion preference | Honour `prefers-reduced-motion`, snap without animation |
| 15 | Duplicate a cancelled shift | Allow; new copy gets `status='draft'`, `cancellation_reason=null` |
| 16 | Drag-only-date drop where coach's WWCC expires before new date | `updateSession` runs cert guard when `date` is in patch (gap fix called out in §6 P4). Drop is refused; optimistic UI reverts. |
| 17 | Two-coach session where coach A is primary on session X and secondary on overlapping session Y | Conflict detection now reads `session_coaches` flattened, catches the overlap on both cards. |
| 18 | Concurrent edit race not covered by P4 concurrency check (e.g. swap accept) | Existing behaviour preserved for non-DnD writes. Out-of-scope to extend, see §11. |

---

## 10. Decisions captured

| ID | Decision | Choice |
|---|---|---|
| A | Build order | P1 → P2 → P3 → P5 → P4 |
| B | Shift notes storage | `sessions.notes` text column |
| C | Custom sports/equipment scope | Org-wide, admin-only delete |
| D | DnD on conflicting drop | Allow + mark red |
| E | Multi-coach cost split | Per-rate-summed |

---

## 11. Out of scope (for this design)

- Kiosk time-clock (amana PR #57–#63) — separate question, defer
- Open-shift claim model (amana PR #53–#54) — BAK-APP's rerostering offer flow already covers the need
- Refactoring legacy `getComplianceWarningsForSessions` callers — already done in `5dc6fde`
- Eliminating `sessions.coach_id` entirely — the trigger keeps it as a cache; full migration is a follow-up
- Per-shift child-attendance integration with multi-coach (which coach signs each child in) — works fine with the existing UI today, can be revisited if needed
- Extending optimistic-concurrency (`expectedUpdatedAt`) to all `updateSession` callers — only DnD passes it in P4; existing callers are left unchanged. Treating this as a follow-up "tighten everywhere" task once P4 has bedded in.

---

## 12. Implementation milestones

Each project is a separate PR:

1. **P1** — `feat(staff): seed default Mon-Fri availability + ship as active` — 1 file change, ~30 lines
2. **P2** — `feat(programs): custom sport/equipment + multi-age selection` — combobox, picker, 2 migrations, AI prompt
3. **P3** — `feat(roster): inline swap, duplicate, notes on session card` — 1 migration, 2 new actions, card overflow menu
4. **P5** — `feat(roster): multi-coach per shift via session_coaches join table` — 1 migration, new assignCoaches action, cert-guard fan-out, cost projection split, UI multi-select
5. **P4** — `feat(roster): drag-and-drop scheduling + color coding + mobile polish` — dnd-kit wiring, conflict highlight, optimistic concurrency, responsive grid

Each PR is independently shippable. P5 lands before P4 because dragging a multi-coach card is meaningfully different from dragging a single-coach card.
