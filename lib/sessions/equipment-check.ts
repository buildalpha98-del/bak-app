"use server";

// ============================================================
// Equipment mismatch check — programme needs vs session kit
// ============================================================
//
// A programme declares `equipment_used` (free-text item names); a
// session may carry an equipment kit whose contents live in
// `equipment_items.item_type`. This compares the two so ops sees
// "programme needs X, kit doesn't have it" in the session detail
// sheet BEFORE a coach turns up without gear.
//
// Matching is deliberately forgiving: case-insensitive, trimmed, and
// singular/plural-insensitive on a trailing "s" (cones ≈ cone).
// Free-text taxonomies drift; a fuzzy warning that occasionally stays
// quiet beats one that cries wolf on "Cones" vs "cone".

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface EquipmentCheckResult {
  /** false when the session has no programme or no equipment data to compare. */
  applicable: boolean;
  kitName: string | null;
  missing: string[];
}

function normalise(name: string): string {
  const n = name.trim().toLowerCase();
  return n.endsWith("s") ? n.slice(0, -1) : n;
}

export async function getSessionEquipmentCheck(
  sessionId: string
): Promise<{ data: EquipmentCheckResult; error: string | null }> {
  const notApplicable: EquipmentCheckResult = {
    applicable: false,
    kitName: null,
    missing: [],
  };

  try {
    const supabase = await createSupabaseServerClient();

    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("program_id, equipment_kit_id")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session?.program_id || !session?.equipment_kit_id) {
      return { data: notApplicable, error: null };
    }

    const [{ data: program }, { data: kit }, { data: items }] =
      await Promise.all([
        supabase
          .from("programs")
          .select("equipment_used")
          .eq("id", session.program_id)
          .single(),
        supabase
          .from("equipment_kits")
          .select("name")
          .eq("id", session.equipment_kit_id)
          .single(),
        supabase
          .from("equipment_items")
          .select("item_type")
          .eq("kit_id", session.equipment_kit_id),
      ]);

    const needed = (program?.equipment_used as string[] | null) ?? [];
    if (needed.length === 0) {
      return { data: notApplicable, error: null };
    }

    const kitSet = new Set((items ?? []).map((i) => normalise(i.item_type)));
    const missing = needed.filter((name) => !kitSet.has(normalise(name)));

    return {
      data: {
        applicable: true,
        kitName: kit?.name ?? null,
        missing,
      },
      error: null,
    };
  } catch (err) {
    console.error("getSessionEquipmentCheck error:", err);
    return { data: notApplicable, error: "Failed to check equipment." };
  }
}
