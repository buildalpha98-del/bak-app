# P5 — Multi-Coach Per Shift Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `sessions.coach_id` as the source-of-truth for who is staffing a shift with a `session_coaches` join table, so a single shift can have N coaches with one designated primary (rate driver). The legacy `sessions.coach_id` column becomes a trigger-maintained cache so existing read sites continue to work.

**Architecture:** Single migration creates the join table, a partial-unique index enforcing exactly one primary per session, an `AFTER INSERT/UPDATE/DELETE` trigger that mirrors the primary back to `sessions.coach_id` (and auto-flips zero-coach published shifts to `needs_replacement`), and an in-transaction backfill from the existing `coach_id` rows. A new `setSessionCoaches` helper is the **only** write path to the join table — every existing call site that currently writes `sessions.coach_id` is migrated to write through it. A new `assignCoaches` server action wraps the helper for the multi-coach UI flow with admin/ops auth + cert-guard fan-out + activity log entries. A vitest CI guard test greps `lib/`, `app/`, `components/` for any direct `coach_id` writes outside the helper file and fails the build if found. The UI (roster grid + session detail sheet) is upgraded last: the grid renders one card per assigned coach with a primary "+N others" badge and secondary "↔ shared" badges; the detail sheet replaces the single-coach `SmartCoachSelect` with a chip multi-select where the first chip drives the pay rate.

**Tech Stack:** Supabase (PostgreSQL trigger + RLS), Next.js 14 server actions, TypeScript, vitest for unit + CI guard tests, base-ui `Command`/`Popover` for the chip multi-select.

**Spec:** `docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md` (sections 4 P5, 5 P5, 6 P5, 8 P5, 9 cases 3/4/17, 10 decision E)

---

## File structure

### New files

| Path | Responsibility |
|---|---|
| `supabase/migrations/048_session_coaches.sql` | Join table + unique-primary index + sync trigger + backfill |
| `lib/sessions/session-coaches.ts` | `setSessionCoaches` helper — the single write path |
| `lib/sessions/__tests__/session-coaches.test.ts` | Unit tests for the helper (one-primary, empty-set, atomic write) |
| `lib/sessions/__tests__/assign-coaches.test.ts` | Unit tests for the server action (cert fan-out, auth, activity log) |
| `lib/__tests__/no-direct-coach-id-writes.test.ts` | CI guard: greps source for direct `coach_id` writes outside the helper |
| `components/roster/coach-chip-multiselect.tsx` | Chip multi-select with primary-first ordering for the detail sheet |

### Modified files

| Path | Change |
|---|---|
| `lib/types/database.ts` | Add `SessionCoach` interface; nothing else (the `Session` interface keeps its denormalised `coach_id` cache) |
| `lib/sessions/actions.ts` | Add `assignedCoaches: SessionCoach[]` to `SessionWithRelations`, extend read helpers to join `session_coaches`. Migrate `createSession`, `updateSession`, `bulkReassignCoach` to write through `setSessionCoaches`. Strip `coach_id` from direct UPDATE payloads. Add new `assignCoaches` server action. |
| `lib/sessions/shift-actions.ts` | Migrate `opsApproveSwap` (line ~436) and `declineShift` (line ~159) to write through `setSessionCoaches` |
| `lib/rerostering/actions.ts` | Migrate `respondToReplacementOffer` (line ~228) and `cancelSessionAsCoach` (line ~43) to write through `setSessionCoaches` |
| `lib/scheduling/actions.ts` | Migrate `recordAdjustment` (line ~90) to write through `setSessionCoaches`. Note: `publishSchedulingRun` itself does NOT write `sessions.coach_id` — only writes `status`; the actual scheduling-coach write goes through `app/api/scheduling/generate/route.ts`. `scheduling_preferences.coach_id` writes elsewhere in this file are unrelated (different table, legitimate). |
| `app/api/scheduling/generate/route.ts` | Migrate bulk apply loop (line ~135) to write through `setSessionCoaches` |
| `lib/roster/cost-actions.ts` | Fan out the priced-session build (line ~127) from per-session to per-(session, coach) using `session_coaches` |
| `lib/utils/roster/__tests__/cost-projection.test.ts` | Add multi-coach test cases (per-rate-summed; one primary + one secondary on the same shift produces two byCoach rows) |
| `components/roster/session-card.tsx` | Render "+N others" badge on the primary's card when the session has secondary coaches |
| `components/roster/staff-roster-view.tsx` | Same, plus "↔ shared" badge with thinner left border on secondary cards |
| `components/roster/session-detail-sheet.tsx` | Swap `SmartCoachSelect` for `CoachChipMultiselect`; replace `handleSmartSelect` with `handleAssignCoaches` that calls the new server action |
| `lib/sessions/coach-actions.ts` | Update `getCoachSessionDetail` to fetch `assignedCoaches` alongside the existing single-coach data (so the coach detail page shows "you + 1 other") |

### Files explicitly NOT touched

- **181 read sites that `SELECT sessions.coach_id`** — stay unchanged. The trigger keeps `coach_id` populated with the primary; existing single-coach UIs continue to work as a degraded view of the multi-coach data. Migrating them is a follow-up out of scope for P5 (spec §11).
- `lib/utils/roster/cost-projection.ts` itself — the pure aggregator's signature is fine; only the caller (cost-actions.ts) fans out per coach.

---

## Chunk 1: Data layer + write helpers

This chunk produces the join table, the sync trigger, the canonical helper, and the server action — but no call site has been migrated to use them yet. After this chunk, the codebase still writes `sessions.coach_id` directly everywhere; the helper exists and is unit-tested in isolation. Each subsequent task in Chunk 2 migrates one call site to use the helper.

### Task 1: Migration 048 — `session_coaches` table + trigger + backfill

**Files:**
- Create: `supabase/migrations/048_session_coaches.sql`

- [ ] **Step 1: Author the migration**

```sql
-- ============================================================
-- Migration 048: session_coaches join table
-- ============================================================
--
-- Multi-coach per shift. `sessions.coach_id` becomes a denormalised
-- cache of the current primary, maintained by a trigger that fires
-- on any insert/update/delete to this join table. The cache exists
-- so the 181 existing read sites that select coach_id keep working
-- without rewriting them in one PR.
--
-- Exactly one primary per session is enforced by a partial unique
-- index. If the last coach is removed from a published / pending
-- / confirmed shift, the trigger auto-flips the session status to
-- `needs_replacement` (edge case 4 in master spec §9).

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

-- RLS: same access model as sessions itself. Any role that can see
-- a session row can see its coach assignments; only admin/ops and
-- the helper write path (server actions under service-role context
-- via setSessionCoaches) write.
ALTER TABLE session_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_coaches read"
  ON session_coaches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_coaches.session_id
        -- inherit the same access path as the sessions row
        AND (
          auth_user_role() IN ('admin','ops')
          OR s.coach_id = auth.uid()
          OR session_coaches.user_id = auth.uid()
        )
    )
  );

CREATE POLICY "session_coaches admin write"
  ON session_coaches FOR ALL
  USING (auth_user_role() IN ('admin','ops'))
  WITH CHECK (auth_user_role() IN ('admin','ops'));

-- Backfill (inside the same transaction so there's no race window
-- between trigger install and pre-existing rows being mirrored).
INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_at, assigned_by)
SELECT id, coach_id, true, created_at, NULL
FROM sessions
WHERE coach_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Spot-check the SQL**

There's no local Supabase running. Read the SQL back in this PR's diff to catch common mistakes:
- Missing `ON CONFLICT DO NOTHING` on the backfill (would error on re-run)
- `auth_user_role()` returns `text`; the policy must compare against text values (`'admin'`, `'ops'`), not enum literals — see migration 006 for the convention
- `SECURITY DEFINER` + `REVOKE EXECUTE FROM PUBLIC` + `GRANT EXECUTE TO authenticated` must all be present on the RPC

- [ ] **Step 3: ⏸ Controller applies migration 048 via Supabase MCP**

Controller note: stop here and apply via MCP `apply_migration` BEFORE committing or pushing any code that uses the helper:
- `project_id`: `yhairjbwqvmrbbvatrze`
- `name`: `session_coaches`
- `query`: contents of `supabase/migrations/048_session_coaches.sql` (everything between `BEGIN;` and `COMMIT;`)

Verify via MCP `execute_sql` immediately after apply:

```sql
SELECT
  (SELECT count(*) FROM session_coaches) AS total_rows,
  (SELECT count(DISTINCT session_id) FROM session_coaches) AS sessions_with_a_coach,
  (SELECT count(*) FROM sessions WHERE coach_id IS NOT NULL) AS pre_existing_sessions_with_coach;
```

`sessions_with_a_coach` must equal `pre_existing_sessions_with_coach` — that's the backfill correctness proof. If they differ, investigate before continuing.

Also confirm the RPC exists:

```sql
SELECT proname FROM pg_proc WHERE proname = 'set_session_coaches';
```

Expected: one row.

**Why apply first**: Tasks 3+ ship code that calls `setSessionCoaches` (which calls the new RPC). If we deploy that code before the migration is in prod, every shift write 500s. Migration first → code second → safe deploys throughout.

- [ ] **Step 4: Commit the migration file**

```bash
git add supabase/migrations/048_session_coaches.sql
git commit -m "feat(roster): migration 048 — session_coaches join table"
```

Do NOT push yet — keep all P5 commits together and push as one PR at Task 18.

---

### Task 2: TypeScript types

**Files:**
- Modify: `lib/types/database.ts` — add `SessionCoach` interface after the `Session` interface

- [ ] **Step 1: Add SessionCoach interface**

```ts
// ========================
// N. session_coaches (P5 multi-coach)
// ========================
export interface SessionCoach {
  session_id: string;
  user_id: string;
  is_primary: boolean;
  assigned_at: string;
  assigned_by: string | null;
}
```

Place it directly after the existing `Session` interface block. The `Session` interface itself is unchanged — `coach_id` stays as `string | null`, just understood as the denormalised primary cache now.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. No consumer references `SessionCoach` yet; this is just laying the type down for later tasks.

- [ ] **Step 3: Commit**

```bash
git add lib/types/database.ts
git commit -m "feat(roster): SessionCoach TypeScript type"
```

---

### Task 3: `setSessionCoaches` helper

This is the **only** write path to `session_coaches`. Every call site in Chunk 2 funnels through it. The helper enforces the one-primary invariant client-side (the DB index is the backstop), upserts the new set, and deletes any rows not in the new set — all in a single transaction-equivalent call. Atomicity is achieved via Supabase's batch insert + delete (PostgREST does each statement separately, so we use a single SQL function for true atomicity; see Step 3 below).

**Files:**
- Create: `lib/sessions/session-coaches.ts`
- Create: `lib/sessions/__tests__/session-coaches.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/sessions/__tests__/session-coaches.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase client BEFORE importing the SUT
const supabaseMock = {
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

// SUT
import { setSessionCoaches } from "../session-coaches";

beforeEach(() => {
  supabaseMock.rpc.mockReset();
});

describe("setSessionCoaches", () => {
  it("rejects an input set with no primary when at least one coach is provided", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: false },
        { userId: "u2", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/exactly one primary/i);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
  });

  it("rejects an input set with more than one primary", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u2", isPrimary: true },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/exactly one primary/i);
  });

  it("rejects duplicate userIds in the input", async () => {
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u1", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toMatch(/duplicate/i);
  });

  it("allows an empty array (zero-coach state — trigger handles status flip)", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [],
      assignedBy: "ops1",
    });
    expect(result.error).toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "set_session_coaches",
      expect.objectContaining({
        p_session_id: "s1",
        p_coaches: [],
        p_assigned_by: "ops1",
      })
    );
  });

  it("passes a single-primary set through to the RPC", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [
        { userId: "u1", isPrimary: true },
        { userId: "u2", isPrimary: false },
      ],
      assignedBy: "ops1",
    });
    expect(result.error).toBeNull();
    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      "set_session_coaches",
      expect.objectContaining({
        p_session_id: "s1",
        p_coaches: [
          { user_id: "u1", is_primary: true },
          { user_id: "u2", is_primary: false },
        ],
        p_assigned_by: "ops1",
      })
    );
  });

  it("propagates an RPC error verbatim", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });
    const result = await setSessionCoaches({
      sessionId: "s1",
      coaches: [{ userId: "u1", isPrimary: true }],
      assignedBy: "ops1",
    });
    expect(result.error).toBe("permission denied");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/sessions/__tests__/session-coaches.test.ts
```

Expected: 6 failing tests — `Cannot find module './session-coaches'`.

- [ ] **Step 3: Author the SQL function for atomic write**

The helper uses a Postgres function (RPC) for atomicity. Multiple inserts + a delete in one PostgREST batch are NOT a transaction; a SQL function is. Add this to migration 048 (append before the COMMIT):

```sql
-- ============================================================
-- set_session_coaches RPC
-- ============================================================
-- Atomic write path: deletes rows not in the new set, upserts the
-- rest, all in one transaction. Trigger fires for each delete/upsert
-- so sessions.coach_id stays consistent throughout (final state wins).
--
-- Input shape: jsonb array of { user_id: uuid, is_primary: bool }
-- An empty array clears all coaches and lets the trigger flip status
-- (see edge case 4 in spec §9).

CREATE OR REPLACE FUNCTION set_session_coaches(
  p_session_id uuid,
  p_coaches jsonb,
  p_assigned_by uuid
) RETURNS void AS $$
DECLARE
  v_primary_count int;
  v_new_user_ids uuid[];
BEGIN
  -- Validate exactly one primary if non-empty
  SELECT count(*) INTO v_primary_count
  FROM jsonb_array_elements(p_coaches) e
  WHERE (e->>'is_primary')::boolean = true;

  IF jsonb_array_length(p_coaches) > 0 AND v_primary_count <> 1 THEN
    RAISE EXCEPTION 'session_coaches: exactly one primary required (got %)', v_primary_count;
  END IF;

  -- Collect new user_ids for the delete-not-in pass
  SELECT array_agg((e->>'user_id')::uuid)
    INTO v_new_user_ids
    FROM jsonb_array_elements(p_coaches) e;

  -- Delete rows not in the new set
  DELETE FROM session_coaches
  WHERE session_id = p_session_id
    AND (v_new_user_ids IS NULL OR user_id <> ALL(v_new_user_ids));

  -- Upsert the new set
  INSERT INTO session_coaches (session_id, user_id, is_primary, assigned_by)
  SELECT
    p_session_id,
    (e->>'user_id')::uuid,
    (e->>'is_primary')::boolean,
    p_assigned_by
  FROM jsonb_array_elements(p_coaches) e
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET is_primary = EXCLUDED.is_primary,
        assigned_by = EXCLUDED.assigned_by;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated role only — RLS on session_coaches
-- still applies to the underlying table writes via SECURITY DEFINER
-- + the explicit role check in the helper's TypeScript wrapper.
REVOKE EXECUTE ON FUNCTION set_session_coaches FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_session_coaches TO authenticated;
```

Append this BEFORE the `COMMIT;` line of migration 048.

- [ ] **Step 4: Implement the TypeScript helper**

Create `lib/sessions/session-coaches.ts`:

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SessionCoachInput {
  userId: string;
  isPrimary: boolean;
}

export interface SetSessionCoachesParams {
  sessionId: string;
  coaches: SessionCoachInput[];
  /** Acting user id — recorded in `session_coaches.assigned_by`. */
  assignedBy: string;
}

/**
 * The single write path to `session_coaches`. Every call site that
 * previously wrote `sessions.coach_id` directly funnels through here.
 *
 * Validates the one-primary invariant client-side (DB partial unique
 * index is the backstop), then calls the `set_session_coaches` RPC
 * which performs the delete-not-in / upsert atomically.
 *
 * Empty coach array is allowed and clears the shift; the sync trigger
 * then auto-flips published/pending/confirmed sessions to
 * `needs_replacement` (edge case 4 in spec §9).
 *
 * @see docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5
 */
export async function setSessionCoaches({
  sessionId,
  coaches,
  assignedBy,
}: SetSessionCoachesParams): Promise<{ error: string | null }> {
  // Pre-flight client-side validation — fails fast before round-trip.
  if (coaches.length > 0) {
    const primaries = coaches.filter((c) => c.isPrimary).length;
    if (primaries !== 1) {
      return {
        error: `session_coaches: exactly one primary required (got ${primaries})`,
      };
    }
  }
  const seen = new Set<string>();
  for (const c of coaches) {
    if (seen.has(c.userId)) {
      return { error: `session_coaches: duplicate userId ${c.userId}` };
    }
    seen.add(c.userId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_session_coaches", {
    p_session_id: sessionId,
    p_coaches: coaches.map((c) => ({
      user_id: c.userId,
      is_primary: c.isPrimary,
    })),
    p_assigned_by: assignedBy,
  });

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run lib/sessions/__tests__/session-coaches.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/sessions/session-coaches.ts \
        lib/sessions/__tests__/session-coaches.test.ts \
        supabase/migrations/048_session_coaches.sql
git commit -m "feat(roster): setSessionCoaches helper + atomic RPC"
```

---

### Task 4: `assignCoaches` server action

Server action that wraps `setSessionCoaches` for the multi-coach admin/ops UI flow. Adds:
- Auth gate (admin/ops only)
- Cert-guard fan-out across all assigned coaches
- Activity log entries per added/removed coach
- Notification fan-out (every assigned coach gets a roster notification)

**Files:**
- Modify: `lib/sessions/actions.ts` — add `assignCoaches` near the existing `bulkReassignCoach`
- Create: `lib/sessions/__tests__/assign-coaches.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/sessions/__tests__/assign-coaches.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};
const setSessionCoachesMock = vi.fn();
const bulkCheckMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/sessions/session-coaches", () => ({
  setSessionCoaches: setSessionCoachesMock,
}));
vi.mock("@/lib/utils/compliance/check-coach-certs", () => ({
  bulkCheckCoachCertsForSessions: bulkCheckMock,
}));

import { assignCoaches } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAuth(role: "admin" | "ops" | "coach") {
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "ops1" } },
  });
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { role }, error: null }),
          }),
        }),
      };
    }
    if (table === "sessions") {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { date: "2026-06-01" },
                error: null,
              }),
          }),
        }),
      };
    }
    if (table === "session_coaches") {
      // current rows for diff
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: [{ user_id: "u1", is_primary: true }],
              error: null,
            }),
        }),
      };
    }
    if (table === "activity_log") {
      return { insert: () => Promise.resolve({ error: null }) };
    }
    if (table === "notifications") {
      return { insert: () => Promise.resolve({ error: null }) };
    }
    throw new Error(`unmocked table ${table}`);
  });
}

describe("assignCoaches", () => {
  it("rejects unauthenticated callers", async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects coach-role callers", async () => {
    mockAuth("coach");
    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toMatch(/admin or ops/i);
  });

  it("runs cert guard against every assigned coach", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({
      valid: [
        { coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" },
        { coachId: "u2", sessionId: "s1", sessionDate: "2026-06-01" },
      ],
      blocked: [],
    });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
      { userId: "u2", isPrimary: false },
    ]);

    expect(bulkCheckMock).toHaveBeenCalledWith([
      { coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" },
      { coachId: "u2", sessionId: "s1", sessionDate: "2026-06-01" },
    ]);
    expect(result.error).toBeNull();
  });

  it("refuses the whole assignment if any coach fails cert guard", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({
      valid: [{ coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" }],
      blocked: [
        {
          coachId: "u2",
          sessionId: "s1",
          sessionDate: "2026-06-01",
          result: { ok: false, message: "WWCC expired 2026-04-01" },
        },
      ],
    });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
      { userId: "u2", isPrimary: false },
    ]);

    expect(setSessionCoachesMock).not.toHaveBeenCalled();
    expect(result.error).toMatch(/WWCC expired/);
  });

  it("propagates setSessionCoaches errors", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({
      valid: [{ coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" }],
      blocked: [],
    });
    setSessionCoachesMock.mockResolvedValue({
      error: "permission denied",
    });

    const result = await assignCoaches("s1", [
      { userId: "u1", isPrimary: true },
    ]);
    expect(result.error).toBe("permission denied");
  });

  it("allows empty array (clears shift; trigger handles status)", async () => {
    mockAuth("ops");
    bulkCheckMock.mockResolvedValue({ valid: [], blocked: [] });
    setSessionCoachesMock.mockResolvedValue({ error: null });

    const result = await assignCoaches("s1", []);
    expect(result.error).toBeNull();
    expect(bulkCheckMock).toHaveBeenCalledWith([]);
    expect(setSessionCoachesMock).toHaveBeenCalledWith({
      sessionId: "s1",
      coaches: [],
      assignedBy: "ops1",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/sessions/__tests__/assign-coaches.test.ts
```

Expected: 6 failing — `assignCoaches is not a function`.

- [ ] **Step 3: Implement `assignCoaches`**

Add to `lib/sessions/actions.ts` (near the existing `bulkReassignCoach`):

```ts
// ============================================================
// 8b. assignCoaches — multi-coach UI write path
// ============================================================

import {
  setSessionCoaches,
  type SessionCoachInput,
} from "@/lib/sessions/session-coaches";
import { bulkCheckCoachCertsForSessions } from "@/lib/utils/compliance/check-coach-certs";

/**
 * Server action: assign N coaches to a session, with one designated
 * primary. Admin/ops only. Runs the cert guard for every coach against
 * the session's date — any single failure refuses the whole write
 * (no partial assignments). Backed by `setSessionCoaches` (the single
 * write path to `session_coaches`).
 *
 * Empty coachIds is allowed: clears the shift and lets the sync
 * trigger flip the status (edge case 4).
 *
 * @see docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5
 */
export async function assignCoaches(
  sessionId: string,
  coachIds: SessionCoachInput[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    // Auth — only admin / operations can write the coach roster.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { error: "Only admin or ops can assign coaches." };
    }

    // Cert guard — fan out across every (coach, session) pair.
    const { data: session } = await supabase
      .from("sessions")
      .select("date")
      .eq("id", sessionId)
      .single();
    if (!session) return { error: "Session not found." };

    const pairs = coachIds.map((c) => ({
      coachId: c.userId,
      sessionId,
      sessionDate: session.date as string,
    }));
    const certResult = await bulkCheckCoachCertsForSessions(pairs);
    if (certResult.blocked.length > 0) {
      const summary = certResult.blocked
        .map((b) => `${b.coachId}: ${b.result.message}`)
        .join("; ");
      return { error: `Cert guard refused assignment — ${summary}` };
    }

    // Snapshot existing roster for diff (activity log).
    const { data: existing } = await supabase
      .from("session_coaches")
      .select("user_id, is_primary")
      .eq("session_id", sessionId);

    // Atomic write.
    const writeResult = await setSessionCoaches({
      sessionId,
      coaches: coachIds,
      assignedBy: user.id,
    });
    if (writeResult.error) return { error: writeResult.error };

    // Activity log — one row per added/removed/changed coach.
    const existingByUser = new Map(
      (existing ?? []).map((r) => [r.user_id as string, r.is_primary as boolean])
    );
    const newByUser = new Map(coachIds.map((c) => [c.userId, c.isPrimary]));

    const logRows: Array<Record<string, unknown>> = [];
    for (const c of coachIds) {
      const wasAssigned = existingByUser.has(c.userId);
      const wasPrimary = existingByUser.get(c.userId) ?? false;
      if (!wasAssigned) {
        logRows.push({
          user_id: user.id,
          action: "staff_assigned_to_session",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: c.userId, is_primary: c.isPrimary },
        });
      } else if (wasPrimary !== c.isPrimary) {
        logRows.push({
          user_id: user.id,
          action: "session_primary_changed",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: c.userId, is_primary_now: c.isPrimary },
        });
      }
    }
    for (const [userId] of existingByUser) {
      if (!newByUser.has(userId)) {
        logRows.push({
          user_id: user.id,
          action: "staff_removed_from_session",
          entity_type: "session",
          entity_id: sessionId,
          metadata: { coach_id: userId },
        });
      }
    }
    if (logRows.length > 0) {
      await supabase.from("activity_log").insert(logRows);
    }

    return { error: null };
  } catch (err) {
    console.error("assignCoaches error:", err);
    return { error: "Failed to assign coaches." };
  }
}
```

Notification fan-out is deferred to Task 15 — keeping this task focused on the auth + cert + activity-log core.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/sessions/__tests__/assign-coaches.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/sessions/actions.ts lib/sessions/__tests__/assign-coaches.test.ts
git commit -m "feat(roster): assignCoaches server action with cert fan-out"
```

---

## Chunk 2: Call-site migrations + CI guard

Migrate every call site that currently writes `sessions.coach_id` to write through `setSessionCoaches` instead. After each task, run the existing test suite to confirm no regressions. After the last call-site migration (Task 10), the CI guard test (Task 11) is added and must pass — proving no `coach_id` writes survive outside the helper file.

The pattern for every migration:

1. **Read the function** to locate the exact `coach_id` write
2. **Replace the write** with `setSessionCoaches(sessionId, coaches, assignedBy: user.id)`
3. **Strip `coach_id` from any neighbouring direct UPDATE payload** (the trigger will set it)
4. **Update tests** if the test asserts the old write path
5. **Run the targeted test file** to confirm green
6. **Commit**

### Task 5: Migrate `createSession`

**Files:**
- Modify: `lib/sessions/actions.ts:226-261` (`createSession`)

Current code (line 232–253):
```ts
if (data.coach_id) {
  const certCheck = await checkCoachCertsForSession(data.coach_id, data.date);
  if (!certCheck.ok) {
    return { data: null, error: certCheck.message };
  }
}

const { data: session, error } = await supabase
  .from("sessions")
  .insert({
    term_id: data.term_id,
    date: data.date,
    time: data.time,
    duration_minutes: data.duration_minutes,
    centre_id: data.centre_id,
    sport: data.sport,
    coach_id: data.coach_id ?? null,  // ← direct write
    pay_rate_override: data.pay_rate_override ?? null,
    status: "draft" as SessionStatus,
  })
  .select()
  .single();
```

- [ ] **Step 1: Replace the insert + write the helper call**

```ts
if (data.coach_id) {
  const certCheck = await checkCoachCertsForSession(data.coach_id, data.date);
  if (!certCheck.ok) {
    return { data: null, error: certCheck.message };
  }
}

// Auth — needed for assigned_by on the session_coaches row.
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) return { data: null, error: "Not authenticated." };

// Insert the session WITHOUT coach_id. The trigger will populate it
// once we write the primary into session_coaches.
const { data: session, error } = await supabase
  .from("sessions")
  .insert({
    term_id: data.term_id,
    date: data.date,
    time: data.time,
    duration_minutes: data.duration_minutes,
    centre_id: data.centre_id,
    sport: data.sport,
    pay_rate_override: data.pay_rate_override ?? null,
    status: "draft" as SessionStatus,
  })
  .select()
  .single();

if (error) throw error;

// If a coach was provided, write a primary row through the helper.
if (data.coach_id) {
  const { error: writeErr } = await setSessionCoaches({
    sessionId: session.id,
    coaches: [{ userId: data.coach_id, isPrimary: true }],
    assignedBy: user.id,
  });
  if (writeErr) {
    // Rollback: delete the session we just created so we don't leave
    // an unstaffed draft when the caller expected a staffed insert.
    await supabase.from("sessions").delete().eq("id", session.id);
    return { data: null, error: writeErr };
  }
  // Re-fetch so the returned row has the trigger-populated coach_id.
  const { data: refetched } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", session.id)
    .single();
  return { data: refetched ?? session, error: null };
}

return { data: session, error: null };
```

- [ ] **Step 2: Add a rollback test**

The new code path inserts a session, then writes coaches through the helper. If the helper fails, the session row must be rolled back so the caller doesn't get a half-staffed phantom draft. Add to `lib/sessions/__tests__/create-session.test.ts` (create the file if it doesn't exist):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};
const setSessionCoachesMock = vi.fn();
const certCheckMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));
vi.mock("@/lib/sessions/session-coaches", () => ({
  setSessionCoaches: setSessionCoachesMock,
}));
vi.mock("@/lib/utils/compliance/check-coach-certs", () => ({
  checkCoachCertsForSession: certCheckMock,
  checkCoachCertsForSessionDates: vi.fn(),
  bulkCheckCoachCertsForSessions: vi.fn(),
}));

import { createSession } from "../actions";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock.auth.getUser.mockResolvedValue({
    data: { user: { id: "ops1" } },
  });
});

describe("createSession rollback", () => {
  it("deletes the just-inserted session when setSessionCoaches fails", async () => {
    certCheckMock.mockResolvedValue({ ok: true });

    const deleteCalls: string[] = [];
    supabaseMock.from.mockImplementation((table: string) => {
      if (table !== "sessions") throw new Error(`unexpected table ${table}`);
      return {
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "new-session-1" },
                error: null,
              }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            deleteCalls.push(id);
            return Promise.resolve({ error: null });
          },
        }),
      };
    });

    setSessionCoachesMock.mockResolvedValue({ error: "boom" });

    const result = await createSession({
      term_id: "t1",
      date: "2026-06-01",
      time: "09:00",
      duration_minutes: 60,
      centre_id: "c1",
      sport: "Soccer",
      coach_id: "u1",
    });

    expect(result.error).toBe("boom");
    expect(result.data).toBeNull();
    expect(deleteCalls).toEqual(["new-session-1"]);
  });
});
```

- [ ] **Step 3: Run tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

Expected: rollback test passes; existing tests still green.

- [ ] **Step 4: Commit**

```bash
git add lib/sessions/actions.ts lib/sessions/__tests__/create-session.test.ts
git commit -m "refactor(roster): createSession writes coach through setSessionCoaches"
```

---

### Task 6: Migrate `updateSession`

**Files:**
- Modify: `lib/sessions/actions.ts:267-297` (`updateSession`)

Current code (lines 274–289) lets a caller pass `coach_id` inside `data` and writes it directly via `.update(data)`. After migration:
- If `coach_id` is in the patch, route it through `setSessionCoaches([{coach_id, isPrimary: true}])`
- Strip `coach_id` from the patch before the direct `.update(data)`
- Treat `coach_id: null` as "clear the shift" → `setSessionCoaches([])`

- [ ] **Step 1: Replace the body**

```ts
export async function updateSession(
  id: string,
  data: UpdateSessionData
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Cert guard for coach assignment (unchanged behaviour).
    if (data.coach_id) {
      const { data: existing, error: fetchErr } = await supabase
        .from("sessions")
        .select("date")
        .eq("id", id)
        .single();
      if (fetchErr || !existing) return { error: "Session not found." };
      const sessionDate = (data.date as string | undefined) ?? existing.date;
      const certCheck = await checkCoachCertsForSession(data.coach_id, sessionDate);
      if (!certCheck.ok) return { error: certCheck.message };
    }

    // Separate coach_id from the rest of the patch — it now writes
    // through session_coaches; the trigger maintains the cache column.
    const coachKeyInPatch = Object.prototype.hasOwnProperty.call(data, "coach_id");
    const { coach_id: nextCoachId, ...patch } = data;

    // Apply the non-coach patch directly (status, date, time, etc.)
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("sessions").update(patch).eq("id", id);
      if (error) throw error;
    }

    // Apply the coach change, if any, through the helper.
    if (coachKeyInPatch) {
      const coaches =
        nextCoachId === null || nextCoachId === undefined
          ? []
          : [{ userId: nextCoachId, isPrimary: true }];
      const { error: writeErr } = await setSessionCoaches({
        sessionId: id,
        coaches,
        assignedBy: user.id,
      });
      if (writeErr) return { error: writeErr };
    }

    return { error: null };
  } catch (err) {
    console.error("updateSession error:", err);
    return { error: "Failed to update session." };
  }
}
```

- [ ] **Step 2: Run sessions tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add lib/sessions/actions.ts
git commit -m "refactor(roster): updateSession routes coach_id through setSessionCoaches"
```

---

### Task 7: Migrate `bulkReassignCoach`

**Files:**
- Modify: `lib/sessions/actions.ts:410-437` (`bulkReassignCoach`)

Current code (line 426–429) does a single `.update({ coach_id: coachId }).in("id", ids)`. After migration: loop and call `setSessionCoaches` per session.

- [ ] **Step 1: Rewrite the body**

```ts
export async function bulkReassignCoach(
  ids: string[],
  coachId: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Cert guard (unchanged) — fan out across all target session dates.
    if (coachId && ids.length > 0) {
      const { data: targetSessions, error: fetchErr } = await supabase
        .from("sessions")
        .select("date")
        .in("id", ids);
      if (fetchErr) throw fetchErr;
      const dates = Array.from(
        new Set((targetSessions ?? []).map((s) => s.date as string)),
      );
      const certCheck = await checkCoachCertsForSessionDates(coachId, dates);
      if (!certCheck.ok) return { error: certCheck.message };
    }

    // Route through setSessionCoaches per session. coachId=null clears.
    const coaches =
      coachId === null ? [] : [{ userId: coachId, isPrimary: true }];
    for (const id of ids) {
      const { error } = await setSessionCoaches({
        sessionId: id,
        coaches,
        assignedBy: user.id,
      });
      if (error) return { error };
    }

    return { error: null };
  } catch (err) {
    console.error("bulkReassignCoach error:", err);
    return { error: "Failed to reassign coach." };
  }
}
```

- [ ] **Step 2: Tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/sessions/actions.ts
git commit -m "refactor(roster): bulkReassignCoach loops through setSessionCoaches"
```

---

### Task 8: Migrate `opsApproveSwap` + `declineShift`

**Files:**
- Modify: `lib/sessions/shift-actions.ts:155-175` (`declineShift`)
- Modify: `lib/sessions/shift-actions.ts:430-440` (`opsApproveSwap`)

#### `declineShift` (line ~159 today)

Current: `update({ status: "published", coach_id: null })`.

After: clear the coach first, then explicitly set status (the trigger would auto-flip to `needs_replacement`, but the spec wants `published` here per the existing UX — the explicit second write wins).

- [ ] **Step 1: Rewrite `declineShift` coach write**

Replace the `update({ status: "published", coach_id: null })` block with:

```ts
// Clear the coach through the helper. The trigger will flip status
// to needs_replacement, but we immediately overwrite with "published"
// per the existing decline-shift contract.
const { error: clearErr } = await setSessionCoaches({
  sessionId,
  coaches: [],
  assignedBy: user.id,
});
if (clearErr) return { error: clearErr };

const { error: statusErr } = await supabase
  .from("sessions")
  .update({ status: "published" })
  .eq("id", sessionId);
if (statusErr) return { error: "Failed to update shift." };
```

(Add the `setSessionCoaches` import at the top of the file.)

#### `opsApproveSwap` (line ~436 today)

Current: `update({ coach_id: swap.proposed_coach_id })`.

After: `setSessionCoaches([{ userId: swap.proposed_coach_id, isPrimary: true }])`.

- [ ] **Step 2: Rewrite `opsApproveSwap` coach write**

Replace the `.update({ coach_id: swap.proposed_coach_id }).eq("id", swap.session_id)` block with:

```ts
const { error: writeErr } = await setSessionCoaches({
  sessionId: swap.session_id,
  coaches: [{ userId: swap.proposed_coach_id, isPrimary: true }],
  assignedBy: user.id,
});
if (writeErr) return { error: writeErr };
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add lib/sessions/shift-actions.ts
git commit -m "refactor(roster): shift-actions write coach through setSessionCoaches"
```

---

### Task 9: Migrate `respondToReplacementOffer` + `cancelSessionAsCoach`

**Files:**
- Modify: `lib/rerostering/actions.ts:43` (`cancelSessionAsCoach`)
- Modify: `lib/rerostering/actions.ts:228` (`respondToReplacementOffer` accept path)

#### `cancelSessionAsCoach` (line ~43)

Current: `update({ coach_id: null, ... })`.

After: clear via `setSessionCoaches([])`, then apply the rest of the patch (cancellation_reason, status updates) directly. The trigger flips status to `needs_replacement` automatically — the rerostering offer flow expects exactly that, so no explicit status write is needed here.

- [ ] **Step 1: Rewrite `cancelSessionAsCoach` coach clear**

Find the block that currently writes `coach_id: null`. Split into:

```ts
// Clear the coach through the helper — the sync trigger then flips
// status to needs_replacement, which the rerostering offer flow
// listens for.
const { error: clearErr } = await setSessionCoaches({
  sessionId: id,
  coaches: [],
  assignedBy: user.id,
});
if (clearErr) return { error: clearErr };

// Apply the non-coach patch (cancellation_reason, etc.) separately.
// status field is NOT in this patch — the trigger owns the
// status flip on zero-coach.
const { error: patchErr } = await supabase
  .from("sessions")
  .update({ cancellation_reason: reason })
  .eq("id", id);
if (patchErr) return { error: "Failed to cancel session." };
```

#### `respondToReplacementOffer` accept (line ~228)

Current: `update({ coach_id: user.id, status: "confirmed", cancellation_reason: null })`.

After: `setSessionCoaches([{ userId: user.id, isPrimary: true }])`, then update the remaining fields (status, cancellation_reason).

- [ ] **Step 2: Rewrite `respondToReplacementOffer` accept**

```ts
const { error: writeErr } = await setSessionCoaches({
  sessionId: event.session_id,
  coaches: [{ userId: user.id, isPrimary: true }],
  assignedBy: user.id,
});
if (writeErr) return { error: writeErr };

const { error: patchErr } = await supabase
  .from("sessions")
  .update({ status: "confirmed", cancellation_reason: null })
  .eq("id", event.session_id);
if (patchErr) return { error: "Failed to confirm session." };
```

- [ ] **Step 3: Tests + typecheck**

```bash
npx vitest run lib/rerostering/ lib/sessions/ && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/rerostering/actions.ts
git commit -m "refactor(roster): rerostering writes coach through setSessionCoaches"
```

---

### Task 10: Migrate `recordAdjustment` + scheduling generate route

**Files:**
- Modify: `lib/scheduling/actions.ts:90` (`recordAdjustment`)
- Modify: `app/api/scheduling/generate/route.ts:135` (bulk apply loop)

**Scope clarification:** `publishSchedulingRun` (around `lib/scheduling/actions.ts:185`) does NOT write `sessions.coach_id` — only writes `status`. The actual scheduling-coach assignment path is the generate route below. Confirm by grepping `lib/scheduling/actions.ts` for `\.from\(["']sessions["']\).*update.*coach_id` before starting — only line ~90 (`recordAdjustment`) should match. The `coach_id` writes on lines 165, 171, 443 of `scheduling/actions.ts` are on `scheduling_preferences` (a different table; that column is legitimate). Do NOT touch them.

Both target sites currently do `update({ coach_id: ... })` on a session row. Replace each with a `setSessionCoaches` call. The scheduling flow always assigns a single primary coach (multi-coach UI is a separate flow), so the array is always `[{ userId: coachId, isPrimary: true }]`.

- [ ] **Step 1: Rewrite `recordAdjustment` line ~90**

```ts
const { error: writeErr } = await setSessionCoaches({
  sessionId,
  coaches: [{ userId: replacementCoachId, isPrimary: true }],
  assignedBy: actingUserId, // function already has this — keep the variable name as-is
});
if (writeErr) throw new Error(writeErr);
```

- [ ] **Step 2: Rewrite `app/api/scheduling/generate/route.ts` line ~135**

```ts
const { error: writeErr } = await setSessionCoaches({
  sessionId: pair.sessionId,
  coaches: [{ userId: pair.coachId, isPrimary: true }],
  assignedBy: user.id, // already in scope
});
if (writeErr) {
  // Surface in the bulk-apply error array (existing pattern)
  errors.push({ sessionId: pair.sessionId, message: writeErr });
}
```

- [ ] **Step 3: Run scheduling tests + typecheck**

```bash
npx vitest run lib/scheduling/ && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/scheduling/actions.ts app/api/scheduling/generate/route.ts
git commit -m "refactor(roster): scheduling writes coach through setSessionCoaches"
```

---

### Task 11: CI guard test — no direct `coach_id` writes outside helper

This is the safety net. A vitest test greps `lib/`, `app/`, `components/` for any string matching a direct `coach_id` write (insert payload or update payload) outside the `setSessionCoaches` helper file. If a future PR sneaks one in, the build fails.

**Files:**
- Create: `lib/__tests__/no-direct-coach-id-writes.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const ROOTS = ["lib", "app", "components"];

// Files exempt from the guard:
//   - the helper itself (writes coach_id indirectly via the RPC)
//   - this test file
//   - migration SQL is not TypeScript anyway
//   - the read-side `coach_id` SELECT projections are fine
//
// The guard is scoped specifically to `.from("sessions")` chains.
// Other tables that legitimately have a `coach_id` column (notably
// `scheduling_preferences`, `rerostering_events`, `swap_requests`,
// `coach_performance_snapshots`, `notifications`) are not blocked.
//
// Detection: for each `coach_id:` line, walk back up to 12 lines and
// check whether the same chain (1) targets `.from("sessions")` and
// (2) contains a `.update(` or `.insert(`. Both conditions must hold
// — that combination is the violation pattern.
const EXEMPT = new Set<string>([
  "lib/sessions/session-coaches.ts",
  "lib/__tests__/no-direct-coach-id-writes.test.ts",
]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      // skip node_modules / .next / build outputs / git
      if (entry.startsWith(".") || entry === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      yield p;
    }
  }
}

function findDirectCoachIdWrites(filePath: string): { line: number; snippet: string }[] {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const hits: { line: number; snippet: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/coach_id\s*:/.test(lines[i])) continue;
    // Walk back up to 12 lines for the chain root + write method.
    const window = lines.slice(Math.max(0, i - 12), i + 1).join("\n");
    const onSessionsTable = /\.from\(\s*["']sessions["']\s*\)/.test(window);
    const isWriteCall = /\.(update|insert|upsert)\s*\(/.test(window);
    if (onSessionsTable && isWriteCall) {
      hits.push({ line: i + 1, snippet: lines[i].trim() });
    }
  }
  return hits;
}

describe("no direct sessions.coach_id writes outside setSessionCoaches", () => {
  it("scans lib/, app/, components/ and finds no violations", () => {
    const violations: string[] = [];
    for (const root of ROOTS) {
      const abs = join(ROOT, root);
      for (const filePath of walk(abs)) {
        const rel = relative(ROOT, filePath);
        if (EXEMPT.has(rel)) continue;
        const hits = findDirectCoachIdWrites(filePath);
        for (const h of hits) {
          violations.push(`${rel}:${h.line} ${h.snippet}`);
        }
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Found ${violations.length} direct coach_id write(s) outside setSessionCoaches:\n` +
          violations.join("\n") +
          "\n\nRoute these writes through setSessionCoaches() instead. See " +
          "docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md §6 P5."
      );
    }
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — it MUST pass at this point**

```bash
npx vitest run lib/__tests__/no-direct-coach-id-writes.test.ts
```

Expected: green. If any task in 5–10 was sloppy and left a direct write, this fails NOW. Fix the leak before committing this task.

- [ ] **Step 3: Commit**

```bash
git add lib/__tests__/no-direct-coach-id-writes.test.ts
git commit -m "test(roster): CI guard — no direct coach_id writes outside helper"
```

---

## Chunk 3: Read paths + UI

Backend is now multi-coach safe. This chunk teaches the read paths, computed projections (cost / conflict), and notifications to fan out across `session_coaches`, and adds the UI for assigning multiple coaches.

### Task 12: Extend `SessionWithRelations` to include `assignedCoaches`

**Files:**
- Modify: `lib/sessions/actions.ts` — extend `SessionWithRelations` interface and the read helpers (`getSessions`, `getSessionById`) to fetch `session_coaches` rows alongside the existing single-coach data
- Modify: `lib/sessions/coach-actions.ts:543` area — same for `getCoachSessionDetail`

- [ ] **Step 1: Extend the interface**

In `lib/sessions/actions.ts` near line 15:

```ts
export interface SessionWithRelations extends Session {
  centre_name?: string | null;
  centre_type?: string | null;
  // ... existing fields ...
  /**
   * Flat list of every coach assigned to this session, ordered with
   * the primary first. Populated by the read helpers via a join on
   * `session_coaches`. Empty when no coach is assigned.
   */
  assigned_coaches: Array<{
    user_id: string;
    name: string | null;
    is_primary: boolean;
  }>;
}
```

- [ ] **Step 2: Extend the read query**

In the `select(...)` strings on lines 89 and 163, add `session_coaches(user_id, is_primary, profiles:user_id(name))` so the join lands in one round-trip:

```ts
"*, centres:centre_id(name, type), profiles:coach_id(name, phone), terms:term_id(name), programs:program_id(sport, skill_focus), session_coaches(user_id, is_primary, profiles:user_id(name))"
```

In the row mapper (lines 98–134 and 170–204), map the new field:

```ts
assigned_coaches:
  ((s.session_coaches as unknown as Array<{
    user_id: string;
    is_primary: boolean;
    profiles: { name: string | null } | null;
  }>) ?? [])
    .map((sc) => ({
      user_id: sc.user_id,
      name: sc.profiles?.name ?? null,
      is_primary: sc.is_primary,
    }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
```

- [ ] **Step 3: Mirror in `getCoachSessionDetail`**

In `lib/sessions/coach-actions.ts` add the same join + mapping. The coach-side detail view will use this to render "you + 1 other" when the shift is multi-coach.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. Existing UI consumers that don't read `assigned_coaches` continue working (additive field).

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/actions.ts lib/sessions/coach-actions.ts
git commit -m "feat(roster): read assigned_coaches alongside session rows"
```

---

### Task 13: Cost projection — per-coach fan-out

The pure aggregator `projectWeekCost` in `lib/utils/roster/cost-projection.ts` already produces a `byCoach` row per coach — its signature is fine. The caller (`lib/roster/cost-actions.ts:127`) currently maps one `PricedSession` per session (using the cached `coach_id`). After P5: fan out to one `PricedSession` per `(session, assigned coach)` pair, each priced at the coach's individual resolved rate.

**Decision E** (spec §10): per-rate-summed.

**Files:**
- Modify: `lib/roster/cost-actions.ts` — fan out around line 127
- Modify: `lib/utils/roster/__tests__/cost-projection.test.ts` — add multi-coach test case

- [ ] **Step 1: Write a failing test for multi-coach cost split**

In `lib/utils/roster/__tests__/cost-projection.test.ts` add:

```ts
it("multi-coach session produces one byCoach row per assigned coach (per-rate-summed)", () => {
  // Same session, two coaches. The caller (cost-actions.ts) has
  // already priced each (session, coach) pair at that coach's rate.
  const result = projectWeekCost([
    s({ sessionId: "shift-A", coachId: "u1", coachName: "Alice", amount: 100, durationMinutes: 60 }),
    s({ sessionId: "shift-A", coachId: "u2", coachName: "Bob",   amount:  80, durationMinutes: 60 }),
  ]);
  expect(result.byCoach).toHaveLength(2);
  expect(result.byCoach).toContainEqual(
    expect.objectContaining({ coachId: "u1", cost: 100, hours: 1, sessions: 1 })
  );
  expect(result.byCoach).toContainEqual(
    expect.objectContaining({ coachId: "u2", cost: 80, hours: 1, sessions: 1 })
  );
  // Total cost = sum of both coaches' costs.
  expect(result.totalCost).toBe(180);
  // Total HOURS double-counts a multi-coach shift on purpose — the
  // chip surfaces coach-hours, which is the labour figure ops cares
  // about (two coaches each working an hour = 2 coach-hours).
  expect(result.totalHours).toBe(2);
});
```

- [ ] **Step 2: Run the test — documents the aggregator contract**

```bash
npx vitest run lib/utils/roster/__tests__/cost-projection.test.ts
```

Expected: green. The aggregator already accepts this shape (it groups by `coachId` regardless of session uniqueness). This test is a documentation/contract test — it codifies that a two-coach shift can be modelled as two `PricedSession` rows with the same `sessionId`. The real activation happens in Step 3 at the caller. The TDD discipline here is reversed from "failing test first" because the aggregator is already correct; what we're adding is the contract assertion before changing the caller.

- [ ] **Step 3: Update the caller (`lib/roster/cost-actions.ts:127`)**

The current per-session `rows.map((r) => ...)` (lines 127–155) resolves a single coach's rate via `resolvePayRate(input, ratesByCoach.get(r.coach_id) ?? [], profileById.get(r.coach_id) ?? null, r.date)`. After P5, `rows` should include `assigned_coaches[]` from Task 12. Rewrite the block as a `flatMap` that produces one `PricedSession` per `(session, assigned coach)` pair, each priced via the same `resolvePayRate` signature:

```ts
const priced: PricedSession[] = rows.flatMap((r) => {
  // Unassigned shift — single row with null pricing, preserves the
  // existing `unassignedSessions` count behaviour.
  if (!r.assigned_coaches || r.assigned_coaches.length === 0) {
    return [{
      sessionId: r.id,
      coachId: null,
      coachName: null,
      durationMinutes: r.duration_minutes,
      amount: null,
    }];
  }
  // Multi-coach: one priced row per assigned coach, each at their own rate.
  return r.assigned_coaches.map((c) => {
    let amount: number | null = null;
    const resolved = resolvePayRate(
      {
        // pay_rate_override only applies to the primary — it's a
        // session-level override of the primary's rate, not a
        // per-secondary override. Spec §10 Decision E intentionally
        // keeps secondary coaches on their resolved rate.
        pay_rate_override: c.is_primary ? r.pay_rate_override : null,
        coach_id: c.user_id,
        duration_minutes: r.duration_minutes,
        centre_type: centreTypeById.get(r.centre_id) ?? "childcare_centre",
      },
      ratesByCoach.get(c.user_id) ?? [],
      profileById.get(c.user_id) ?? null,
      r.date,
    );
    if (resolved) {
      amount = calculateSessionPay(resolved, r.duration_minutes).amount;
    }
    return {
      sessionId: r.id,
      coachId: c.user_id,
      coachName: c.name,
      durationMinutes: r.duration_minutes,
      amount,
    };
  });
});
```

The `ratesByCoach`, `profileById`, and `centreTypeById` Maps already exist above (lines 100–125); the new flatMap re-uses them for each `(session, coach)` pair without an extra DB round-trip.

Also: pull `user_id`s from `rows.flatMap((r) => r.assigned_coaches?.map((c) => c.user_id) ?? [])` when building the upstream `ratesRes` / `profilesRes` queries (currently keyed on `r.coach_id`). Otherwise non-primary coaches' rates won't be fetched. Update the earlier `.in("user_id", coachIds)` calls accordingly. Spot-check by reading lines 60–100 of `cost-actions.ts` — the `coachIds` array build is right above the rate fetch.

- [ ] **Step 4: Run full cost tests + typecheck**

```bash
npx vitest run lib/utils/roster/ lib/roster/ && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/utils/roster/__tests__/cost-projection.test.ts lib/roster/cost-actions.ts
git commit -m "feat(roster): per-coach cost fan-out for multi-coach shifts"
```

---

### Task 14: Conflict detection — read from `session_coaches`

The existing conflict-detection helper (in `lib/sessions/actions.ts` around line 662 — `getCoachClashes` or similar; locate the function that builds the `clashCoaches` set) currently reads `sessions.coach_id` to detect overlaps. After P5: a coach can be primary on Session A and secondary on Session B. Single-coach detection misses the overlap.

**Files:**
- Modify: `lib/sessions/actions.ts:660-680` (clash detection)
- Add a test for multi-coach overlap detection

- [ ] **Step 1: Exploratory read — find the clash function and capture the current code**

Run:

```bash
grep -n "clashCoach\|overlap" lib/sessions/actions.ts | head -20
```

Then `Read` the matched function in full. Paste the current implementation into a scratch buffer so the diff is reviewable in the commit. Expected: an exported function that takes `(coachIds: string[], date: string, startTime: string, durationMinutes: number)` (or similar), queries `.from("sessions").select("coach_id, time, duration_minutes").in("coach_id", coachIds)`, computes time-overlap math, returns `{ clashCoaches: Set<string> }` or an array. Names may differ; capture the actual signature before writing the test in Step 2.

- [ ] **Step 2: Rewrite to read from `session_coaches`**

Replace the `.select("coach_id, time, duration_minutes")` query with a `session_coaches`-flattened version:

```ts
const { data: existingShifts } = await supabase
  .from("session_coaches")
  .select(
    "user_id, sessions:session_id(id, date, time, duration_minutes, status)"
  )
  .in("user_id", coachIds);

// Filter to non-cancelled overlapping rows. Each row is one
// (coach, session) pair — a multi-coach shift produces N rows.
const flat = (existingShifts ?? [])
  .map((sc) => ({
    coachId: sc.user_id,
    session: sc.sessions as unknown as {
      id: string;
      date: string;
      time: string;
      duration_minutes: number;
      status: string;
    } | null,
  }))
  .filter((r) => r.session && r.session.status !== "cancelled");
```

Then the existing overlap math runs over `flat` instead of the old single-coach query. Update the loop variable names accordingly.

- [ ] **Step 3: Add a multi-coach overlap test**

Create or extend `lib/sessions/__tests__/conflict-detection.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const supabaseMock = { from: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseMock),
}));

// Replace `detectCoachClashes` below with the actual function name
// captured in Step 1.
import { detectCoachClashes } from "../actions";

beforeEach(() => {
  supabaseMock.from.mockReset();
});

it("detects overlap when a coach is primary on session A and secondary on session B", async () => {
  // Two session_coaches rows for the same coach on overlapping shifts.
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "session_coaches") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                user_id: "u1",
                sessions: {
                  id: "A",
                  date: "2026-06-01",
                  time: "09:00:00",
                  duration_minutes: 60,
                  status: "published",
                },
              },
              {
                user_id: "u1",
                sessions: {
                  id: "B",
                  date: "2026-06-01",
                  time: "09:30:00",
                  duration_minutes: 60,
                  status: "published",
                },
              },
            ],
            error: null,
          }),
      }),
    };
  });

  // Probe for a candidate shift that DOESN'T exist yet — should flag u1.
  const result = await detectCoachClashes({
    coachIds: ["u1"],
    date: "2026-06-01",
    time: "09:15:00",
    durationMinutes: 60,
  });
  expect(Array.from(result.clashCoaches)).toContain("u1");
});

it("ignores cancelled overlapping rows", async () => {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== "session_coaches") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        in: () =>
          Promise.resolve({
            data: [
              {
                user_id: "u1",
                sessions: {
                  id: "A",
                  date: "2026-06-01",
                  time: "09:00:00",
                  duration_minutes: 60,
                  status: "cancelled",
                },
              },
            ],
            error: null,
          }),
      }),
    };
  });

  const result = await detectCoachClashes({
    coachIds: ["u1"],
    date: "2026-06-01",
    time: "09:30:00",
    durationMinutes: 60,
  });
  expect(Array.from(result.clashCoaches)).not.toContain("u1");
});
```

The exact argument shape of `detectCoachClashes` must match whatever Step 1 captured. If the current function isn't exported or uses inline mutation, refactor it during Step 2 to take a Supabase-client param explicitly so it's unit-testable.

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/actions.ts lib/sessions/__tests__/conflict-detection.test.ts
git commit -m "feat(roster): conflict detection reads from session_coaches"
```

---

### Task 15: Notifications + per-coach activity log

Extend `assignCoaches` to fan out roster notifications to every assigned coach; the primary's notification includes the lead-role messaging.

**Files:**
- Modify: `lib/sessions/actions.ts` — extend `assignCoaches` (added in Task 4) with notification fan-out
- Modify: `lib/sessions/__tests__/assign-coaches.test.ts` — add a test asserting notifications are sent

- [ ] **Step 1: Add the failing test**

```ts
it("fans out a roster notification to every assigned coach, with lead-role wording for the primary", async () => {
  mockAuth("ops");
  bulkCheckMock.mockResolvedValue({
    valid: [
      { coachId: "u1", sessionId: "s1", sessionDate: "2026-06-01" },
      { coachId: "u2", sessionId: "s1", sessionDate: "2026-06-01" },
    ],
    blocked: [],
  });
  setSessionCoachesMock.mockResolvedValue({ error: null });

  const notificationInserts: unknown[] = [];
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "notifications") {
      return {
        insert: (rows: unknown) => {
          notificationInserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    // ... existing mocks for profiles / sessions / session_coaches / activity_log
  });

  await assignCoaches("s1", [
    { userId: "u1", isPrimary: true },
    { userId: "u2", isPrimary: false },
  ]);

  expect(notificationInserts).toHaveLength(1);
  const rows = notificationInserts[0] as Array<Record<string, unknown>>;
  expect(rows).toHaveLength(2);
  const primary = rows.find((r) => r.user_id === "u1");
  const secondary = rows.find((r) => r.user_id === "u2");
  expect((primary?.body as string).toLowerCase()).toMatch(/lead|primary/);
  expect((secondary?.body as string).toLowerCase()).not.toMatch(/lead|primary/);
});
```

- [ ] **Step 2: Implement notification fan-out**

Inside `assignCoaches`, after the activity-log block:

```ts
// Notifications — only for newly-added coaches (don't re-notify
// existing assignees on a primary swap).
const newlyAdded = coachIds.filter((c) => !existingByUser.has(c.userId));
if (newlyAdded.length > 0) {
  const others = coachIds
    .filter((c) => !c.isPrimary)
    .map((c) => c.userId);
  const otherNames = await fetchCoachNames(supabase, others); // helper

  const rows = newlyAdded.map((c) => ({
    user_id: c.userId,
    tier: "important" as const,
    title: "Roster assignment",
    body: c.isPrimary
      ? `You're the lead on a new shift${otherNames.length > 0 ? `, with ${otherNames.join(" and ")}` : ""}.`
      : `You've been added to a shift led by another coach.`,
    entity_type: "session",
    entity_id: sessionId,
  }));
  await supabase.from("notifications").insert(rows);
}
```

(`fetchCoachNames` is a tiny helper — implement it inline as a local async function that runs `.from("profiles").select("name").in("id", ids)`.)

- [ ] **Step 3: Run tests + typecheck**

```bash
npx vitest run lib/sessions/ && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/sessions/actions.ts lib/sessions/__tests__/assign-coaches.test.ts
git commit -m "feat(roster): assignCoaches fans out per-coach notifications"
```

---

### Task 16: Roster grid — multi-coach rendering

A multi-coach session shows up on each assigned coach's row in the staff-roster view. The primary's card has an orange "+N others" badge; secondary cards have a "↔ shared" badge + thinner left border. Clicking any of them opens the same detail sheet.

**Files:**
- Modify: `components/roster/staff-roster-view.tsx` — already loops `sessions × coaches`; the data source becomes `assigned_coaches` not just `coach_id`
- Modify: `components/roster/session-card.tsx` — accept new optional props for the badges
- Modify: `components/roster/session-calendar-view.tsx` — render once at the primary's column, with the +N badge

- [ ] **Step 1: Decide where to compute the per-coach view-model**

Add a helper at the top of `staff-roster-view.tsx`:

```ts
/**
 * Flatten sessions × assigned_coaches into per-(coach, session) rows
 * for the staff view. Every assigned coach gets a card in their own
 * row; the primary's card carries "+N others", secondaries carry
 * "↔ shared".
 */
function flattenForStaffView(
  sessions: SessionWithRelations[]
): Array<{
  coachId: string;
  session: SessionWithRelations;
  isPrimary: boolean;
  otherCount: number; // total assigned − 1 for the primary; 0 for secondaries
}> {
  const out: ReturnType<typeof flattenForStaffView> = [];
  for (const s of sessions) {
    const total = s.assigned_coaches?.length ?? (s.coach_id ? 1 : 0);
    if (s.assigned_coaches && s.assigned_coaches.length > 0) {
      for (const c of s.assigned_coaches) {
        out.push({
          coachId: c.user_id,
          session: s,
          isPrimary: c.is_primary,
          otherCount: c.is_primary ? Math.max(0, total - 1) : 0,
        });
      }
    } else if (s.coach_id) {
      // Legacy fallback for any read site that hasn't loaded
      // assigned_coaches yet — single primary.
      out.push({
        coachId: s.coach_id,
        session: s,
        isPrimary: true,
        otherCount: 0,
      });
    }
  }
  return out;
}
```

- [ ] **Step 2: Extend `SessionCard` (and `StaffSessionCard`) props**

Add optional props:

```ts
interface SessionCardProps {
  // ... existing props ...
  /** When > 0, render an orange "+N others" badge on the primary card. */
  otherCount?: number;
  /** When true, render this as the secondary view (↔ shared, thinner border). */
  asSecondary?: boolean;
}
```

Render them:

```tsx
{otherCount && otherCount > 0 ? (
  <span
    className="pointer-events-none absolute right-1 top-1 z-10 rounded bg-orange-500 px-1 text-[9px] font-medium text-white"
    title={`Plus ${otherCount} other coach${otherCount === 1 ? "" : "es"}`}
  >
    +{otherCount}
  </span>
) : null}
{asSecondary ? (
  <span
    className="pointer-events-none absolute right-1 top-1 z-10 rounded border bg-background px-1 text-[9px] text-muted-foreground"
    title="Shared shift"
  >
    ↔ shared
  </span>
) : null}
```

And on the outer `<button>`, when `asSecondary` is true, apply `border-l border-l-muted-foreground/40` instead of the full primary-coloured left border.

- [ ] **Step 3: Wire `staff-roster-view.tsx`**

Replace the existing `sessions × coaches` flat where the inner cell decides "does this coach own this session?" with the new `flattenForStaffView` output. Each entry now positions a card on `(row=coach, col=date+time)` and passes `otherCount` / `asSecondary` based on `isPrimary`.

- [ ] **Step 4: Wire `session-calendar-view.tsx`**

The calendar view renders one card per session (anchored to the date column). When a session has multiple coaches, the card belongs to the primary's grid cell — pass `otherCount` to the card so the "+N" badge renders.

- [ ] **Step 5: Visual check**

Local dev server: `npm run dev` → open `/admin/roster`. Create or pick a session that has been multi-staffed via the (Task 17) detail sheet. Confirm:
- Primary's card shows "+1" badge in orange
- Secondary's card on a different coach's row shows "↔ shared" with thinner left border

- [ ] **Step 6: Commit**

```bash
git add components/roster/staff-roster-view.tsx \
        components/roster/session-card.tsx \
        components/roster/session-calendar-view.tsx
git commit -m "feat(roster): multi-coach grid rendering (+N / ↔ shared badges)"
```

---

### Task 17: Session detail sheet — chip multi-select

Replace the single-coach `SmartCoachSelect` with a new `CoachChipMultiselect` component. Chips render in primary-first order; the first chip is always the primary (rate driver). Reordering by drag changes the primary; an explicit "Make primary" item in each chip's menu does the same.

**Files:**
- Create: `components/roster/coach-chip-multiselect.tsx`
- Modify: `components/roster/session-detail-sheet.tsx` — swap `SmartCoachSelect` for `CoachChipMultiselect`; replace `handleSmartSelect` with `handleAssignCoaches`

- [ ] **Step 1: Author `CoachChipMultiselect`**

Sketch:

```tsx
"use client";

import { useState } from "react";
import { X, GripVertical, Crown, ChevronDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface CoachOption {
  id: string;
  name: string;
}

export interface ChipCoach {
  id: string;
  name: string;
}

interface Props {
  /** Already-selected coaches, in display order (index 0 = primary). */
  value: ChipCoach[];
  /** Full pickable list — caller filters out archived/inactive. */
  options: CoachOption[];
  /** Caller persists the new order; first item becomes primary. */
  onChange: (next: ChipCoach[]) => void;
  /** Disable while a save is in flight. */
  disabled?: boolean;
}

export function CoachChipMultiselect({ value, options, onChange, disabled }: Props) {
  // SortableChip uses @dnd-kit/sortable. The first chip in `value` is
  // always the primary — visual cue: golden crown icon, brighter border.
  // Drag handles surface on hover. Drop into position 0 promotes that
  // coach to primary.

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = value.findIndex((c) => c.id === e.active.id);
    const newIdx = value.findIndex((c) => c.id === e.over.id);
    onChange(arrayMove(value, oldIdx, newIdx));
  }

  function addCoach(id: string) {
    const opt = options.find((o) => o.id === id);
    if (!opt) return;
    if (value.some((v) => v.id === id)) return; // already selected
    onChange([...value, { id, name: opt.name }]);
  }

  function removeCoach(id: string) {
    onChange(value.filter((v) => v.id !== id));
  }

  function makePrimary(id: string) {
    const idx = value.findIndex((v) => v.id === id);
    if (idx <= 0) return;
    onChange(arrayMove(value, idx, 0));
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-1.5">
            {value.map((c, i) => (
              <SortableChip
                key={c.id}
                coach={c}
                isPrimary={i === 0}
                disabled={disabled}
                onRemove={() => removeCoach(c.id)}
                onMakePrimary={() => makePrimary(c.id)}
              />
            ))}
            <AddCoachButton
              options={options.filter((o) => !value.some((v) => v.id === o.id))}
              onPick={addCoach}
              disabled={disabled}
            />
          </div>
        </SortableContext>
      </DndContext>
      <p className="mt-2 text-xs text-muted-foreground">
        Primary coach drives the pay rate. Others paid at their own rates.
      </p>
    </div>
  );
}

// SortableChip + AddCoachButton are siblings in the same file —
// implement together in the same file. Sketches below.

function SortableChip({
  coach,
  isPrimary,
  disabled,
  onRemove,
  onMakePrimary,
}: {
  coach: ChipCoach;
  isPrimary: boolean;
  disabled?: boolean;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: coach.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
        isPrimary ? "border-orange-500 bg-orange-50" : "border-input bg-background"
      }`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      {isPrimary ? <Crown className="h-3 w-3 text-orange-500" aria-label="Primary" /> : null}
      <span className="font-medium">{coach.name}</span>
      {!isPrimary ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                disabled={disabled}
                aria-label="Chip actions"
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onMakePrimary}>Make primary</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button
        type="button"
        aria-label="Remove coach"
        disabled={disabled}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function AddCoachButton({
  options,
  onPick,
  disabled,
}: {
  options: CoachOption[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      {/* base-ui: trigger takes a render prop, NOT asChild. */}
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || options.length === 0}
            className="h-7 rounded-full text-xs"
          >
            + Add coach
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {options.length === 0 ? (
          <DropdownMenuItem disabled>No more coaches to add</DropdownMenuItem>
        ) : (
          options.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => onPick(o.id)}>
              {o.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Wire into `session-detail-sheet.tsx`**

Replace lines around `SmartCoachSelect` (line 518) with `CoachChipMultiselect`. Replace `handleSmartSelect` (line 202) with:

```ts
async function handleAssignCoaches(next: ChipCoach[]) {
  setSaving(true);
  const { error } = await assignCoaches(
    session.id,
    next.map((c, i) => ({ userId: c.id, isPrimary: i === 0 }))
  );
  setSaving(false);
  if (error) {
    toast.error(error);
    return;
  }
  toast.success("Coaches updated.");
  onUpdate?.();
}
```

The current value comes from `session.assigned_coaches` (loaded via the Task 12 read-path extension).

- [ ] **Step 3: Hide archived coaches from picker, tag in existing chips**

Per edge case 3 in spec §9:
- Filter `options` to exclude `inactive: true` profiles
- If `value` contains an archived coach (existing assignment that pre-dates archival), render that chip with an "(archived)" suffix on the name and a slightly muted border

- [ ] **Step 4: Visual check**

`npm run dev` → open a session detail sheet on `/admin/roster`. Confirm:
- Existing single-coach session shows one chip (primary)
- "+ Add coach" picker lets ops add a second coach
- Drag-reordering changes the crown icon
- Saving fires `assignCoaches` → grid refresh shows multi-coach badges

- [ ] **Step 5: Commit**

```bash
git add components/roster/coach-chip-multiselect.tsx components/roster/session-detail-sheet.tsx
git commit -m "feat(roster): multi-coach chip selector in session detail sheet"
```

---

## Chunk 4: Smoke + deploy

### Task 18: Apply migration → push → smoke

**Files:** none — controller-driven.

- [ ] **Step 1: Final test suite run**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run --exclude '.claude/**' 2>&1 | tail -10
```

Expected: All P5 tests pass (≥ the new ones added: 6 in session-coaches.test.ts, 7 in assign-coaches.test.ts including notification, 1 multi-coach in cost-projection.test.ts, 1 in conflict-detection.test.ts, 1 CI guard = 16 new tests). The 2 pre-existing `healthScore.test.ts` failures persist — unrelated.

- [ ] **Step 2: Final typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Final production build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Re-confirm migration 048 is applied in prod**

Migration 048 was applied in Task 1 Step 3 BEFORE any code shipped. Re-verify before pushing the code commits:

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='session_coaches') AS table_present,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='set_session_coaches') AS rpc_present,
  (SELECT count(*) FROM session_coaches) AS backfilled_rows;
```

All three should be truthy / non-zero. If anything's missing, stop and reapply before pushing — pushing code that calls the helper against a DB without the RPC will 500 every write.

- [ ] **Step 5: Push** `git push origin main`

- [ ] **Step 6: Wait for Vercel deploy `● Ready`**

- [ ] **Step 7: Smoke checklist (manual, against `buildalphakids.app`)**

1. Open `/admin/roster` or `/ops/roster`.
2. **Backwards-compat read**: existing single-coach sessions render unchanged (no "+N" badge, primary coach shows in their row only).
3. **Multi-coach add**: open a session detail sheet → click "+ Add coach" → pick a second coach → save. Toast "Coaches updated." Grid refreshes; primary card now has orange "+1" badge; new coach has the same shift on their row with "↔ shared" badge.
4. **Promote secondary to primary**: open the detail sheet → drag the second chip to position 0. Save. The crown moves; the underlying primary changes; in the grid, "+1" badge moves to the new primary's card.
5. **Cert guard fan-out**: try assigning a coach whose WWCC has expired by the session date → toast surfaces "Cert guard refused assignment — \<coach\>: WWCC expired ...". Neither coach is written.
6. **Remove all coaches**: open detail sheet → remove every chip → save. If the shift's status was `published` / `pending_confirmation` / `confirmed`, it flips to `needs_replacement` (trigger). If the shift was `draft`, status stays `draft` — only the coach is cleared. Grid card shows the empty-state styling either way.
7. **Cost projection**: open the weekly cost chip — a multi-coach shift shows N rows in the byCoach breakdown, one per coach, each priced at that coach's rate. Total hours = sum of coach-hours (a 1-hour two-coach shift counts as 2 coach-hours).
8. **Conflict detection**: schedule the same coach as a secondary on Session A and as a primary on Session B with overlapping date+time. The conflict badge surfaces on both cards.
9. **Notifications**: both newly-added coaches receive a roster notification; the primary's body mentions "lead".
10. **Coach view**: log in as one of the assigned coaches. `/coach/schedule` shows the shift on their list. The detail page shows the other assigned coach name (e.g. "+ Bob"). No write affordances.
11. **CI guard**: deliberately introduce a new `update({ coach_id: ... })` write in any file under `lib/`, `app/`, or `components/`. Run `npx vitest run lib/__tests__/no-direct-coach-id-writes.test.ts` → it fails with the path + line number + the suggested fix. Revert.

If anything fails, debug before moving to P4.

---

## Verification gate (end of P5)

Before declaring P5 done:

- [ ] All new unit tests pass (≥ 16 added)
- [ ] CI guard test passes
- [ ] Typecheck clean
- [ ] Production build compiles
- [ ] Migration 048 applied to production Supabase, backfill count matches pre-migration baseline
- [ ] Pushed to `main`; Vercel deployment `● Ready`
- [ ] Smoke checklist passes
- [ ] No regressions in existing test suite (2 pre-existing healthScore failures remain — unrelated)

---

## Out of scope (deferred to P4 or follow-ups)

- **Drag-and-drop on the roster grid** — that's P4. P5 ships the multi-coach data model and UI in the detail sheet; the grid is read-only in this PR.
- **Migrating the 181 read sites that select `sessions.coach_id`** — they keep working through the trigger-maintained cache. Full migration is a separate "tighten everywhere" follow-up.
- **`expectedUpdatedAt` optimistic-concurrency on `assignCoaches`** — P4 introduces this for the drag-drop flow; the detail-sheet save is rare enough that last-write-wins is acceptable until P4 lands.
- **Per-shift child-attendance integration with multi-coach** (which coach signs each child in) — works with the existing UI; revisit if needed.
- **Defensive DB trigger to block direct `coach_id` writes** — explicitly NOT added per spec §4 P5 footnote (would recurse). CI guard test is the enforcement mechanism.
