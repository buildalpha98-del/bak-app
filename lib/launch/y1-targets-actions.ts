"use server";

// ============================================================
// Year-1 growth targets — server actions
// ============================================================
//
// Reads/writes the 3 editable Year-1 targets stored as key/value
// rows in `business_settings` (migration 051):
//   - y1_target_centres  (int, default 40)
//   - y1_target_schools  (int, default 10)
//   - y1_target_revenue  (int dollars, default 400000)
//
// Read by `getDashboardMetrics()` for the home /admin metric cards.
// Write is admin-only and emits an `activity_log` row with the prior
// and new values so we can audit ambitious or accidental edits.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_Y1_TARGETS,
  type Y1TargetField,
  type Y1Targets,
} from "@/lib/launch/y1-targets-types";

const KEY_MAP: Record<Y1TargetField, string> = {
  centres: "y1_target_centres",
  schools: "y1_target_schools",
  revenue: "y1_target_revenue",
};

const REVERSE_KEY_MAP: Record<string, Y1TargetField> = {
  y1_target_centres: "centres",
  y1_target_schools: "schools",
  y1_target_revenue: "revenue",
};

// Reasonable upper bounds so an admin doesn't fat-finger
// `40000000` into the centre target.
const LIMITS: Record<Y1TargetField, { min: number; max: number }> = {
  centres: { min: 0, max: 10_000 },
  schools: { min: 0, max: 10_000 },
  revenue: { min: 0, max: 1_000_000_000 },
};

function coerceNumber(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return fallback;
}

/**
 * Read all three Y1 targets in one round-trip. Falls back to defaults
 * for any missing/malformed rows so a partially-applied migration
 * still renders something sensible.
 */
export async function getY1Targets(): Promise<Y1Targets> {
  const admin = createSupabaseAdmin();

  const { data: rows } = await admin
    .from("business_settings")
    .select("key, value")
    .in("key", Object.values(KEY_MAP));

  const targets: Y1Targets = { ...DEFAULT_Y1_TARGETS };

  for (const row of (rows ?? []) as Array<{ key: string; value: unknown }>) {
    const field = REVERSE_KEY_MAP[row.key];
    if (!field) continue;
    targets[field] = coerceNumber(row.value, DEFAULT_Y1_TARGETS[field]);
  }

  return targets;
}

/**
 * Update one or more Y1 targets. Admin-only. Emits a single
 * `y1_target_updated` activity log per field changed so the audit
 * trail captures "Jayden bumped revenue 400000 → 500000".
 */
export async function updateY1Targets(
  values: Partial<Y1Targets>,
): Promise<{ error: string | null }> {
  try {
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

    if (!profile || profile.role !== "admin") {
      return { error: "Only administrators can update Year-1 targets." };
    }

    const fields = Object.keys(values) as Y1TargetField[];
    if (fields.length === 0) return { error: "No targets supplied." };

    for (const field of fields) {
      if (!(field in KEY_MAP)) return { error: `Unknown target: ${field}` };
      const raw = values[field];
      if (raw === undefined || raw === null)
        return { error: `Target ${field} cannot be empty.` };
      const numeric = Number(raw);
      if (!Number.isFinite(numeric))
        return { error: `Target ${field} must be a number.` };
      if (numeric < LIMITS[field].min || numeric > LIMITS[field].max)
        return {
          error: `Target ${field} must be between ${LIMITS[field].min} and ${LIMITS[field].max}.`,
        };
    }

    const admin = createSupabaseAdmin();
    const before = await getY1Targets();

    for (const field of fields) {
      const newValue = Math.round(Number(values[field]));
      const { error } = await admin.from("business_settings").upsert(
        {
          key: KEY_MAP[field],
          value: newValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) return { error: `Failed to save ${field}: ${error.message}` };

      await admin.from("activity_log").insert({
        user_id: user.id,
        action: "y1_target_updated",
        entity_type: "business_settings",
        metadata: {
          field,
          old: before[field],
          new: newValue,
        },
      });
    }

    revalidatePath("/admin");

    return { error: null };
  } catch (err) {
    console.error("[updateY1Targets] failed:", err);
    return { error: (err as Error).message };
  }
}
