# P3 — Shift Card Power Moves Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three discoverable, low-friction actions on every session card in the weekly roster grid: **swap the assigned coach** (Popover with a coach Select, no full dialog), **duplicate the shift** (creates a new draft same-shape session, opens it in edit mode), and **add/edit a note** (Popover with textarea). A small note indicator on the card surfaces when text exists. The detail sheet also grows a Notes section so the note is visible without opening the Popover.

**Architecture:** One new `sessions.notes text` column (migration 047). Two new server actions (`duplicateSession`, `updateSessionNotes`) in the existing `lib/sessions/actions.ts`. Coach swap reuses the existing cert-guarded `updateSession({ coach_id })`. A new shared `SessionCardMenu` client component wraps the DropdownMenu trigger + 3 popover affordances; it's positioned absolutely OVER the card (siblings of the card button, not children) so it doesn't violate HTML by nesting interactive elements. Mounted into both card surfaces — the calendar view's `SessionCard` and the staff-roster-view's inline `StaffSessionCard`.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (admin client + MCP for the migration) · shadcn/ui (`DropdownMenu`, `Popover`, `Textarea`, `Tooltip`) · Vitest · Existing roster components

**Spec source:** `docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md` §4 P3, §5 P3, §6 P3, §9 row 11 (notes permission); reuses Phase 7 cert guard which already wraps `updateSession`.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/047_session_notes.sql` | Create | `ALTER TABLE sessions ADD COLUMN notes text` (nullable, no default) |
| `lib/sessions/actions.ts` | Modify | Add `duplicateSession(id)` and `updateSessionNotes(id, notes)` server actions; `SessionWithRelations` type grows a `notes: string \| null` field; SELECT lists in existing readers add `notes` |
| `components/roster/session-card-menu.tsx` | Create | Client component — DropdownMenu with 3 items (Swap, Duplicate, Notes), each opens its own Popover/dialog. Absolute-positioned wrapper so it siblings the card `<button>`. |
| `components/roster/swap-coach-popover.tsx` | Create | Client — Popover with a coach Select; on save calls `updateSession({ coach_id })` (cert-guarded by existing Phase 7 code) |
| `components/roster/session-notes-popover.tsx` | Create | Client — Popover with a Textarea; on save calls `updateSessionNotes`; toast on success/failure |
| `components/roster/session-card.tsx` | Modify | Wrap the existing button in a relative-positioned `<div>`, add `<SessionCardMenu>` sibling, render a small note indicator when `session.notes` is non-empty |
| `components/roster/staff-roster-view.tsx` | Modify | Same treatment for the inline `StaffSessionCard` |
| `components/roster/session-detail-sheet.tsx` | Modify | Add a Notes section below Details that reads `session.notes`, with an Edit button that opens the same `SessionNotesPopover` (sheet stays open behind it) |

The menu lives in ONE component (`session-card-menu.tsx`) consumed by both card surfaces so the UX is identical. The three Popovers are separate small components so each is testable + reviewable in isolation.

Why split the menu out of `session-card.tsx`: the card today is 110 lines and a single `<button>`. Bolting an interactive menu inside a `<button>` is invalid HTML — clicks on the menu would bubble to the card's onClick. By siblings-not-children the menu doesn't violate the button semantics.

---

## Chunk 1: Schema + Server Actions

### Task 1: Migration 047 (apply via Supabase MCP)

**Files:**
- Create: `supabase/migrations/047_session_notes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Migration 047: sessions.notes — single-text note per shift
-- ============================================================
--
-- Per-session free-text note (e.g. "parent collecting at 3:45",
-- "check first aid kit", "centre door code 4271"). Single source
-- of truth for quick context. For longer threaded discussion
-- between ops and the assigned coach, see the existing
-- shift_threads table — P3 deliberately keeps that surface alive.
--
-- Existing session RLS policies already cover this column (the
-- column inherits row-level access); no new policy needed.

ALTER TABLE sessions
  ADD COLUMN notes text;
```

- [ ] **Step 2: Verify the file**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && cat supabase/migrations/047_session_notes.sql
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/047_session_notes.sql
git commit -m "$(cat <<'EOF'
feat(roster): migration 047 — sessions.notes column

Single-text per-shift note (parent pickup notes, door codes,
"check first aid kit", etc.). Existing session RLS already covers
the new column. Threaded discussion via shift_threads is unchanged
and remains the surface for longer back-and-forth.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§4 P3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Controller applies the migration to production Supabase via MCP later — not the implementer's job.)

---

### Task 2: Server actions — `duplicateSession` + `updateSessionNotes`

**Files:**
- Modify: `lib/sessions/actions.ts`

Both actions go in the existing `actions.ts` (alongside `createSession`, `updateSession`, `bulkReassignCoach`, etc.) because they operate on the same table and share its conventions.

- [ ] **Step 1: Read the existing action conventions**

```bash
sed -n '219,280p' /Users/jaydenkowaider/Developer/BAK-APP/lib/sessions/actions.ts
```

Note: each action returns `{ data, error }`; admin/ops auth via `supabase.auth.getUser()` + `profiles.role` SELECT; cert guard wraps `coach_id` writes; activity_log entries on significant mutations.

- [ ] **Step 2: Update `SessionWithRelations` type to include `notes`**

Find the `SessionWithRelations` interface near the top of `lib/sessions/actions.ts`. Add:

```typescript
export interface SessionWithRelations extends Session {
  // ... existing fields ...
  notes: string | null;
}
```

Also extend the base `Session` type in `lib/types/database.ts` to include `notes: string | null` since it's now a real column. Find the `Session` interface and add the field.

- [ ] **Step 3: Add `notes` to existing SELECT lists**

In `lib/sessions/actions.ts`, the readers `getSessionsForWeek`, `getSessionDetail`, etc. each have a SELECT string. Each one needs `notes` appended. Find them and add. Don't break the existing column list — just add `, notes` at the end of each session SELECT.

Also update the mappers that build `SessionWithRelations` to pass through `notes: s.notes`.

- [ ] **Step 4: Add the `duplicateSession` action**

Insert after `deleteSession` (around line 425):

```typescript
// ============================================================
// 10. duplicateSession — admin/ops only; creates a new draft
// ============================================================

/**
 * Copies a session into a new draft row with `coach_id = null` and
 * resets the started_at / completed_at / cancellation_reason fields.
 * Returns the new id so the caller can open it for editing.
 *
 * Useful for "same shift Tuesday too" — admin clicks Duplicate,
 * then changes the date in the resulting edit dialog.
 */
export async function duplicateSession(
  id: string
): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
      return { data: null, error: "Only admin or ops can duplicate sessions." };
    }

    const { data: original, error: fetchErr } = await supabase
      .from("sessions")
      .select(
        "term_id, date, time, duration_minutes, centre_id, sport, program_id, pay_rate_override, notes"
      )
      .eq("id", id)
      .single();
    if (fetchErr || !original) {
      return { data: null, error: "Session not found." };
    }

    const { data: copy, error: insertErr } = await supabase
      .from("sessions")
      .insert({
        term_id: original.term_id,
        date: original.date,
        time: original.time,
        duration_minutes: original.duration_minutes,
        centre_id: original.centre_id,
        sport: original.sport,
        program_id: original.program_id,
        pay_rate_override: original.pay_rate_override,
        notes: original.notes,
        coach_id: null,
        status: "draft" as SessionStatus,
      })
      .select("id")
      .single();

    if (insertErr || !copy) {
      return { data: null, error: insertErr?.message ?? "Failed to duplicate." };
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_duplicated",
      entity_type: "session",
      entity_id: copy.id,
      metadata: { source_session_id: id },
    });

    return { data: { id: copy.id }, error: null };
  } catch (err) {
    console.error("duplicateSession error:", err);
    return { data: null, error: "Failed to duplicate session." };
  }
}
```

- [ ] **Step 5: Add `updateSessionNotes` action**

Insert after `duplicateSession`:

```typescript
// ============================================================
// 11. updateSessionNotes — admin/ops or the assigned coach
// ============================================================

/**
 * Write-through edit for the per-session note text. Permission:
 * admin/ops, OR the coach currently assigned to the session
 * (via sessions.coach_id — which is also the denormalised primary
 * coach cache post-P5).
 */
export async function updateSessionNotes(
  id: string,
  notes: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const [profileRes, sessionRes] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", user.id).single(),
      supabase.from("sessions").select("coach_id").eq("id", id).single(),
    ]);

    if (sessionRes.error || !sessionRes.data) {
      return { error: "Session not found." };
    }

    const role = profileRes.data?.role;
    const isAdminOrOps = role === "admin" || role === "ops";
    const isAssignedCoach = sessionRes.data.coach_id === user.id;

    if (!isAdminOrOps && !isAssignedCoach) {
      return { error: "You don't have permission to edit notes for this session." };
    }

    // Empty string allowed — wipes the note. Null treated the same.
    const trimmed = notes.trim();
    if (trimmed.length > 2000) {
      return { error: "Note is too long (max 2000 characters)." };
    }

    const { error } = await supabase
      .from("sessions")
      .update({ notes: trimmed === "" ? null : trimmed })
      .eq("id", id);

    if (error) return { error: error.message };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "session_notes_updated",
      entity_type: "session",
      entity_id: id,
      metadata: { note_length: trimmed.length },
    });

    return { error: null };
  } catch (err) {
    console.error("updateSessionNotes error:", err);
    return { error: "Failed to update notes." };
  }
}
```

- [ ] **Step 6: Typecheck**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

Expected: clean. If errors point at consumers selecting `notes` that don't have it in their types yet, fix at the consumer site.

- [ ] **Step 7: Commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add lib/sessions/actions.ts lib/types/database.ts
git commit -m "$(cat <<'EOF'
feat(roster): duplicateSession + updateSessionNotes server actions

Two new server actions feeding P3 shift-card power moves:

- duplicateSession(id): admin/ops only. Copies a session into a new
  draft row with coach_id=null and reset started_at/completed_at.
  Returns the new id so the UI can open it for editing. Useful for
  "same shift Tuesday too" workflows.

- updateSessionNotes(id, notes): admin/ops OR the assigned coach.
  Writes-through; empty string clears the note (stored as NULL).
  2000-char cap. Both actions log to activity_log.

Sessions readers (getSessionsForWeek, getSessionDetail, mappers) now
SELECT the notes column and pass it through on SessionWithRelations.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§6 P3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: UI — Menu + 3 Popovers

### Task 3: SwapCoachPopover component

**Files:**
- Create: `components/roster/swap-coach-popover.tsx`

A simple Popover with a coach `<Select>`. On save calls existing `updateSession({ coach_id })`, which is already Phase-7-cert-guarded — meaning the swap is refused if the target coach has expired WWCC for the session date. No extra cert work needed.

- [ ] **Step 1: Read the existing coach-select pattern**

```bash
grep -n "Select.*coach\|coachId\|defaultCoach" /Users/jaydenkowaider/Developer/BAK-APP/components/roster/create-session-dialog.tsx | head -10
```

- [ ] **Step 2: Create the component**

```typescript
"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSession } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";

interface SwapCoachPopoverProps {
  sessionId: string;
  currentCoachId: string | null;
  coaches: Pick<Profile, "id" | "name">[];
  onSwapped: () => void;
  children: React.ReactNode; // trigger
}

export function SwapCoachPopover({
  sessionId,
  currentCoachId,
  coaches,
  onSwapped,
  children,
}: SwapCoachPopoverProps) {
  const [open, setOpen] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(currentCoachId);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (coachId === currentCoachId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await updateSession(sessionId, { coach_id: coachId });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Coach updated.");
    onSwapped();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* base-ui pattern: PopoverTrigger takes a render prop, not asChild */}
      <PopoverTrigger render={<span>{children}</span>} />
      <PopoverContent className="w-72 p-3 space-y-2" side="right" align="start">
        <div>
          <Label className="text-xs">Swap coach</Label>
          <Select
            value={coachId ?? "__unassigned__"}
            onValueChange={(v) => setCoachId(v === "__unassigned__" ? null : v)}
          >
            <SelectTrigger className="w-full mt-1">
              <SelectValue placeholder="Select coach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">— Unassigned —</SelectItem>
              {coaches.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

Note: `PopoverTrigger asChild` — this codebase uses base-ui, so adjust to the `render` prop if needed (see the existing `WeekCostChip` for the pattern). Verify by checking `components/ui/popover.tsx`.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/swap-coach-popover.tsx
git commit -m "$(cat <<'EOF'
feat(roster): inline SwapCoachPopover for shift cards

Type-or-pick coach swap anchored to the card (Popover, not full
dialog). Reuses updateSession({ coach_id }) which is already
Phase-7-cert-guarded — coaches with expired WWCC for the session
date are refused with a user-facing toast.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P3 — "Swap coach (inline Popover, not full dialog)").

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: SessionNotesPopover component

**Files:**
- Create: `components/roster/session-notes-popover.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateSessionNotes } from "@/lib/sessions/actions";

interface SessionNotesPopoverProps {
  sessionId: string;
  initialNotes: string | null;
  onSaved: (notes: string | null) => void;
  children: React.ReactNode;
}

const MAX = 2000;

export function SessionNotesPopover({
  sessionId,
  initialNotes,
  onSaved,
  children,
}: SessionNotesPopoverProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);

  // Re-sync if the parent passes a different session
  useEffect(() => {
    if (open) setText(initialNotes ?? "");
  }, [open, initialNotes]);

  async function handleSave() {
    setSaving(true);
    const result = await updateSessionNotes(sessionId, text);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    const next = text.trim() === "" ? null : text.trim();
    onSaved(next);
    setOpen(false);
  }

  const over = text.length > MAX;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* base-ui pattern: PopoverTrigger takes a render prop, not asChild */}
      <PopoverTrigger render={<span>{children}</span>} />
      <PopoverContent className="w-80 p-3 space-y-2" side="right" align="start">
        <div>
          <Label className="text-xs" htmlFor="session-note">
            Note
          </Label>
          <Textarea
            id="session-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. parent collecting at 3:45 — check ID before release"
            rows={4}
            maxLength={MAX + 50}
            className="mt-1 text-xs"
          />
          <p className={`mt-1 text-[10px] ${over ? "text-red-500" : "text-muted-foreground/60"}`}>
            {text.length} / {MAX}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || over}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/session-notes-popover.tsx
git commit -m "$(cat <<'EOF'
feat(roster): SessionNotesPopover — per-shift note editor

Card-anchored Popover with a Textarea. Persists via
updateSessionNotes (admin/ops + assigned coach). 2000-char cap with
visible counter, save-disabled when over. Empty input clears the
note (stored as NULL).

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P3 — "Add note (Popover with textarea)").

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: SessionCardMenu (the 3-dot trigger)

**Files:**
- Create: `components/roster/session-card-menu.tsx`

The dropdown menu wraps the trigger button (3-dot icon). Three menu items: Swap, Duplicate, Notes. Each item opens its own surface — Swap and Notes use Popovers; Duplicate calls the server action and on success opens the new session in the existing detail-sheet via a callback.

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Copy, ArrowLeftRight, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { duplicateSession } from "@/lib/sessions/actions";
import { SwapCoachPopover } from "./swap-coach-popover";
import { SessionNotesPopover } from "./session-notes-popover";
import type { SessionWithRelations } from "@/lib/sessions/actions";
import type { Profile } from "@/lib/types/database";

interface SessionCardMenuProps {
  session: SessionWithRelations;
  coaches: Pick<Profile, "id" | "name">[];
  onChange: () => void;
}

export function SessionCardMenu({
  session,
  coaches,
  onChange,
}: SessionCardMenuProps) {
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [noting, setNoting] = useState(false);
  const [localNotes, setLocalNotes] = useState(session.notes);

  async function handleDuplicate() {
    setDuplicating(true);
    const result = await duplicateSession(session.id);
    setDuplicating(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (!result.data) return;
    toast.success("Shift duplicated.");
    onChange();
    // v1 deviation from spec §5 P3 (which says "opens the new card in
    // edit mode"): we refresh the grid and let the admin click the new
    // draft card to edit it. Auto-open requires lifting the new id up
    // to RosterPage and threading it into SessionDetailSheet state —
    // worth a follow-up but the toast + grid update give enough
    // signal for v1.
    router.refresh();
  }

  return (
    <div className="absolute right-1 top-1 z-10">
      <DropdownMenu open={openMenu} onOpenChange={setOpenMenu}>
        {/* base-ui pattern: DropdownMenuTrigger takes a render prop, not asChild */}
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
              aria-label="Session actions"
            >
              <MoreVertical className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
          className="w-44"
        >
          <DropdownMenuItem onSelect={() => setSwapping(true)}>
            <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
            Swap coach
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNoting(true)}>
            <FileText className="mr-2 h-3.5 w-3.5" />
            {localNotes ? "Edit note" : "Add note"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDuplicate} disabled={duplicating}>
            {duplicating ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-2 h-3.5 w-3.5" />
            )}
            Duplicate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Headless popovers — controlled by menu items. Render a hidden
          trigger so the Popover anchors to this menu's container. */}
      {swapping && (
        <SwapCoachPopover
          sessionId={session.id}
          currentCoachId={session.coach_id}
          coaches={coaches}
          onSwapped={() => {
            setSwapping(false);
            onChange();
          }}
        >
          <span className="sr-only" aria-hidden="true" />
        </SwapCoachPopover>
      )}
      {noting && (
        <SessionNotesPopover
          sessionId={session.id}
          initialNotes={localNotes}
          onSaved={(next) => {
            setLocalNotes(next);
            setNoting(false);
            onChange();
          }}
        >
          <span className="sr-only" aria-hidden="true" />
        </SessionNotesPopover>
      )}
    </div>
  );
}
```

Important details:
- The wrapping `<div>` is `absolute right-1 top-1 z-10` so it sits OVER the card without nesting inside the card's `<button>`.
- `onClick={(e) => e.stopPropagation()}` on the trigger and the menu content prevents the card's onClick from firing when admin clicks the menu.
- The popovers are rendered with an invisible trigger so the Popover positions itself relative to the menu's container. State controls open/close.

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/session-card-menu.tsx
git commit -m "$(cat <<'EOF'
feat(roster): SessionCardMenu — 3-dot actions on every shift card

Discoverable hover-revealed menu in the top-right of each session
card. Three actions: Swap coach (opens SwapCoachPopover), Edit/Add
note (opens SessionNotesPopover), Duplicate (calls duplicateSession,
toasts on success). Wrapping div is absolute-positioned + sibling
of the card button so we don't nest interactive elements inside a
<button>. stopPropagation on the menu trigger keeps the underlying
card onClick from firing.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Wire into Card Surfaces

### Task 6: Wire menu into `SessionCard` (calendar view) + note indicator

**Files:**
- Modify: `components/roster/session-card.tsx`

The current file is a single `<button>`. The menu has to be a sibling, not a child. Easiest way: wrap the existing button in a relative `<div>` and add the menu as a sibling.

- [ ] **Step 1: Update SessionCard structure**

In `components/roster/session-card.tsx`:

a) Change the imports — add:
```typescript
import { SessionCardMenu } from "./session-card-menu";
import type { Profile } from "@/lib/types/database";
```

b) Add `coaches` and `onChange` to props:
```typescript
interface SessionCardProps {
  // ... existing ...
  coaches?: Pick<Profile, "id" | "name">[];
  onChange?: () => void;
}
```

c) Wrap the existing `<button>` in `<div className="relative h-full w-full group">` and add the menu + note indicator as siblings:

```typescript
return (
  <div className="relative h-full w-full group">
    <button
      // ... existing button props unchanged ...
    >
      {/* ... existing button children unchanged ... */}
    </button>

    {coaches && onChange && (
      <SessionCardMenu
        session={session}
        coaches={coaches}
        onChange={onChange}
      />
    )}

    {session.notes && (
      <span
        className="pointer-events-none absolute right-1 bottom-7 rounded bg-secondary px-1 text-[9px]"
        title={session.notes}
      >
        📝
      </span>
    )}
  </div>
);
```

Note: the `group` class moves from the button to the wrapping div so hover-reveal on the menu (`group-hover:opacity-100`) still works.

If the button currently uses the `group` class, remove that line — the wrapper carries it now.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

Expected: existing callers passing the SessionCard without `coaches`/`onChange` still compile (those props are optional). Old behaviour preserved.

- [ ] **Step 3: Commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/session-card.tsx
git commit -m "$(cat <<'EOF'
feat(roster): wire SessionCardMenu + note indicator into SessionCard

Card now grows a 3-dot menu (hover-revealed, sibling-not-child of
the card button to keep HTML valid) and a small 📝 note indicator
when session.notes is non-empty. Both gracefully no-op when the
caller doesn't pass coaches/onChange — preserves the existing
contract for non-roster surfaces.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire menu into `StaffSessionCard` (staff-roster-view inline)

**Files:**
- Modify: `components/roster/staff-roster-view.tsx`

The staff-roster-view has its own inline `StaffSessionCard` (a separate component from the calendar's `SessionCard`). It needs the same treatment.

- [ ] **Step 1: Plumb `coaches` + `onChange` through StaffRosterView → StaffRow → StaffSessionCard**

Add to `StaffRosterViewProps`:

```typescript
coaches: Pick<Profile, "id" | "name">[];        // already present
onSessionChange: () => void;                     // NEW — caller-provided refresh callback
```

(`coaches` is already a prop; just plumb a new `onSessionChange` callback that the menu calls after a duplicate / swap / note edit. Most callers can use `() => router.refresh()`.)

- [ ] **Step 2: Add the menu + note indicator inside StaffSessionCard**

Find the `<button>` element in `StaffSessionCard`. Same pattern as Task 6: wrap in a `<div className="relative group">`, add the menu sibling, add the note indicator sibling.

- [ ] **Step 3: Update RosterPage to pass `onSessionChange`**

Find `components/roster/roster-page.tsx`. The `<StaffRosterView ... />` call needs `onSessionChange={handleRefresh}` (or equivalent — the page already has a `handleRefresh` function that revalidates).

- [ ] **Step 4: Typecheck + commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/staff-roster-view.tsx components/roster/roster-page.tsx
git commit -m "$(cat <<'EOF'
feat(roster): wire menu + note indicator into staff-view shift cards

Same treatment for the inline StaffSessionCard inside
staff-roster-view as the calendar view's SessionCard. RosterPage
plumbs an onSessionChange callback (router.refresh) so menu
actions propagate.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P3).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: SessionDetailSheet — Notes section

**Files:**
- Modify: `components/roster/session-detail-sheet.tsx`

When the sheet is open (admin clicked a card to see more), the note should be visible without re-opening the Popover. Add a small section with the note text + an Edit button that opens the same `SessionNotesPopover`.

- [ ] **Step 1: Add the section**

Find a sensible insertion point in the sheet — between the existing Details section and the Programme section is fine.

```typescript
{/* Notes */}
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-medium text-foreground">Notes</h3>
    <SessionNotesPopover
      sessionId={session.id}
      initialNotes={session.notes}
      onSaved={() => onUpdate()}
    >
      <Button variant="ghost" size="sm">
        <Pencil className="mr-1 h-3 w-3" />
        {session.notes ? "Edit" : "Add"}
      </Button>
    </SessionNotesPopover>
  </div>
  {session.notes ? (
    <p className="whitespace-pre-wrap rounded bg-secondary/40 p-3 text-sm">
      {session.notes}
    </p>
  ) : (
    <p className="text-xs italic text-muted-foreground">No notes for this shift.</p>
  )}
</div>
<Separator />
```

Imports needed:
```typescript
import { Pencil } from "lucide-react";
import { SessionNotesPopover } from "./session-notes-popover";
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && git add components/roster/session-detail-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(roster): Notes section in session detail sheet

When the sheet is open, the per-session note is visible without
opening the card's Popover. Edit button on the section header opens
SessionNotesPopover anchored to the sheet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Push + Smoke

### Task 9: Apply migration via MCP → push → smoke

- [ ] **Step 1: Final test suite run**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/utils/ lib/ai/ 2>&1 | tail -6
```

Expected: 20 tests pass (the P1 + P2 helpers + AgeBand + program-prompt; no new tests in P3 since no new pure helpers).

- [ ] **Step 2: Confirm working tree state**

```bash
git status
git log --oneline -10
```

Expected: clean tree, 8 P3 commits on top of `12076c3` (the last P2 commit).

- [ ] **Step 3: ⏸ Controller applies migration 047 via Supabase MCP**

Controller note: stop here and apply via MCP `apply_migration`:
- `project_id`: `yhairjbwqvmrbbvatrze`
- `name`: `session_notes`
- `query`: contents of `supabase/migrations/047_session_notes.sql` (just the `ALTER TABLE sessions ADD COLUMN notes text` statement).

Verify with MCP `execute_sql`:

```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='sessions' AND column_name='notes';
```

Expected: one row, `data_type='text'`, `is_nullable='YES'`.

Only proceed past this step once the column exists.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Wait for deploy `● Ready`**

```bash
until vercel ls --prod 2>&1 | grep -E "● Ready|● Error" | grep -v "● Building" | head -1 | grep -q "● "; do sleep 15; done && vercel ls --prod 2>&1 | grep "● " | head -1
```

Expected: `● Ready` within ~2 minutes.

- [ ] **Step 6: Smoke checklist (manual, against `buildalphakids.app`)**

1. Open `/admin/roster` or `/ops/roster`.
2. **Menu visibility**: hover over any session card. A 3-dot icon should appear in the top-right. Click it — dropdown opens with three items: "Swap coach", "Add note", "Duplicate".
3. **Swap coach**: click "Swap coach" on an assigned shift. Popover opens with a coach Select. Pick a different coach → Save. Toast "Coach updated." appears; card updates to show the new coach name.
4. **Cert guard interop**: try assigning a coach whose WWCC has expired by the session date. Toast surfaces the cert-blocked error from the existing Phase 7 guard.
5. **Add note**: click "Add note" on a shift. Popover opens with a textarea. Type a note, click Save. Toast doesn't appear but the menu re-opens showing "Edit note" instead of "Add note". A small 📝 indicator appears on the card.
6. **Edit note**: click "Edit note" — Popover opens with the existing text. Modify, save. Card indicator persists.
7. **Clear note**: open note Popover, empty the textarea, save. Card indicator disappears.
8. **Duplicate**: click "Duplicate" on any shift. Toast "Shift duplicated." appears; refresh shows the duplicated shift as a draft (no coach assigned) with same date/time/centre/sport.
9. **Sheet notes**: open any shift's detail sheet (click the card body, not the menu). Notes section is visible between Details and Programme. Edit button opens the same Popover.
10. **Coach permission**: log in as a coach, view your own shift. You should be able to edit notes on your own shift. You should NOT see the Duplicate option (or it returns an error toast).

If anything fails, debug before moving to P5.

---

## Verification gate (end of P3)

Before declaring P3 done:

- [ ] All 20 unit tests pass
- [ ] Typecheck clean
- [ ] Production build compiles
- [ ] Migration 047 applied to production Supabase (verified via MCP query)
- [ ] Pushed to `main`; Vercel deployment `● Ready`
- [ ] Smoke checklist (Task 9 Step 6) passes
- [ ] No regressions in existing test suite

---

## Notes for the executor

- **The `<button>` nesting trap**: SessionCard is currently a single `<button>`. Nesting interactive elements inside a `<button>` is invalid HTML and breaks event delegation. Task 6 wraps the button in a relative `<div>` and adds the menu as a sibling. Don't merge the menu inside the button.
- **`stopPropagation` is critical**: every click on menu trigger / menu content / popover content must `stopPropagation` or it bubbles to the card's onClick (which opens the detail sheet, breaking the Popover).
- **Migration ordering**: migration 047 applies BEFORE the push. Same pattern as P2 Task 7. Code that reads `session.notes` will crash without the column.
- **Permission**: notes can be edited by admin/ops OR the assigned coach. The action enforces this server-side. The UI doesn't hide the action from coaches who aren't assigned — they just get a toast error. This matches the existing UX patterns (toast instead of selective render).
- **`base-ui` vs Radix**: this codebase uses `@base-ui/react`, not Radix. The plan uses `asChild` syntax for `PopoverTrigger` — confirm the actual API by reading `components/ui/popover.tsx`. The existing `WeekCostChip` shows the `render` prop pattern if `asChild` isn't available.
- **shadcn primitives in use**: DropdownMenu, Popover, Textarea, Select — all already in `components/ui/`. No new shadcn installs.
- **Out of scope**: shift_threads stays as-is; this plan adds a single-text column, not a thread. If you find yourself wanting threaded replies, that's a follow-up.
- **Pre-existing test failures**: `lib/utils/__tests__/healthScore.test.ts` has 2 failing tests on `main` unrelated to this work. Ignore.
