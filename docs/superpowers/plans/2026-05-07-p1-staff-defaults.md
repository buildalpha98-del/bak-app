# P1 — Staff Defaults Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New staff land active and ready-to-roster: `profiles.status = 'active'` instead of `'onboarding'`, with 5 default `availability_slots` rows (Mon–Fri 8:00am–4:30pm) seeded automatically. Editable later via the existing Availability tab.

**Architecture:** Pure helper builds the default-slot payload (no DB, fully unit-tested). `createStaffMember` calls the helper after profile insert, batch-inserts the rows via Supabase admin client, and skips the seed if any slots already exist. UI surfaces a small "default availability seeded" line in the success state. No schema change — `availability_slots` already exists.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (`@supabase/ssr` + service-role admin client) · Vitest · Tailwind + shadcn/ui · BAK-APP existing patterns

**Spec source:** `docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md` §4 P1, §5 P1, §6 P1, §9 row 6 (skip-if-exists), §9 row 11 (DST stability)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `lib/utils/staff/default-availability.ts` | Create | Pure helper that returns the 5 default Mon–Fri slot rows for a given user_id |
| `lib/utils/staff/__tests__/default-availability.test.ts` | Create | Unit tests for the helper |
| `lib/staff/actions.ts` | Modify | `createStaffMember` lands as `active`, then seeds slots via the helper (skips if any exist) |
| `components/staff/add-staff-form.tsx` | Modify | Success state's email-sent banner gets one extra line confirming default availability was seeded |

Why split out a pure helper for a 5-row constant: it makes the day-of-week math (1=Mon … 5=Fri, never 0=Sun, never 6=Sat) reviewable and unit-testable without spinning up Supabase. Future tweaks (e.g. AEDT-vs-AEST DST handling, or a different default window) live in one isolated place.

---

## Chunk 1: P1 — Staff Defaults

### Task 1: Pure helper + tests (TDD)

**Files:**
- Create: `lib/utils/staff/default-availability.ts`
- Create: `lib/utils/staff/__tests__/default-availability.test.ts`

- [ ] **Step 1: Create the test directory**

```bash
mkdir -p /Users/jaydenkowaider/Developer/BAK-APP/lib/utils/staff/__tests__
```

- [ ] **Step 2: Write the failing tests**

Create `lib/utils/staff/__tests__/default-availability.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateDefaultAvailabilitySlots,
  DEFAULT_AVAILABILITY_WINDOW,
} from "../default-availability";

describe("DEFAULT_AVAILABILITY_WINDOW", () => {
  it("is Mon-Fri 8:00am-4:30pm", () => {
    expect(DEFAULT_AVAILABILITY_WINDOW).toEqual({
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "08:00:00",
      endTime: "16:30:00",
    });
  });
});

describe("generateDefaultAvailabilitySlots", () => {
  const USER_ID = "user-1";

  it("returns exactly 5 rows, one per weekday", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    expect(slots).toHaveLength(5);
  });

  it("assigns each row to the given user_id", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.user_id).toBe(USER_ID);
    }
  });

  it("covers Monday (1) through Friday (5) with no duplicates and no weekend", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    const days = slots.map((s) => s.day_of_week).sort();
    expect(days).toEqual([1, 2, 3, 4, 5]);
  });

  it("sets the same 08:00:00-16:30:00 window on every row", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.start_time).toBe("08:00:00");
      expect(slot.end_time).toBe("16:30:00");
    }
  });

  it("returns empty location_preferences (admin can add later)", () => {
    const slots = generateDefaultAvailabilitySlots(USER_ID);
    for (const slot of slots) {
      expect(slot.location_preferences).toEqual([]);
    }
  });
});
```

- [ ] **Step 3: Run the tests — confirm they fail**

Run from `/Users/jaydenkowaider/Developer/BAK-APP`:

```bash
npx vitest run lib/utils/staff/__tests__/default-availability.test.ts
```

Expected: **all tests FAIL** with an import error ("Cannot find module '../default-availability'"). This proves the tests will catch a regression once the helper exists.

- [ ] **Step 4: Implement the helper**

Create `lib/utils/staff/default-availability.ts`:

```typescript
/**
 * Default availability for new staff: Mon–Fri 8:00am–4:30pm.
 *
 * Stored as Postgres `time` (no timezone) — interpreted in the centre's
 * local timezone at read time. DST boundaries are not a concern because
 * the value is "8am local", not a UTC offset.
 *
 * Pure: no DB calls. The server-side `createStaffMember` calls this
 * helper and batch-inserts the rows after the profile row exists.
 *
 * Adapted from the P1 spec at:
 * docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 */

export const DEFAULT_AVAILABILITY_WINDOW = {
  daysOfWeek: [1, 2, 3, 4, 5] as const,
  startTime: "08:00:00" as const,
  endTime: "16:30:00" as const,
};

export interface DefaultAvailabilitySlotInput {
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location_preferences: string[];
}

export function generateDefaultAvailabilitySlots(
  userId: string,
): DefaultAvailabilitySlotInput[] {
  return DEFAULT_AVAILABILITY_WINDOW.daysOfWeek.map((dow) => ({
    user_id: userId,
    day_of_week: dow,
    start_time: DEFAULT_AVAILABILITY_WINDOW.startTime,
    end_time: DEFAULT_AVAILABILITY_WINDOW.endTime,
    location_preferences: [],
  }));
}
```

- [ ] **Step 5: Run the tests — confirm they pass**

```bash
npx vitest run lib/utils/staff/__tests__/default-availability.test.ts
```

Expected: **5 tests PASS** (1 `DEFAULT_AVAILABILITY_WINDOW`, 4 `generateDefaultAvailabilitySlots`).

- [ ] **Step 6: Commit**

```bash
git add lib/utils/staff/default-availability.ts lib/utils/staff/__tests__/default-availability.test.ts
git commit -m "$(cat <<'EOF'
feat(staff): pure helper for default Mon-Fri availability seed

Used by createStaffMember to land new staff with a sensible default
window (Mon-Fri 8:00am-4:30pm). Pure helper + 5 unit tests so the
day-of-week math (1=Mon..5=Fri, no weekends) is reviewable in
isolation from the DB code.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P1 + §9 row 6).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire helper into `createStaffMember`

**Files:**
- Modify: `lib/staff/actions.ts` (the `createStaffMember` function, currently around line 198)

The current function (post-`5dc6fde`):
1. Creates the auth user with a temp password
2. Inserts the `profiles` row with `status: 'onboarding'`
3. Sends the welcome email
4. Returns `{ id, tempPassword, emailSent }`

New behaviour:
1. `profiles.status = 'active'` (change)
2. Insert 5 default `availability_slots` rows (new)
3. Skip the seed if any slots already exist for the user (defensive — handles the edge case where this is somehow re-run; per spec §9 row 6)
4. Slot-seed failure is **non-fatal** (logs + continues) — same risk model as the welcome-email step

- [ ] **Step 1: Read `lib/staff/actions.ts` and confirm the current shape of `createStaffMember`**

Run:
```bash
sed -n '195,250p' /Users/jaydenkowaider/Developer/BAK-APP/lib/staff/actions.ts
```

Expected: see `createStaffMember(data: CreateStaffData)` returning `{ id, tempPassword, emailSent }`. Note the existing `status: "onboarding" as UserStatus` on profile insert.

- [ ] **Step 2: Add the import for the helper**

Edit `lib/staff/actions.ts`. Find the existing import block at the top (around lines 1–7). Add this import after the existing `staffOnboarding` import:

```typescript
import { generateDefaultAvailabilitySlots } from "@/lib/utils/staff/default-availability";
```

- [ ] **Step 3: Change the profile status from `'onboarding'` to `'active'`**

In `createStaffMember`, find:

```typescript
    status: "onboarding" as UserStatus,
```

Replace with:

```typescript
    status: "active" as UserStatus,
```

- [ ] **Step 4: Seed default availability slots after profile insert**

Add this block immediately **after** the profile-insert error guard (where today the function moves on to send the welcome email). It should land between the `if (profileError) { ... return ... }` block and the `// Send welcome email ...` comment.

```typescript
  // Seed Mon–Fri 8:00am–4:30pm availability so the new staff member
  // is immediately rosterable. Defensive: if any slots already exist
  // (shouldn't happen on fresh create, but guards against re-runs),
  // skip the seed rather than duplicate rows. Non-fatal on failure —
  // ops can add slots from the Availability tab if seeding hiccups.
  try {
    const { count: existingSlotCount } = await admin
      .from("availability_slots")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authUser.user.id);

    if ((existingSlotCount ?? 0) === 0) {
      const slots = generateDefaultAvailabilitySlots(authUser.user.id);
      const { error: slotError } = await admin
        .from("availability_slots")
        .insert(slots);
      if (slotError) {
        console.error("default availability seed failed:", slotError);
      }
    }
  } catch (err) {
    console.error("default availability seed exception:", err);
  }
```

- [ ] **Step 5: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: **clean exit (no output)**. Any TS error means a wrong type — fix before continuing.

- [ ] **Step 6: Run the full focused test suite to confirm nothing regressed**

```bash
npx vitest run lib/utils/
```

Expected: all in-scope tests pass (cert-guard, cert-expiry-summary, cost-projection, variance, default-availability, payRates, etc.).

- [ ] **Step 7: Commit**

```bash
git add lib/staff/actions.ts
git commit -m "$(cat <<'EOF'
feat(staff): land new staff as active + seed default Mon-Fri availability

createStaffMember now lands the profile as status=active (was 'onboarding')
and seeds 5 availability_slots rows (Mon-Fri 8:00am-4:30pm) immediately
after the profile insert. The slots are editable from the Availability
tab; we skip seeding if any rows already exist for the user (defensive).

Both changes are non-fatal — slot-seed failure logs and continues
rather than blocking onboarding. Welcome email path is unchanged.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§4 P1, §6 P1).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update AddStaffForm success message

**Files:**
- Modify: `components/staff/add-staff-form.tsx`

The success state (after `created` is set) currently shows either:
- Green "Welcome email sent to <email>" banner (if `emailSent`), with sub-text "It contains the login URL and a temporary password..."
- Amber "Welcome email could not be sent" banner otherwise

We append one sentence to the green-banner sub-text mentioning the default availability seed, so ops sees the affirmative confirmation in the same place.

- [ ] **Step 1: Locate the email-sent banner in the success state**

```bash
grep -n "Welcome email sent to" /Users/jaydenkowaider/Developer/BAK-APP/components/staff/add-staff-form.tsx
```

Expected: one match around line 80–90.

- [ ] **Step 2: Update the sub-text**

Find this block in `components/staff/add-staff-form.tsx`:

```typescript
              <div>
                <p className="font-medium">Welcome email sent to {created.email}</p>
                <p className="text-xs text-emerald-600/80">
                  It contains the login URL and a temporary password. {created.name.split(" ")[0]} will be prompted to choose a new password on first login.
                </p>
              </div>
```

Replace the inner `<p className="text-xs text-emerald-600/80">` content with:

```typescript
              <div>
                <p className="font-medium">Welcome email sent to {created.email}</p>
                <p className="text-xs text-emerald-600/80">
                  It contains the login URL and a temporary password. {created.name.split(" ")[0]} will be prompted to choose a new password on first login.
                  Default availability seeded (Mon–Fri 8:00am–4:30pm) — edit anytime in the Availability tab.
                </p>
              </div>
```

(Single sentence appended; same paragraph; same colour.)

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Production build sanity check**

```bash
rm -f /Users/jaydenkowaider/Developer/BAK-APP/.next/lock
npm run build
```

Expected: `✓ Compiled successfully`. Pre-existing dynamic-cookie warnings on `/admin/crm/*` are OK (unrelated).

- [ ] **Step 5: Commit**

```bash
git add components/staff/add-staff-form.tsx
git commit -m "$(cat <<'EOF'
chore(staff): confirm default availability in success banner

Append one sentence to the welcome-email banner so ops sees that
default availability was seeded alongside the email send.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Push + smoke-verify

- [ ] **Step 1: Run the focused test suite one more time**

```bash
npx vitest run lib/utils/staff/
```

Expected: 5 tests pass.

- [ ] **Step 2: Confirm the working tree is clean and three commits are on `main`**

```bash
git status
git log --oneline -5
```

Expected: working tree clean; 3 new commits on top of `3b5819d` (the spec) — one per task.

- [ ] **Step 3: Push**

```bash
git push origin main
```

Expected: fast-forward, Vercel auto-deploys. Watch deployment via:

```bash
sleep 30 && vercel inspect bak-app.vercel.app --logs 2>&1 | tail -10
```

Expected: status `● Ready` for the latest commit. If `● Error`, check the inspector URL — Vercel-side issues like the suspended-Supabase-integration we hit before are platform-level, not code.

- [ ] **Step 4: Manual smoke in production**

Once deployment shows Ready:
1. Open `https://buildalphakids.app/admin/staff/new`
2. Create a test staff member with a personal email (e.g. `<you>+p1test@gmail.com`)
3. Confirm:
   - Success banner reads "Welcome email sent…" and includes "Default availability seeded (Mon–Fri 8:00am–4:30pm)…"
   - Email arrives via Resend (check Spam too; if not arriving, Resend domain verification is the issue, separate from this work)
4. Open `/admin/staff/[id]` for the new user → Availability tab → confirm 5 rows: Mon–Fri, 08:00–16:30
5. Open the **/admin/roster** weekly grid — confirm the new staff member appears as a row (was status='active' so they're now in `getActiveCoaches`)
6. Archive the test account via Deactivate to keep the staff list tidy

If any of those 5 checks fail, the bug is in P1 and we revert the relevant commit before proceeding to P2.

---

## Verification gate (end of P1)

Before declaring P1 done and moving to P2:

- [ ] All 5 unit tests pass (`lib/utils/staff/__tests__/default-availability.test.ts`)
- [ ] Typecheck clean (`npx tsc --noEmit`)
- [ ] Production build compiles (`npm run build`)
- [ ] Pushed to `main` and Vercel deployment is `● Ready`
- [ ] Smoke checklist (Step 4 above) passes against the live URL
- [ ] No regressions in the existing test suite

If anything above is red, fix in place; do not start P2 until P1 is fully green in production.

---

## Notes for the executor

- **Pre-existing test failures**: `lib/utils/__tests__/healthScore.test.ts` has 2 failing tests on `main` that are unrelated to this work. Verify by stashing your changes and running them — if they fail clean too, ignore them for P1's verification. Do **not** try to fix them here.
- **Service-role key**: `createStaffMember` already uses `createSupabaseAdmin()` to bypass RLS for both the auth-user create and the profile insert. The slot insert uses the same admin client — no extra config.
- **Why `status: 'active'`** instead of keeping `'onboarding'` and changing the roster query? Per spec §1: `'onboarding'` was meant to mean "compliance not yet verified", but in practice it just hides staff from the roster. Compliance is now its own surface (admin Compliance Health card, per-session cert-guard). `'active'` from day one is the right default; the roster is then the source of truth for who's available to roster, and the cert guard refuses any invalid assignment.
- **Why non-fatal on slot-seed failure?** Mirrors the welcome-email pattern from `5dc6fde`. The cost of duplicate ops work (re-running the slot insert manually) is much lower than the cost of a half-created account that has to be deleted and retried.
- **Why no migration?** `availability_slots` already exists from migration `002_core_tables.sql`. P1 is pure application code.
