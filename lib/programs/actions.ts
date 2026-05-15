"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Program } from "@/lib/types/database";
import type { ProgramContentJson } from "@/lib/ai/types";

// ============================================================
// Types
// ============================================================

export interface SaveProgramInput {
  sport: string;
  ageGroups: string[];           // multi-age support; replaces singular ageGroup
  durationMinutes: number;
  skillFocus?: string;
  contentJson: ProgramContentJson;
  equipmentUsed: string[];
}

export interface ProgramListItem {
  id: string;
  title: string;
  sport: string;
  age_group: string | null;      // denormalised primary band (first of age_groups)
  age_groups: string[];          // full array from programs.age_groups
  duration_minutes: number;
  skill_focus: string | null;
  created_at: string;
  created_by_name: string | null;
  version_number: number;
  parent_version_id: string | null;
  equipment_used: string[];
}

export interface ProgramDetail extends ProgramListItem {
  content_json: Record<string, unknown>;
  created_by: string;
}

export interface ProgramUsageStats {
  sessionCount: number;
  centresUsed: { id: string; name: string }[];
  lastUsedAt: string | null;
}

export interface ProgramVersionItem {
  id: string;
  version_number: number;
  created_at: string;
  created_by_name: string | null;
  title: string;
}

// ============================================================
// 1. saveProgram
// ============================================================

export async function saveProgram(
  input: SaveProgramInput
): Promise<{ data: Program | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .insert({
        sport: input.sport,
        age_groups: input.ageGroups,
        age_group: input.ageGroups[0] ?? null,  // keep denormalised primary band
        duration_minutes: input.durationMinutes,
        skill_focus: input.skillFocus ?? null,
        content_json: input.contentJson as unknown as Record<string, unknown>,
        equipment_used: input.equipmentUsed,
        created_by: user.id,
        version_number: 1,
        parent_version_id: null,
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "program_created",
      entity_type: "program",
      entity_id: data.id,
      metadata: {
        sport: input.sport,
        age_groups: input.ageGroups,
        age_group: input.ageGroups[0] ?? null,
        ai_generated: true,
      },
    });

    // Auto-file in document hub (best-effort, don't fail the save)
    try {
      const title =
        (input.contentJson as unknown as Record<string, unknown>).title as string ??
        `${input.sport} Programme`;
      await supabase.from("documents").insert({
        title: `Programme: ${title}`,
        category: "program",
        file_url: `/ops/programs/${data.id}`,
        file_name: `${title}.json`,
        tags: [input.sport, ...(input.ageGroups ?? [])].filter(Boolean),
        version: 1,
        parent_document_id: null,
        uploaded_by: user.id,
        visibility: "all",
      });
    } catch {
      // Non-critical — log and continue
      console.warn("Auto-file document for programme failed (non-critical).");
    }

    return { data: data as Program, error: null };
  } catch (err) {
    console.error("saveProgram error:", err);
    return { data: null, error: "Failed to save programme." };
  }
}

// ============================================================
// 2. getPrograms
// ============================================================

export async function getPrograms(
  limit: number = 50
): Promise<{ data: ProgramListItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used, version_number, parent_version_id, created_at, created_by, profiles:created_by(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const mapped: ProgramListItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const content = r.content_json as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        return {
          id: r.id as string,
          title: (content?.title as string) ?? `${r.sport} Programme`,
          sport: r.sport as string,
          age_group: r.age_group as string | null,
          age_groups: (r.age_groups as string[]) ?? [],
          duration_minutes: r.duration_minutes as number,
          skill_focus: r.skill_focus as string | null,
          created_at: r.created_at as string,
          created_by_name: (profile?.name as string) ?? null,
          version_number: r.version_number as number,
          parent_version_id: r.parent_version_id as string | null,
          equipment_used: (r.equipment_used as string[]) ?? [],
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getPrograms error:", err);
    return { data: null, error: "Failed to fetch programmes." };
  }
}

// ============================================================
// 3. getProgramById
// ============================================================

export async function getProgramById(
  id: string
): Promise<{ data: Program | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    return { data: data as Program, error: null };
  } catch (err) {
    console.error("getProgramById error:", err);
    return { data: null, error: "Failed to fetch programme." };
  }
}

// ============================================================
// 4. getRecentProgramsForCentre
// ============================================================

export async function getRecentProgramsForCentre(
  centreId: string,
  sport: string,
  limit: number = 3
): Promise<{
  data: { title: string; sport: string; skillFocus: string | null }[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Fetch sessions at this centre that have a program, join the program
    const { data, error } = await supabase
      .from("sessions")
      .select("program_id, programs:program_id(sport, skill_focus, content_json)")
      .eq("centre_id", centreId)
      .eq("sport", sport)
      .not("program_id", "is", null)
      .order("date", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const seen = new Set<string>();
    const results: { title: string; sport: string; skillFocus: string | null }[] = [];

    for (const row of data ?? []) {
      const program = row.programs as unknown as Record<string, unknown> | null;
      if (!program) continue;

      const programId = row.program_id as string;
      if (seen.has(programId)) continue;
      seen.add(programId);

      const content = program.content_json as Record<string, unknown> | null;
      results.push({
        title: (content?.title as string) ?? `${program.sport} Programme`,
        sport: program.sport as string,
        skillFocus: (program.skill_focus as string) ?? null,
      });
    }

    return { data: results, error: null };
  } catch (err) {
    console.error("getRecentProgramsForCentre error:", err);
    return { data: null, error: "Failed to fetch recent programmes." };
  }
}

// ============================================================
// 5. getCentreEquipment
// ============================================================

export async function getCentreEquipment(
  centreId: string
): Promise<{ data: string[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Get kits located at this centre
    const { data: kits, error: kitsErr } = await supabase
      .from("equipment_kits")
      .select("id")
      .eq("location_type", "centre")
      .eq("location_id", centreId);

    if (kitsErr) throw kitsErr;
    if (!kits || kits.length === 0) return { data: [], error: null };

    const kitIds = kits.map((k) => k.id);

    // Get items in those kits
    const { data: items, error: itemsErr } = await supabase
      .from("equipment_items")
      .select("item_type")
      .in("kit_id", kitIds)
      .gt("quantity", 0);

    if (itemsErr) throw itemsErr;

    // Deduplicate item types
    const types = [...new Set((items ?? []).map((i) => i.item_type))];
    return { data: types, error: null };
  } catch (err) {
    console.error("getCentreEquipment error:", err);
    return { data: null, error: "Failed to fetch centre equipment." };
  }
}

// ============================================================
// 6. getProgramDetail (full detail for detail page)
// ============================================================

export async function getProgramDetail(
  id: string
): Promise<{ data: ProgramDetail | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("*, profiles:created_by(name)")
      .eq("id", id)
      .single();

    if (error) throw error;

    const content = data.content_json as unknown as Record<string, unknown> | null;
    const profile = data.profiles as unknown as Record<string, unknown> | null;

    const detail: ProgramDetail = {
      id: data.id,
      title: (content?.title as string) ?? `${data.sport} Programme`,
      sport: data.sport,
      age_group: data.age_group,
      age_groups: (data.age_groups as string[]) ?? [],
      duration_minutes: data.duration_minutes,
      skill_focus: data.skill_focus,
      created_at: data.created_at,
      created_by: data.created_by,
      created_by_name: (profile?.name as string) ?? null,
      version_number: data.version_number,
      parent_version_id: data.parent_version_id,
      equipment_used: data.equipment_used ?? [],
      content_json: data.content_json as unknown as Record<string, unknown>,
    };

    return { data: detail, error: null };
  } catch (err) {
    console.error("getProgramDetail error:", err);
    return { data: null, error: "Failed to fetch programme details." };
  }
}

// ============================================================
// 7. deleteProgram
// ============================================================

export async function deleteProgram(
  id: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    // Check if programme is assigned to any sessions
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", id);

    if (count && count > 0) {
      return {
        error: `Cannot delete: programme is assigned to ${count} session${count > 1 ? "s" : ""}. Unassign first.`,
      };
    }

    const { error } = await supabase.from("programs").delete().eq("id", id);

    if (error) throw error;

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "program_deleted",
      entity_type: "program",
      entity_id: id,
    });

    return { error: null };
  } catch (err) {
    console.error("deleteProgram error:", err);
    return { error: "Failed to delete programme." };
  }
}

// ============================================================
// 8. createNewVersion
// ============================================================

export async function createNewVersion(
  parentProgramId: string,
  input: SaveProgramInput
): Promise<{ data: Program | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Get the root parent and current max version
    const { data: parent, error: parentErr } = await supabase
      .from("programs")
      .select("parent_version_id, version_number")
      .eq("id", parentProgramId)
      .single();

    if (parentErr) throw parentErr;

    const rootId = parent.parent_version_id ?? parentProgramId;

    // Get max version in the chain
    const { data: versions } = await supabase
      .from("programs")
      .select("version_number")
      .or(`id.eq.${rootId},parent_version_id.eq.${rootId}`)
      .order("version_number", { ascending: false })
      .limit(1);

    const maxVersion = versions?.[0]?.version_number ?? parent.version_number;

    const { data, error } = await supabase
      .from("programs")
      .insert({
        sport: input.sport,
        age_groups: input.ageGroups,
        age_group: input.ageGroups[0] ?? null,  // keep denormalised primary band
        duration_minutes: input.durationMinutes,
        skill_focus: input.skillFocus ?? null,
        content_json: input.contentJson as unknown as Record<string, unknown>,
        equipment_used: input.equipmentUsed,
        created_by: user.id,
        version_number: maxVersion + 1,
        parent_version_id: rootId,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "program_version_created",
      entity_type: "program",
      entity_id: data.id,
      metadata: {
        parent_program_id: rootId,
        version_number: maxVersion + 1,
      },
    });

    return { data: data as Program, error: null };
  } catch (err) {
    console.error("createNewVersion error:", err);
    return { data: null, error: "Failed to create new version." };
  }
}

// ============================================================
// 9. getProgramVersionHistory
// ============================================================

export async function getProgramVersionHistory(
  programId: string
): Promise<{ data: ProgramVersionItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // First get the program to find root
    const { data: program, error: progErr } = await supabase
      .from("programs")
      .select("id, parent_version_id")
      .eq("id", programId)
      .single();

    if (progErr) throw progErr;

    const rootId = program.parent_version_id ?? program.id;

    // Fetch all versions in the chain
    const { data, error } = await supabase
      .from("programs")
      .select("id, version_number, content_json, created_at, created_by, profiles:created_by(name)")
      .or(`id.eq.${rootId},parent_version_id.eq.${rootId}`)
      .order("version_number", { ascending: true });

    if (error) throw error;

    const versions: ProgramVersionItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const content = r.content_json as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        return {
          id: r.id as string,
          version_number: r.version_number as number,
          created_at: r.created_at as string,
          created_by_name: (profile?.name as string) ?? null,
          title: (content?.title as string) ?? "Programme",
        };
      }
    );

    return { data: versions, error: null };
  } catch (err) {
    console.error("getProgramVersionHistory error:", err);
    return { data: null, error: "Failed to fetch version history." };
  }
}

// ============================================================
// 10. getProgramUsageStats
// ============================================================

export async function getProgramUsageStats(
  programId: string
): Promise<{ data: ProgramUsageStats | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    // Count sessions using this program
    const { count } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("program_id", programId);

    // Get distinct centres and most recent usage
    const { data: sessions } = await supabase
      .from("sessions")
      .select("date, centre_id, centres:centre_id(id, name)")
      .eq("program_id", programId)
      .order("date", { ascending: false })
      .limit(50);

    const centreMap = new Map<string, { id: string; name: string }>();
    let lastUsedAt: string | null = null;

    for (const s of sessions ?? []) {
      if (!lastUsedAt) lastUsedAt = s.date;
      const centre = s.centres as unknown as { id: string; name: string } | null;
      if (centre && !centreMap.has(centre.id)) {
        centreMap.set(centre.id, centre);
      }
    }

    return {
      data: {
        sessionCount: count ?? 0,
        centresUsed: Array.from(centreMap.values()),
        lastUsedAt,
      },
      error: null,
    };
  } catch (err) {
    console.error("getProgramUsageStats error:", err);
    return { data: null, error: "Failed to fetch usage stats." };
  }
}

// ============================================================
// 11. getProgramsForSport (for session assignment dropdown)
// ============================================================

export async function getProgramsForSport(
  sport: string
): Promise<{ data: ProgramListItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used, version_number, parent_version_id, created_at, created_by, profiles:created_by(name)")
      .eq("sport", sport)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const mapped: ProgramListItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const content = r.content_json as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        return {
          id: r.id as string,
          title: (content?.title as string) ?? `${r.sport} Programme`,
          sport: r.sport as string,
          age_group: r.age_group as string | null,
          age_groups: (r.age_groups as string[]) ?? [],
          duration_minutes: r.duration_minutes as number,
          skill_focus: r.skill_focus as string | null,
          created_at: r.created_at as string,
          created_by_name: (profile?.name as string) ?? null,
          version_number: r.version_number as number,
          parent_version_id: r.parent_version_id as string | null,
          equipment_used: (r.equipment_used as string[]) ?? [],
        };
      }
    );

    return { data: mapped, error: null };
  } catch (err) {
    console.error("getProgramsForSport error:", err);
    return { data: null, error: "Failed to fetch programmes." };
  }
}

// ============================================================
// 12. assignProgramToSession
// ============================================================

export async function assignProgramToSession(
  sessionId: string,
  programId: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const { error } = await supabase
      .from("sessions")
      .update({ program_id: programId })
      .eq("id", sessionId);

    if (error) throw error;

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: programId ? "program_assigned" : "program_unassigned",
      entity_type: "session",
      entity_id: sessionId,
      metadata: { program_id: programId },
    });

    return { error: null };
  } catch (err) {
    console.error("assignProgramToSession error:", err);
    return { error: "Failed to assign programme." };
  }
}

// ============================================================
// 13. getCentreListSimple
// ============================================================

export async function getCentreListSimple(): Promise<{
  data: { id: string; name: string }[] | null;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("centres")
      .select("id, name")
      .in("contract_status", ["active", "trial"])
      .order("name");

    if (error) throw error;

    return { data: data ?? [], error: null };
  } catch (err) {
    console.error("getCentreListSimple error:", err);
    return { data: null, error: "Failed to fetch centres." };
  }
}
