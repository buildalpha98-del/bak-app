# P2 — Program Form Upgrades + Custom Item Persistence Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI program generation lifts three restrictions: (1) sport is a free-form combobox (presets ∪ org-wide custom sports); (2) age group is multi-select; (3) equipment picker grows a "+ Add custom" affordance with persistence. Custom sports and equipment are stored org-wide and manageable from a new admin settings page. AI prompt accepts the age-group array and returns a single program with optional per-activity scaffolds.

**Architecture:** Two new tables (`custom_sports`, `custom_equipment`) with case-insensitive uniqueness, RLS admin/ops-write + coach-read. One new column `programs.age_groups jsonb`. Pure helpers split out for AgeBand types + AI output shape extension (per-activity `scaffolds` map). Server actions for CRUD on custom items. AI generation prompt updated to accept `ageGroups: string[]` and produce one program with per-band scaffolds (locked output shape per the master spec). UI: shadcn `Command`+`Popover` combobox for sport; native `Checkbox` group for ages; existing `EquipmentPicker` grows an "+ Add custom" row. New admin settings page lists + manages custom items.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (`@supabase/ssr` + admin client + MCP for migrations) · shadcn/ui (`Command`, `Popover`, `Checkbox`) · Vitest · Anthropic SDK

**Spec source:** `docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md` §4 P2, §5 P2, §6 P2, §7, §9 rows 5, 10, 13; Decisions A, C from §10

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql` | Create | Two new tables + `programs.age_groups` column + RLS |
| `lib/utils/programs/age-bands.ts` | Create | Pure: `AGE_BANDS` const, `AgeBand` type, `formatAgeBand`, `validateAgeBands` |
| `lib/utils/programs/__tests__/age-bands.test.ts` | Create | Tests for helper |
| `lib/programs/custom-taxonomy-actions.ts` | Create | Server actions: `listCustomSports`, `addCustomSport`, `renameCustomSport`, `deleteCustomSport` + same set for equipment |
| `lib/programs/actions.ts` | Modify | `saveProgram` accepts `ageGroups: string[]`, writes to new column; `getRecentProgramsForCentre` joins ageGroups if present |
| `lib/ai/types.ts` | Modify | Extend `ProgramContentJson` activity shape with optional `scaffolds: Record<string, string>` |
| `lib/ai/generate-program.ts` | Modify | Accept `ageGroups: string[]`, update prompt to instruct single-program-with-scaffolds output |
| `app/api/ai/generate-program/route.ts` | Modify | Validate `ageGroups[]` input |
| `components/programs/program-generate-form.tsx` | Modify | Sport combobox, multi-age checkboxes, equipment picker with "+ Add custom" |
| `components/programs/equipment-picker.tsx` | Modify | Adds "+ Add custom" row + callback |
| `components/programs/sport-combobox.tsx` | Create | Type-or-pick combobox with "+ Add" affordance |
| `components/programs/age-group-checkboxes.tsx` | Create | Multi-select checkbox group |
| `components/programs/program-view.tsx` | Modify | Render per-activity scaffolds when present |
| `app/(dashboard)/admin/settings/programs/page.tsx` | Create | Admin settings: list + rename + delete custom sports + equipment |
| `components/admin/custom-taxonomy-manager.tsx` | Create | Client component for the admin settings page |

Why split out small component files for the combobox + checkboxes: keeps `program-generate-form.tsx` focused (it's already 497 lines), gives each new bit a clear unit-test surface, and the components are reusable on the admin settings page.

---

## Chunk 1: Schema + Pure Helpers

### Task 1: Schema migration (apply via Supabase MCP)

**Files:**
- Create: `supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql`

The migration goes in the repo for audit/version-control even though it'll be applied via MCP at the same time. Pattern matches the other 45 migrations.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql`:

```sql
-- ============================================================
-- Migration 046: Custom taxonomy (sports + equipment) and
--   multi-age-group programs
-- ============================================================

-- 1. custom_sports — org-wide; admin/ops can create + delete, coach reads
CREATE TABLE custom_sports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness (functional index — table-constraint
-- form does not accept expressions in Postgres).
CREATE UNIQUE INDEX custom_sports_name_unique
  ON custom_sports (lower(name));

ALTER TABLE custom_sports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_sports read for authenticated"
  ON custom_sports FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "custom_sports write for admin/ops"
  ON custom_sports FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- 2. custom_equipment — same shape + same RLS
CREATE TABLE custom_equipment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX custom_equipment_name_unique
  ON custom_equipment (lower(name));

ALTER TABLE custom_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_equipment read for authenticated"
  ON custom_equipment FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "custom_equipment write for admin/ops"
  ON custom_equipment FOR ALL
  USING (auth_user_role() IN ('admin', 'ops'))
  WITH CHECK (auth_user_role() IN ('admin', 'ops'));

-- 3. programs.age_groups — multi-age support
-- Keep the existing age_group varchar(50) column for v1 (denormalised
-- "primary band" — drop in a later migration once all readers are
-- migrated to age_groups). Backfill any existing rows.
ALTER TABLE programs
  ADD COLUMN age_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE programs
SET age_groups = jsonb_build_array(age_group)
WHERE age_group IS NOT NULL AND age_groups = '[]'::jsonb;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

The controller (not the implementer subagent) runs this — the implementer doesn't have MCP access. Implementer reports back with the file written; controller applies it.

Implementer in this step just confirms the file exists and is syntactically valid SQL.

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && cat supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql | head -5
```

Expected: first 5 lines of the migration print.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql
git commit -m "$(cat <<'EOF'
feat(programs): migration 046 — custom taxonomy + program age_groups

Two new tables (custom_sports, custom_equipment) with case-insensitive
uniqueness and admin/ops-write + authenticated-read RLS. New
programs.age_groups jsonb column for multi-age programs, backfilled
from the existing age_group varchar column. The varchar stays for v1
(denormalised primary band) and gets dropped in a follow-up migration.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§4 P2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

(Controller applies the migration to production Supabase via MCP `apply_migration` after the commit lands. Verification commands provided to the controller in the executor notes.)

---

### Task 2: Pure helper for AgeBand (TDD)

**Files:**
- Create: `lib/utils/programs/age-bands.ts`
- Create: `lib/utils/programs/__tests__/age-bands.test.ts`

- [ ] **Step 1: Create the test dir**

```bash
mkdir -p /Users/jaydenkowaider/Developer/BAK-APP/lib/utils/programs/__tests__
```

- [ ] **Step 2: Write the failing tests**

Create `lib/utils/programs/__tests__/age-bands.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  AGE_BANDS,
  AGE_BAND_LABELS,
  formatAgeBands,
  isValidAgeBand,
  validateAgeBands,
  type AgeBand,
} from "../age-bands";

describe("AGE_BANDS", () => {
  it("exposes 3-5, 5-8, 8-12 in order", () => {
    expect(AGE_BANDS).toEqual(["3-5", "5-8", "8-12"]);
  });
});

describe("AGE_BAND_LABELS", () => {
  it("renders human-readable labels", () => {
    expect(AGE_BAND_LABELS["3-5"]).toBe("3–5 years (Early Childhood)");
    expect(AGE_BAND_LABELS["5-8"]).toBe("5–8 years (Junior)");
    expect(AGE_BAND_LABELS["8-12"]).toBe("8–12 years (Senior)");
  });
});

describe("isValidAgeBand", () => {
  it("returns true for the three valid bands", () => {
    expect(isValidAgeBand("3-5")).toBe(true);
    expect(isValidAgeBand("5-8")).toBe(true);
    expect(isValidAgeBand("8-12")).toBe(true);
  });

  it("returns false for unknown bands", () => {
    expect(isValidAgeBand("0-3")).toBe(false);
    expect(isValidAgeBand("")).toBe(false);
    expect(isValidAgeBand("3-5 ")).toBe(false);
  });
});

describe("validateAgeBands", () => {
  it("ok for one valid band", () => {
    const result = validateAgeBands(["3-5"]);
    expect(result.ok).toBe(true);
  });

  it("ok for multiple valid bands", () => {
    const result = validateAgeBands(["3-5", "5-8"]);
    expect(result.ok).toBe(true);
  });

  it("rejects empty array", () => {
    const result = validateAgeBands([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least one/i);
  });

  it("rejects unknown bands", () => {
    const result = validateAgeBands(["3-5", "0-3"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/0-3/);
  });

  it("rejects duplicate bands", () => {
    const result = validateAgeBands(["3-5", "3-5"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/duplicate/i);
  });
});

describe("formatAgeBands", () => {
  it("joins one band as-is", () => {
    expect(formatAgeBands(["3-5"])).toBe("3–5 years (Early Childhood)");
  });

  it("joins multiple bands with comma", () => {
    expect(formatAgeBands(["3-5", "5-8"])).toBe(
      "3–5 years (Early Childhood), 5–8 years (Junior)",
    );
  });

  it("returns 'No bands selected' for empty array", () => {
    expect(formatAgeBands([])).toBe("No bands selected");
  });
});
```

- [ ] **Step 3: Run the tests — confirm they fail**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/utils/programs/__tests__/age-bands.test.ts
```

Expected: all tests FAIL with "Cannot find module '../age-bands'".

- [ ] **Step 4: Implement the helper**

Create `lib/utils/programs/age-bands.ts`:

```typescript
/**
 * Age bands used across program generation, program library, and
 * curriculum reporting. The bands themselves are a product convention
 * (Early Childhood / Junior / Senior) and live here as the single
 * source of truth — the AI prompt, the program form's checkboxes, and
 * the program-view scaffold renderer all consume these constants.
 *
 * 3–5  → Early Childhood
 * 5–8  → Junior
 * 8–12 → Senior
 *
 * Adapted from the P2 spec at:
 * docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 */

export const AGE_BANDS = ["3-5", "5-8", "8-12"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  "3-5": "3–5 years (Early Childhood)",
  "5-8": "5–8 years (Junior)",
  "8-12": "8–12 years (Senior)",
};

export function isValidAgeBand(value: string): value is AgeBand {
  return (AGE_BANDS as readonly string[]).includes(value);
}

export type AgeBandValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validateAgeBands(bands: string[]): AgeBandValidation {
  if (bands.length === 0) {
    return { ok: false, message: "Select at least one age band." };
  }
  const seen = new Set<string>();
  for (const b of bands) {
    if (!isValidAgeBand(b)) {
      return { ok: false, message: `Unknown age band: ${b}` };
    }
    if (seen.has(b)) {
      return { ok: false, message: `Duplicate age band: ${b}` };
    }
    seen.add(b);
  }
  return { ok: true };
}

export function formatAgeBands(bands: AgeBand[]): string {
  if (bands.length === 0) return "No bands selected";
  return bands.map((b) => AGE_BAND_LABELS[b]).join(", ");
}
```

- [ ] **Step 5: Run the tests — confirm they pass**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/utils/programs/__tests__/age-bands.test.ts
```

Expected: 15 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/programs/age-bands.ts lib/utils/programs/__tests__/age-bands.test.ts
git commit -m "$(cat <<'EOF'
feat(programs): AgeBand pure helper + validation

Single source of truth for the three product-defined age bands
(3-5, 5-8, 8-12). Validation rejects empty input, unknown bands, and
duplicates. Used by the multi-age program form (P2), the AI prompt
builder, and the per-activity scaffold renderer.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P2 + §6 P2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: Server Actions + AI Prompt Update

### Task 3: Custom-taxonomy server actions

**Files:**
- Create: `lib/programs/custom-taxonomy-actions.ts`

This file owns the 8 server actions for custom sports + equipment (4 each: list, add, rename, delete). Admin/ops auth via the existing pattern in `lib/staff/actions.ts`.

- [ ] **Step 1: Read existing auth/RLS pattern**

```bash
sed -n '198,240p' /Users/jaydenkowaider/Developer/BAK-APP/lib/staff/actions.ts
```

Observation: server actions check caller role via a `supabase.auth.getUser()` then a `profiles.role` SELECT. RLS does the second-line enforcement.

**Preset-collision guard**: `addCustomSport` and `renameCustomSport` must also reject any name that matches a preset `SPORTS` entry (case-insensitive). The case-insensitive unique index protects custom-vs-custom, but nothing stops an admin from adding "Soccer" (preset) as a custom sport otherwise.

- [ ] **Step 2: Create `lib/programs/custom-taxonomy-actions.ts`**

```typescript
"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { SPORTS } from "@/lib/types/enums";

const PRESET_SPORTS_LOWER = new Set<string>(SPORTS.map((s) => s.toLowerCase()));

function nameCollidesWithPreset(name: string): boolean {
  return PRESET_SPORTS_LOWER.has(name.toLowerCase());
}

// ============================================================
// Types
// ============================================================

export interface CustomTaxonomyItem {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

interface ActionOk<T = void> {
  data: T extends void ? null : T;
  error: null;
}
interface ActionErr {
  data: null;
  error: string;
}
type Action<T = void> = ActionOk<T> | ActionErr;

// ============================================================
// Auth guard — admin/ops only for writes
// ============================================================

async function requireAdminOrOps(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
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
    return { error: "Only admin or ops can modify custom taxonomy." };
  }
  return { userId: user.id };
}

// ============================================================
// Custom sports
// ============================================================

export async function listCustomSports(): Promise<Action<CustomTaxonomyItem[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_sports")
    .select("id, name, created_by, created_at")
    .order("name");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CustomTaxonomyItem[], error: null };
}

export async function addCustomSport(name: string): Promise<Action<CustomTaxonomyItem>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };
  if (nameCollidesWithPreset(trimmed)) {
    return { data: null, error: `"${trimmed}" is already a preset sport.` };
  }

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_sports")
    .insert({ name: trimmed, created_by: auth.userId })
    .select("id, name, created_by, created_at")
    .single();
  if (error) {
    // 23505 = unique_violation (case-insensitive index)
    if (error.code === "23505") {
      return { data: null, error: `A sport with the name "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: data as CustomTaxonomyItem, error: null };
}

export async function renameCustomSport(
  id: string,
  newName: string,
): Promise<Action> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };
  if (nameCollidesWithPreset(trimmed)) {
    return { data: null, error: `"${trimmed}" is already a preset sport.` };
  }

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_sports")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `A sport with the name "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

export async function deleteCustomSport(id: string): Promise<Action> {
  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_sports").delete().eq("id", id);
  if (error) return { data: null, error: error.message };

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

// ============================================================
// Custom equipment — same 4 actions, same shape
// ============================================================

export async function listCustomEquipment(): Promise<Action<CustomTaxonomyItem[]>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_equipment")
    .select("id, name, created_by, created_at")
    .order("name");
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CustomTaxonomyItem[], error: null };
}

export async function addCustomEquipment(name: string): Promise<Action<CustomTaxonomyItem>> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_equipment")
    .insert({ name: trimmed, created_by: auth.userId })
    .select("id, name, created_by, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `Equipment "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: data as CustomTaxonomyItem, error: null };
}

export async function renameCustomEquipment(
  id: string,
  newName: string,
): Promise<Action> {
  const trimmed = newName.trim();
  if (trimmed.length === 0) return { data: null, error: "Name is required." };
  if (trimmed.length > 64) return { data: null, error: "Name must be ≤ 64 characters." };

  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_equipment")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") {
      return { data: null, error: `Equipment "${trimmed}" already exists.` };
    }
    return { data: null, error: error.message };
  }

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}

export async function deleteCustomEquipment(id: string): Promise<Action> {
  const auth = await requireAdminOrOps();
  if ("error" in auth) return { data: null, error: auth.error };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("custom_equipment").delete().eq("id", id);
  if (error) return { data: null, error: error.message };

  revalidatePath("/admin/settings/programs");
  return { data: null, error: null };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/programs/custom-taxonomy-actions.ts
git commit -m "$(cat <<'EOF'
feat(programs): server actions for custom sports + equipment

Eight server actions across two taxonomies (list, add, rename, delete
for each of sports and equipment). admin/ops-only writes (gated both
in the action and at RLS), name trimmed + length-capped at 64 chars,
case-insensitive duplicate detection via the unique index from
migration 046.

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§6 P2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: AI prompt + program save — multi-age + scaffolds

**Files:**
- Modify: `lib/ai/types.ts` — extend Activity with optional `scaffolds`
- Create: `lib/ai/program-prompt.ts` — extract pure `buildProgramPrompt` helper (testable without hitting the AI)
- Create: `lib/ai/__tests__/program-prompt.test.ts` — unit tests for the prompt builder (per spec §8 P2)
- Modify: `lib/ai/generate-program.ts` — use the extracted helper, accept `ageGroups: string[]`
- Modify: `app/api/ai/generate-program/route.ts` — validate `ageGroups[]`, **drop the strict `SPORTS.includes(body.sport)` check** so custom sports are accepted
- Modify: `lib/programs/actions.ts` — `saveProgram` accepts `ageGroups[]`, writes to new column

- [ ] **Step 1: Read current AI types + generate**

```bash
sed -n '1,90p' /Users/jaydenkowaider/Developer/BAK-APP/lib/ai/types.ts
```

```bash
cat /Users/jaydenkowaider/Developer/BAK-APP/lib/ai/generate-program.ts | head -120
```

Locate: the `Activity` interface inside `ProgramContentJson`, and the prompt-building section of `generate-program.ts`.

- [ ] **Step 2: Extend Activity type in `lib/ai/types.ts`**

Find the `Activity` interface (or whatever the per-activity type is called inside `ProgramContentJson`). Add the optional `scaffolds` field:

```typescript
export interface Activity {
  // ... existing fields ...
  /**
   * Per-age-band modifications for multi-age programs. Keys are the
   * AgeBand strings ("3-5", "5-8", "8-12"). Omitted when only one
   * age band was requested. Values are 1-2 line instructions for
   * adjusting the activity for that band.
   */
  scaffolds?: Record<string, string>;
}
```

- [ ] **Step 3: Extract pure `buildProgramPrompt` helper (TDD)**

Create `lib/ai/__tests__/program-prompt.test.ts` first:

```typescript
import { describe, it, expect } from "vitest";
import { buildProgramPrompt, type BuildProgramPromptInput } from "../program-prompt";

function input(o: Partial<BuildProgramPromptInput> = {}): BuildProgramPromptInput {
  return {
    sport: "Soccer",
    ageGroups: ["5-8"],
    durationMinutes: 45,
    skillFocus: undefined,
    availableEquipment: ["Cones", "Balls"],
    centreContext: undefined,
    ...o,
  };
}

describe("buildProgramPrompt", () => {
  it("includes the sport, duration, and equipment list", () => {
    const p = buildProgramPrompt(input());
    expect(p).toContain("Soccer");
    expect(p).toContain("45");
    expect(p).toContain("Cones");
    expect(p).toContain("Balls");
  });

  it("includes a single age band when one is selected, and instructs to OMIT scaffolds", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["5-8"] }));
    expect(p).toContain("5-8");
    expect(p).toMatch(/only one age band|omit `?scaffolds`?/i);
  });

  it("includes all selected age bands when multiple are selected, and instructs to PROVIDE scaffolds", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["3-5", "5-8"] }));
    expect(p).toContain("3-5");
    expect(p).toContain("5-8");
    expect(p).toMatch(/provide a `?scaffolds`?/i);
    expect(p).toMatch(/single program/i);
  });

  it("instructs to design for the youngest band when multiple selected", () => {
    const p = buildProgramPrompt(input({ ageGroups: ["3-5", "5-8", "8-12"] }));
    expect(p).toMatch(/youngest/i);
  });

  it("adds the unknown-sport fallback for custom sports", () => {
    const p = buildProgramPrompt(input({ sport: "Oztag" }));
    expect(p).toMatch(/unfamiliar|general fundamentals/i);
  });

  it("does NOT add the unknown-sport fallback for preset sports", () => {
    const p = buildProgramPrompt(input({ sport: "Soccer" }));
    expect(p).not.toMatch(/unfamiliar/i);
  });

  it("includes skill focus when provided", () => {
    const p = buildProgramPrompt(input({ skillFocus: "ball handling" }));
    expect(p).toContain("ball handling");
  });

  it("includes centre name + recent programs when centreContext is provided", () => {
    const p = buildProgramPrompt(
      input({
        centreContext: {
          centreName: "Tiny Tots Liverpool",
          recentPrograms: [
            { title: "Soccer Basics", sport: "Soccer", skillFocus: "kicking" },
          ],
        },
      }),
    );
    expect(p).toContain("Tiny Tots Liverpool");
    expect(p).toContain("Soccer Basics");
  });
});
```

Run the failing tests:

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/ai/__tests__/program-prompt.test.ts
```

Expected: FAIL with "Cannot find module '../program-prompt'".

Then create `lib/ai/program-prompt.ts`:

```typescript
/**
 * Pure prompt builder for AI program generation. Extracted from
 * generate-program.ts so the prompt logic (age-band scaffolding,
 * unknown-sport fallback, centre context) is testable without
 * invoking the Anthropic API.
 *
 * Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
 * (§6 P2 + §8 P2 — "unit test the AI prompt builder with
 * ageGroups: ['3-5', '5-8']").
 */

import { SPORTS } from "@/lib/types/enums";

export interface BuildProgramPromptInput {
  sport: string;
  ageGroups: string[]; // validated upstream; expected non-empty + valid AgeBand strings
  durationMinutes: number;
  skillFocus?: string;
  availableEquipment: string[];
  centreContext?: {
    centreName: string;
    recentPrograms: Array<{
      title: string;
      sport: string;
      skillFocus: string | null;
    }>;
  };
}

const PRESET_SPORTS_LOWER = new Set<string>(SPORTS.map((s) => s.toLowerCase()));

export function buildProgramPrompt(input: BuildProgramPromptInput): string {
  const ages = input.ageGroups;
  const isMulti = ages.length > 1;
  const isUnknownSport = !PRESET_SPORTS_LOWER.has(input.sport.toLowerCase());

  const ageSection = isMulti
    ? `This program will be delivered to a mixed-age group spanning the following bands: ${ages.join(", ")}.
Design activities appropriate to the youngest selected band (${ages[0]}). For each activity provide a \`scaffolds\` object whose keys are the selected age bands and whose values are 1-2 line instructions for adjusting the activity for that band (e.g. for the youngest: simpler rules, walking instead of running; for older: add a challenge constraint or obstacle).

Output a single program — never a list of programs.`
    : `This program is for age band ${ages[0]}. Design activities appropriate to that band.
When only one age band is selected, omit \`scaffolds\` from each activity.`;

  const unknownSportSection = isUnknownSport
    ? `\n\nNote: "${input.sport}" is not a preset sport in our taxonomy. If the sport is unfamiliar, focus on general fundamentals appropriate to the youngest selected age band: ball-handling, evasion, balance, teamwork.`
    : "";

  const skillFocusSection = input.skillFocus
    ? `\n\nSkill focus: ${input.skillFocus}.`
    : "";

  const centreSection = input.centreContext
    ? `\n\nCentre: ${input.centreContext.centreName}.\nRecently delivered at this centre (avoid repeating titles + skill focus):\n${input.centreContext.recentPrograms
        .map((p) => `- ${p.title}${p.skillFocus ? ` (${p.skillFocus})` : ""}`)
        .join("\n")}`
    : "";

  return `You are designing a ${input.durationMinutes}-minute coaching session for ${input.sport}.

${ageSection}

Available equipment: ${input.availableEquipment.join(", ")}.${skillFocusSection}${unknownSportSection}${centreSection}

Return the full program as structured JSON following the ProgramContentJson schema.`;
}
```

Run the tests again:

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/ai/__tests__/program-prompt.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 4: Update `lib/ai/generate-program.ts` to use the extracted builder**

Two changes:
1. Replace the existing prompt-construction code with a single call to `buildProgramPrompt(input)`.
2. Update the function's input type to require `ageGroups: string[]` (was singular `ageGroup`).

Concretely:

```typescript
import { buildProgramPrompt, type BuildProgramPromptInput } from "./program-prompt";

export type GenerateProgramInput = BuildProgramPromptInput;

// ... inside the generate function:
const prompt = buildProgramPrompt(input);
// ... pass `prompt` to anthropic.messages.create as before
```

Find any code in `generate-program.ts` that referenced `input.ageGroup` (singular) and remove or update — all age handling now lives in `buildProgramPrompt`.

- [ ] **Step 5: Validate ageGroups + drop strict sport allowlist in `app/api/ai/generate-program/route.ts`**

Find the request handler (currently around lines 50-90 based on the file structure). Two changes:

a) Replace any single-`ageGroup` validation with array validation using the helper from Task 2:

```typescript
import { validateAgeBands } from "@/lib/utils/programs/age-bands";

// inside the handler, after parsing body:
const v = validateAgeBands(body.ageGroups ?? []);
if (!v.ok) return NextResponse.json({ error: v.message }, { status: 400 });
```

b) **Drop the strict `SPORTS.includes(body.sport)` check** that rejects custom sports. Replace with a minimal sanity check that allows any non-empty trimmed string ≤ 64 chars:

```typescript
const sport = typeof body.sport === "string" ? body.sport.trim() : "";
if (sport.length === 0 || sport.length > 64) {
  return NextResponse.json({ error: "Sport is required." }, { status: 400 });
}
```

The case-insensitive uniqueness on `custom_sports.name` + the preset-collision guard in `addCustomSport` prevent malicious inputs; the route just needs to accept the sport string verbatim and pass it to the prompt.

- [ ] **Step 6: Update `lib/programs/actions.ts` saveProgram**

Find `saveProgram`. Change its input to accept `ageGroups: string[]` and write to the new column. For v1, also write the first element to `age_group` (the existing varchar) so old reads still work.

```typescript
export interface SaveProgramInput {
  sport: string;
  ageGroups: string[];           // was: ageGroup: string
  durationMinutes: number;
  skillFocus?: string;
  contentJson: ProgramContentJson;
  equipmentUsed: string[];
}

// inside saveProgram, when building the insert payload:
{
  sport: input.sport,
  age_groups: input.ageGroups,
  age_group: input.ageGroups[0] ?? null,  // keep denormalised primary band
  // ... rest unchanged ...
}
```

Also: any read site in this file that selects `age_group` should also select `age_groups` going forward. Add the column to the SELECT lists. Don't refactor consumers in this PR.

- [ ] **Step 7: Typecheck**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

Expected: TS errors in `components/programs/program-generate-form.tsx` that still pass `ageGroup: string` to these. **Don't fix them yet** — the form is rewritten in Task 5.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/types.ts lib/ai/program-prompt.ts lib/ai/__tests__/program-prompt.test.ts lib/ai/generate-program.ts app/api/ai/generate-program/route.ts lib/programs/actions.ts
git commit -m "$(cat <<'EOF'
feat(ai): multi-age program generation — pure prompt builder + per-activity scaffolds

Extracted buildProgramPrompt to lib/ai/program-prompt.ts so the prompt
logic is testable without invoking the Anthropic API. 8 unit tests
cover: single-age (omit scaffolds), multi-age (require scaffolds),
youngest-band design instruction, unknown-sport fallback, skill focus,
centre context.

generate-program now uses the extracted builder and accepts
ageGroups: string[]. saveProgram writes the array to
programs.age_groups (new column from migration 046) and keeps writing
the first band to age_group for backwards-compat.

/api/ai/generate-program: validates ageGroups via the AgeBand helper
from Task 2 AND drops the strict SPORTS.includes(body.sport) allowlist
so custom sports from custom_sports table are accepted (the preset-
collision guard in addCustomSport + the case-insensitive unique index
prevent abuse).

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§6 P2 + Decision A from §10 + §8 P2 testing requirement).

Note: components/programs/program-generate-form.tsx will have TS errors
until Task 5; intentional — Task 5 rewrites its inputs.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: UI

### Task 5: Sport combobox + multi-age checkboxes + custom equipment

**Files:**
- Create: `components/programs/sport-combobox.tsx`
- Create: `components/programs/age-group-checkboxes.tsx`
- Modify: `components/programs/equipment-picker.tsx` — add "+ Add custom" row + callback
- Modify: `components/programs/program-generate-form.tsx` — wire all three + remove old Select+Select
- Modify: `components/programs/program-view.tsx` — render scaffolds when present

- [ ] **Step 1: Sport combobox component**

Create `components/programs/sport-combobox.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Check, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { SPORTS } from "@/lib/types/enums";
import {
  listCustomSports,
  addCustomSport,
  type CustomTaxonomyItem,
} from "@/lib/programs/custom-taxonomy-actions";
import { cn } from "@/lib/utils";

interface SportComboboxProps {
  value: string;
  onChange: (sport: string) => void;
}

export function SportCombobox({ value, onChange }: SportComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState<CustomTaxonomyItem[]>([]);

  useEffect(() => {
    listCustomSports().then(({ data }) => {
      if (data) setCustom(data);
    });
  }, []);

  const allSports = [...SPORTS, ...custom.map((c) => c.name)];
  const seen = new Set<string>();
  const dedupedSports = allSports.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const trimmed = query.trim();
  const exactMatch = dedupedSports.some(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = trimmed.length > 0 && !exactMatch;

  async function handleAdd() {
    if (!canAdd) return;
    const result = await addCustomSport(trimmed);
    if (result.data) {
      setCustom((prev) => [...prev, result.data]);
      onChange(result.data.name);
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value || "Select sport"}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or add a sport…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {canAdd ? (
                <button
                  type="button"
                  onClick={handleAdd}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  Add &ldquo;{trimmed}&rdquo;
                </button>
              ) : (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">
                  No sports found.
                </p>
              )}
            </CommandEmpty>
            <CommandGroup>
              {dedupedSports.map((s) => (
                <CommandItem
                  key={s}
                  value={s}
                  onSelect={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === s ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {s}
                </CommandItem>
              ))}
              {canAdd && (
                <CommandItem onSelect={handleAdd} className="text-primary">
                  <Plus className="mr-2 h-4 w-4" />
                  Add &ldquo;{trimmed}&rdquo;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

Note: if `Command` / `Popover` aren't in `components/ui/`, add them with `npx shadcn@latest add command popover` first. Check with:

```bash
ls /Users/jaydenkowaider/Developer/BAK-APP/components/ui/ | grep -E "command|popover"
```

If only `popover` exists (likely), add `command`:

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx shadcn@latest add command
```

- [ ] **Step 2: Age-group checkbox group component**

Create `components/programs/age-group-checkboxes.tsx`:

```typescript
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AGE_BANDS, AGE_BAND_LABELS, type AgeBand } from "@/lib/utils/programs/age-bands";

interface AgeGroupCheckboxesProps {
  value: AgeBand[];
  onChange: (next: AgeBand[]) => void;
}

export function AgeGroupCheckboxes({ value, onChange }: AgeGroupCheckboxesProps) {
  function toggle(band: AgeBand) {
    if (value.includes(band)) {
      onChange(value.filter((b) => b !== band));
    } else {
      onChange([...value, band]);
    }
  }

  return (
    <div className="space-y-2">
      {AGE_BANDS.map((band) => {
        const id = `age-band-${band}`;
        const checked = value.includes(band);
        return (
          <div key={band} className="flex items-center gap-3">
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => toggle(band)}
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {AGE_BAND_LABELS[band]}
            </Label>
          </div>
        );
      })}
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Select at least one age band.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Equipment picker — add "+ Add custom" row**

Modify `components/programs/equipment-picker.tsx`. Add an optional `onAddCustom` callback prop; render a small input + Add button below the pills:

```typescript
interface EquipmentPickerProps {
  items: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Called when the admin adds a new custom equipment item. */
  onAddCustom?: (name: string) => Promise<void>;
}
```

After the pills `<div>`, before the "X of Y selected" `<p>`:

```typescript
{onAddCustom && (
  <AddCustomEquipmentRow
    existing={items}
    onAdd={async (name) => {
      await onAddCustom(name);
    }}
  />
)}
```

And add the row component at the bottom of the file:

```typescript
function AddCustomEquipmentRow({
  existing,
  onAdd,
}: {
  existing: string[];
  onAdd: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const duplicate = existing.some(
    (e) => e.toLowerCase() === trimmed.toLowerCase(),
  );
  const canAdd = trimmed.length > 0 && trimmed.length <= 64 && !duplicate;

  async function handle() {
    if (!canAdd || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 pt-2 border-t">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="+ Add custom equipment (e.g. tackle bags)"
          className="flex-1 rounded border bg-card px-2 py-1 text-xs"
          maxLength={64}
        />
        <button
          type="button"
          onClick={handle}
          disabled={!canAdd || busy}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {duplicate && trimmed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          &ldquo;{trimmed}&rdquo; is already in the list.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

Don't forget the `useState` import.

- [ ] **Step 4: Update program-view to render scaffolds**

In `components/programs/program-view.tsx`, find where each activity is rendered. Below the activity's existing description/details, add:

```typescript
{activity.scaffolds && Object.keys(activity.scaffolds).length > 0 && (
  <div className="mt-2 space-y-1 rounded bg-secondary/40 px-3 py-2 text-xs">
    <p className="font-medium text-muted-foreground">By age:</p>
    {Object.entries(activity.scaffolds).map(([band, note]) => (
      <p key={band} className="text-foreground">
        <span className="font-medium">{band}:</span> {note}
      </p>
    ))}
  </div>
)}
```

**Step 5a–5h: Rewire `components/programs/program-generate-form.tsx`**

The form is 497 lines. The rewrite is broken into 8 small steps so a partial failure is isolatable. Apply them in order — do not skip or reorder.

- [ ] **Step 5a: Add the new imports at the top**

In `components/programs/program-generate-form.tsx`, add these imports near the existing imports (after the SPORTS import line):

```typescript
import { SportCombobox } from "./sport-combobox";
import { AgeGroupCheckboxes } from "./age-group-checkboxes";
import {
  addCustomEquipment,
} from "@/lib/programs/custom-taxonomy-actions";
import { type AgeBand } from "@/lib/utils/programs/age-bands";
```

- [ ] **Step 5b: Remove the local `AGE_GROUPS` constant and `AgeGroup` type usage**

Delete the local `AGE_GROUPS: { value: AgeGroup; label: string }[]` const at the top of the file. Remove `AgeGroup` from the import line from `@/lib/ai/types` (keep `ProgramContentJson` and `SessionDuration`). The type is now imported from `@/lib/utils/programs/age-bands` as `AgeBand` (already done in 5a).

- [ ] **Step 5c: Change `ageGroup` state to `ageGroups` array**

Find:

```typescript
const [ageGroup, setAgeGroup] = useState<AgeGroup | "">("");
```

Replace with:

```typescript
const [ageGroups, setAgeGroups] = useState<AgeBand[]>([]);
```

- [ ] **Step 5d: Replace sport `<Select>` with `<SportCombobox>`**

Find the existing sport `<Select>` block (look for `value={sport}` and `onValueChange={(v) => setSport(v as Sport)}`). Replace the entire `<Select>` element with:

```typescript
<SportCombobox value={sport} onChange={setSport} />
```

Note: `setSport` previously expected `Sport | ""`; widen it. Change `useState<Sport | "">("")` to `useState<string>("")` so the combobox can pass any sport name including custom ones.

- [ ] **Step 5e: Replace age-group `<Select>` with `<AgeGroupCheckboxes>`**

Find the age-group `<Select>` block. Replace the entire `<Select>` with:

```typescript
<AgeGroupCheckboxes value={ageGroups} onChange={setAgeGroups} />
```

- [ ] **Step 5f: Update the equipment picker call**

Find `<EquipmentPicker items={equipmentItems} selected={selectedEquipment} onChange={setSelectedEquipment} />`. Replace with:

```typescript
<EquipmentPicker
  items={equipmentItems}
  selected={selectedEquipment}
  onChange={setSelectedEquipment}
  onAddCustom={async (name) => {
    const result = await addCustomEquipment(name);
    if (result.data) {
      setCentreEquipmentItems((prev) => [...prev, result.data!.name]);
      setSelectedEquipment((prev) => [...prev, result.data!.name]);
    } else if (result.error) {
      toast.error(result.error);
    }
  }}
/>
```

- [ ] **Step 5g: Update `isFormValid`, `handleGenerate`, `handleSave` to use `ageGroups`**

Find:

```typescript
const isFormValid = sport && ageGroup && durationMinutes && selectedEquipment.length > 0;
```

Replace with:

```typescript
const isFormValid =
  sport &&
  ageGroups.length > 0 &&
  durationMinutes &&
  selectedEquipment.length > 0;
```

In `handleGenerate`, find the `body: JSON.stringify({...})` block. Replace `ageGroup,` with `ageGroups,`.

In `handleSave`, find:

```typescript
const { error: saveError } = await saveProgram({
  sport: sport as string,
  ageGroup: ageGroup as string,
  ...
});
```

Replace `ageGroup: ageGroup as string,` with `ageGroups,`.

- [ ] **Step 5h: Typecheck after the rewrite**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

Expected: clean (TS errors from Task 4 are now resolved). If errors remain, they're in the form file — re-read the file and check whether step 5a–5g were each applied.

- [ ] **Step 6: Build sanity check**

```bash
rm -f /Users/jaydenkowaider/Developer/BAK-APP/.next/lock && cd /Users/jaydenkowaider/Developer/BAK-APP && npm run build 2>&1 | grep -E "(✓ Compiled|✗|Failed)" | head -3
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add components/programs/sport-combobox.tsx components/programs/age-group-checkboxes.tsx components/programs/equipment-picker.tsx components/programs/program-generate-form.tsx components/programs/program-view.tsx
git commit -m "$(cat <<'EOF'
feat(programs): combobox sport + multi-age checkboxes + custom equipment

Program generation form now supports:
- Sport via combobox: type-or-pick from SPORTS ∪ custom_sports, with
  "+ Add 'Oztag'" affordance when no exact match
- Age group multi-select via Checkbox group (min 1)
- Equipment picker grows a "+ Add custom" row that persists via
  the custom_equipment table
- ProgramView renders per-activity `scaffolds` as a small "By age"
  section below each activity when present

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Admin settings page for custom taxonomy

**Files:**
- Create: `app/(dashboard)/admin/settings/programs/page.tsx` — server component, fetches data
- Create: `components/admin/custom-taxonomy-manager.tsx` — client component, list + rename + delete

- [ ] **Step 1: Create the server page**

Create `app/(dashboard)/admin/settings/programs/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  listCustomSports,
  listCustomEquipment,
} from "@/lib/programs/custom-taxonomy-actions";
import { CustomTaxonomyManager } from "@/components/admin/custom-taxonomy-manager";

export default async function AdminCustomTaxonomyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    redirect("/");
  }

  const [sportsRes, equipmentRes] = await Promise.all([
    listCustomSports(),
    listCustomEquipment(),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-semibold">Custom Sports &amp; Equipment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Items added here become available to everyone in the
          program-generation form. Rename or delete sparingly — programs
          already saved against these names keep their text.
        </p>
      </div>
      <CustomTaxonomyManager
        initialSports={sportsRes.data ?? []}
        initialEquipment={equipmentRes.data ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the client manager component**

Create `components/admin/custom-taxonomy-manager.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  addCustomSport,
  addCustomEquipment,
  renameCustomSport,
  renameCustomEquipment,
  deleteCustomSport,
  deleteCustomEquipment,
  type CustomTaxonomyItem,
} from "@/lib/programs/custom-taxonomy-actions";

interface Props {
  initialSports: CustomTaxonomyItem[];
  initialEquipment: CustomTaxonomyItem[];
}

export function CustomTaxonomyManager({ initialSports, initialEquipment }: Props) {
  const [sports, setSports] = useState(initialSports);
  const [equipment, setEquipment] = useState(initialEquipment);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <TaxonomyCard
        title="Custom Sports"
        items={sports}
        add={addCustomSport}
        rename={renameCustomSport}
        remove={deleteCustomSport}
        onUpdate={setSports}
      />
      <TaxonomyCard
        title="Custom Equipment"
        items={equipment}
        add={addCustomEquipment}
        rename={renameCustomEquipment}
        remove={deleteCustomEquipment}
        onUpdate={setEquipment}
      />
    </div>
  );
}

function TaxonomyCard({
  title,
  items,
  add,
  rename,
  remove,
  onUpdate,
}: {
  title: string;
  items: CustomTaxonomyItem[];
  add: (name: string) => Promise<{ data: CustomTaxonomyItem | null; error: string | null }>;
  rename: (id: string, newName: string) => Promise<{ data: null; error: string | null }>;
  remove: (id: string) => Promise<{ data: null; error: string | null }>;
  onUpdate: (next: CustomTaxonomyItem[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const result = await add(trimmed);
    if (result.data) {
      onUpdate([...items, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  async function handleRename(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const result = await rename(id, trimmed);
    if (!result.error) {
      onUpdate(
        items
          .map((i) => (i.id === id ? { ...i, name: trimmed } : i))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Programs already saved against this name keep their text.`)) return;
    const result = await remove(id);
    if (!result.error) {
      onUpdate(items.filter((i) => i.id !== id));
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add new…"
            maxLength={64}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button onClick={handleAdd} disabled={!newName.trim()}>
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded border bg-card px-3 py-1.5"
              >
                {editingId === item.id ? (
                  <>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(item.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <div className="flex gap-1 ml-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRename(item.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{item.name}</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditValue(item.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(item.id, item.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck + build**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx tsc --noEmit
```

```bash
rm -f /Users/jaydenkowaider/Developer/BAK-APP/.next/lock && cd /Users/jaydenkowaider/Developer/BAK-APP && npm run build 2>&1 | grep -E "(✓ Compiled|✗|Failed)" | head -3
```

Expected: clean + `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/admin/settings/programs/page.tsx components/admin/custom-taxonomy-manager.tsx
git commit -m "$(cat <<'EOF'
feat(programs): admin settings — manage custom sports + equipment

New page at /admin/settings/programs lists every custom sport and
every custom equipment item with rename + delete. admin/ops only
(redirect for coach role). Confirm dialog on delete; existing programs
saved against the name keep their text (we just stop offering the
item in future pickers).

Spec: docs/superpowers/specs/2026-05-07-roster-and-programs-redesign-design.md
(§5 P2 — "Custom items management").

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: Push + Smoke

### Task 7: Apply migration → push → smoke

**CRITICAL ORDERING**: the migration MUST be applied to production Supabase BEFORE `git push origin main`. Vercel auto-deploys on push, and the new code in this commit-set reads `programs.age_groups` and the two new tables. Pushing first = deploy lands before the column exists = `saveProgram` 500s on every call. The controller (orchestrating session) applies the migration via Supabase MCP; the implementer waits for confirmation, then proceeds with the push.

- [ ] **Step 1: Final test suite run**

```bash
cd /Users/jaydenkowaider/Developer/BAK-APP && npx vitest run lib/utils/programs/ lib/ai/ 2>&1 | tail -6
```

Expected: 15 (age-bands) + 8 (program-prompt) = 23 tests pass.

- [ ] **Step 2: Confirm working tree state**

```bash
git status
git log --oneline -6
```

Expected: clean tree, 6 P2 commits on top of `4eddd5d` (the last P1 commit).

- [ ] **Step 3: ⏸ Controller applies migration 046 via Supabase MCP**

Controller note: stop here and apply the migration to production. Use MCP `apply_migration` with:
- `project_id`: `yhairjbwqvmrbbvatrze`
- `name`: `custom_taxonomy_and_program_age_groups`
- `query`: contents of `supabase/migrations/046_custom_taxonomy_and_program_age_groups.sql`

Then verify with MCP `execute_sql`:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('custom_sports', 'custom_equipment');
```

Expected: both rows returned.

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='programs' AND column_name='age_groups';
```

Expected: one row, `data_type='jsonb'`.

Only proceed past this step once both checks pass.

- [ ] **Step 4: Push**

```bash
git push origin main
```

- [ ] **Step 5: Confirm Vercel deploy lands `● Ready`**

Wait for the deploy:

```bash
until vercel ls --prod 2>&1 | grep -E "● (Ready|Error)" | head -1 | grep -q "● "; do sleep 15; done && vercel ls --prod 2>&1 | grep "● " | head -1
```

Expected: `● Ready` within ~2 minutes.

- [ ] **Step 6: Smoke checklist (manual, against `buildalphakids.app`)**

1. Open `/admin/programs/generate`.
2. **Sport combobox**: type "Oztag" — the dropdown shows `+ Add "Oztag"`. Click it. The field now reads Oztag, the popover closes.
3. **Age group**: tick "3–5 years" and "5–8 years". Confirm the "Select at least one" hint disappears once at least one is ticked. The Generate button stays disabled until at least one is selected.
4. **Equipment**: in the picker, click "+ Add custom" row, type "Tackle bags", click Add. The pill appears at the bottom of the picker and is auto-selected.
5. Click **Generate Programme**. Wait for the AI response. The preview should show activities, and where multiple age bands were selected, each activity should have a "By age" sub-section showing per-band scaffold notes.
6. Save the program. Confirm it appears in `/admin/programs`.
7. Open `/admin/settings/programs`. Confirm "Oztag" is in the Custom Sports list and "Tackle bags" is in the Custom Equipment list. Try renaming "Oztag" to "Oz Tag" — confirm the rename works. Try deleting it (confirm the warning copy). Re-add for cleanliness.
8. Log out and in as a coach (if you have a coach test account). Confirm `/admin/settings/programs` redirects them away — only admin/ops should reach it.

If any of the 8 steps fail, the bug is in P2 and we don't proceed to P3 until fixed.

---

## Verification gate (end of P2)

Before declaring P2 done and moving to P3:

- [ ] All 15 unit tests pass
- [ ] Typecheck clean
- [ ] Production build compiles
- [ ] Migration 046 applied to production Supabase (verified via MCP query)
- [ ] Pushed to `main`; Vercel deployment `● Ready`
- [ ] Smoke checklist (Task 7 Step 6) passes
- [ ] No regressions in existing test suite

---

## Notes for the executor

- **shadcn `Command` component**: not currently installed. The first thing Task 5 does is check + install. Don't skip this.
- **Pre-existing test failures**: `lib/utils/__tests__/healthScore.test.ts` has 2 failing tests on `main` unrelated to this work. Ignore them.
- **Migration application**: the implementer writes the migration file; the **controller** (orchestrating session) runs it via Supabase MCP before pushing the deploy. The migration must apply BEFORE the deploy, or the deploy will crash on `programs.age_groups` not existing.
- **Backwards compat**: `programs.age_group` (singular varchar) stays for v1. Code reading the old column keeps working; new code uses `age_groups`. Drop the old column in a P2.1 follow-up once all readers migrate.
- **Custom items in the picker after delete**: per the smoke checklist note + the manager UI's confirm-dialog text — if you delete an item that was used in a saved program, the program keeps the name in its `equipmentUsed`/`sport` text. Future pickers just don't offer it. No data migration required.
- **TS errors after Task 4, before Task 5**: intentional. The form's type contract changes from `ageGroup: string` to `ageGroups: string[]`. Don't try to fix the form in Task 4 — that's Task 5's job. The plan's order keeps each commit small and reviewable.
- **age_group vs age_groups read sites (v1 limitation)**: about 10 read sites still SELECT only the singular `age_group` column (`program-detail.tsx`, `program-library.tsx`, `program-view.tsx`, `app/api/assessments/generate-skills/route.ts`, `app/api/insights/generate/route.ts`, plus several SELECT lists in `lib/programs/actions.ts`). After P2, those still display only the **primary** band (the first element of `age_groups`, denormalised into `age_group` at save time). The library filter, the detail page, and downstream API consumers (assessments, insights) see one band per program. Multi-band display on those surfaces is a **P2.1 follow-up** — explicitly out of scope here.
