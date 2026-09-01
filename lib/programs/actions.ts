"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  programBands,
  bandsForYearGroups,
  bandMatchScore,
} from "@/lib/programs/band-match";
import { yearGroupToAgeBand } from "@/lib/schools/year-groups";
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
  /** Multi-week series linkage (migration 069). All three or none. */
  seriesId?: string;
  seriesWeek?: number;
  seriesLength?: number;
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
  /** Operator-curated labels (migration 066). */
  tags: string[];
  /** Multi-week series linkage (migration 069). */
  series_id: string | null;
  series_week: number | null;
  series_length: number | null;
  /** Number of `sessions` rows with `program_id = id`. 0 means unused. */
  session_count: number;
  /** Most-recent `sessions.date` for this programme, or null if never used. */
  last_used_at: string | null;
  /** True iff `content_json.skillDevelopment` is a non-empty array. */
  has_skills: boolean;
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
        series_id: input.seriesId ?? null,
        series_week: input.seriesWeek ?? null,
        series_length: input.seriesLength ?? null,
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

    revalidatePath("/admin/programs");
    revalidatePath("/ops/programs");

    return { data, error: null };
  } catch (err) {
    console.error("saveProgram error:", err);
    return { data: null, error: "Failed to save programme." };
  }
}

// ============================================================
// 2. getPrograms
// ============================================================

export async function getPrograms(
  limit: number = 200
): Promise<{ data: ProgramListItem[] | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used, version_number, parent_version_id, tags, series_id, series_week, series_length, created_at, created_by, profiles:created_by(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const programmeIds = (data ?? []).map(
      (r: Record<string, unknown>) => r.id as string,
    );

    // One bulk read for session usage so the library can render
    // "last used" + "unused" badges without N round-trips. Defensive
    // shape — empty array if the IN is empty.
    let sessionUsageByProgram = new Map<
      string,
      { count: number; lastUsedAt: string | null }
    >();
    if (programmeIds.length > 0) {
      const { data: sessionRows } = await supabase
        .from("sessions")
        .select("program_id, date")
        .in("program_id", programmeIds);
      for (const row of sessionRows ?? []) {
        const r = row as { program_id: string; date: string };
        const prev = sessionUsageByProgram.get(r.program_id);
        if (!prev) {
          sessionUsageByProgram.set(r.program_id, {
            count: 1,
            lastUsedAt: r.date,
          });
        } else {
          prev.count += 1;
          if (!prev.lastUsedAt || r.date > prev.lastUsedAt) {
            prev.lastUsedAt = r.date;
          }
        }
      }
    }

    const mapped: ProgramListItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const content = r.content_json as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        const skills = (content?.skillDevelopment as unknown[]) ?? null;
        const usage = sessionUsageByProgram.get(r.id as string) ?? {
          count: 0,
          lastUsedAt: null,
        };
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
          tags: (r.tags as string[]) ?? [],
          series_id: (r.series_id as string | null) ?? null,
          series_week: (r.series_week as number | null) ?? null,
          series_length: (r.series_length as number | null) ?? null,
          equipment_used: (r.equipment_used as string[]) ?? [],
          session_count: usage.count,
          last_used_at: usage.lastUsedAt,
          has_skills: Array.isArray(skills) && skills.length > 0,
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

    return { data, error: null };
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
    const skills = (content?.skillDevelopment as unknown[]) ?? null;

    // Pull usage stats once to populate the new ProgramListItem
    // fields (the detail extends list). Best-effort — fall back to
    // zero / null if it errors so the detail page still renders.
    const { data: sessionRows } = await supabase
      .from("sessions")
      .select("date")
      .eq("program_id", id);
    let sessionCount = 0;
    let lastUsedAt: string | null = null;
    for (const row of sessionRows ?? []) {
      const r = row as { date: string };
      sessionCount += 1;
      if (!lastUsedAt || r.date > lastUsedAt) lastUsedAt = r.date;
    }

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
      tags: (data.tags as string[]) ?? [],
      series_id: (data.series_id as string | null) ?? null,
      series_week: (data.series_week as number | null) ?? null,
      series_length: (data.series_length as number | null) ?? null,
      content_json: data.content_json as unknown as Record<string, unknown>,
      session_count: sessionCount,
      last_used_at: lastUsedAt,
      has_skills: Array.isArray(skills) && skills.length > 0,
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

    revalidatePath("/admin/programs");
    revalidatePath("/ops/programs");
    revalidatePath(`/admin/programs/${rootId}`);
    revalidatePath(`/ops/programs/${rootId}`);

    return { data, error: null };
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
      .select("id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used, version_number, parent_version_id, tags, series_id, series_week, series_length, created_at, created_by, profiles:created_by(name)")
      .eq("sport", sport)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const mapped: ProgramListItem[] = (data ?? []).map(
      (r: Record<string, unknown>) => {
        const content = r.content_json as unknown as Record<string, unknown> | null;
        const profile = r.profiles as unknown as Record<string, unknown> | null;
        const skills = (content?.skillDevelopment as unknown[]) ?? null;
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
          tags: (r.tags as string[]) ?? [],
          series_id: (r.series_id as string | null) ?? null,
          series_week: (r.series_week as number | null) ?? null,
          series_length: (r.series_length as number | null) ?? null,
          equipment_used: (r.equipment_used as string[]) ?? [],
          // Session-assignment dropdown doesn't need usage stats —
          // keep them at zero/null. The library list is the only
          // consumer that paginates them in.
          session_count: 0,
          last_used_at: null,
          has_skills: Array.isArray(skills) && skills.length > 0,
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

    // Authorize explicitly: admin/ops, or a coach assigned to THIS
    // session. Coaches have no sessions UPDATE policy, so the old
    // cookie-client update was silently blocked by RLS — PostgREST
    // reports a blocked update as success with zero rows, the dialog
    // closed as if saved, and the programme never appeared.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    let authorised = profile?.role === "admin" || profile?.role === "ops";
    if (!authorised) {
      const { data: assignment } = await supabase
        .from("session_coaches")
        .select("user_id")
        .eq("session_id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      authorised = !!assignment;
    }
    if (!authorised) {
      return { error: "You can only set the programme on your own sessions." };
    }

    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdmin();
    const { data: updated, error } = await admin
      .from("sessions")
      .update({ program_id: programId })
      .eq("id", sessionId)
      .select("id");

    if (error) throw error;
    if (!updated || updated.length === 0) {
      return { error: "Session not found." };
    }

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: programId ? "program_assigned" : "program_unassigned",
      entity_type: "session",
      entity_id: sessionId,
      metadata: { program_id: programId },
    });

    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");
    revalidatePath("/coach/schedule");

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

// ============================================================
// 14. Auth gate — admin/ops only for bulk + destructive operations
// ============================================================

async function requireAdminOrOps(): Promise<
  | { ok: true; userId: string; role: "admin" | "ops" }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ops")) {
    return { ok: false, error: "Not authorised." };
  }

  return { ok: true, userId: user.id, role: profile.role };
}

// ============================================================
// 15. bulkDuplicateProgrammes
// ============================================================
//
// Copies each selected programme into a brand-new row. Sport / age
// groups / content / equipment carry over; `created_by` is reset to
// the current admin/ops user and version_number is 1 (a fresh family
// — not a v2 of the source).

export async function bulkDuplicateProgrammes(
  programmeIds: string[],
): Promise<{
  duplicated: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!programmeIds.length) {
    return {
      duplicated: 0,
      errors: [],
      error: "No programmes selected.",
    };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { duplicated: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error: fetchError } = await supabase
    .from("programs")
    .select(
      "id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used",
    )
    .in("id", programmeIds);
  if (fetchError) {
    return { duplicated: 0, errors: [], error: fetchError.message };
  }

  const fetchedIds = new Set((rows ?? []).map((r) => r.id));
  const errors: { id: string; error: string }[] = programmeIds
    .filter((id) => !fetchedIds.has(id))
    .map((id) => ({ id, error: "Programme not found." }));
  let duplicated = 0;

  for (const row of rows ?? []) {
    const r = row as {
      id: string;
      sport: string;
      age_group: string | null;
      age_groups: string[] | null;
      duration_minutes: number;
      skill_focus: string | null;
      content_json: Record<string, unknown> | null;
      equipment_used: string[] | null;
    };
    const sourceContent = (r.content_json ?? {}) as Record<string, unknown>;
    const dupTitle =
      typeof sourceContent.title === "string"
        ? `${sourceContent.title} (copy)`
        : `${r.sport} Programme (copy)`;
    const { error } = await supabase.from("programs").insert({
      sport: r.sport,
      age_group: r.age_group,
      age_groups: r.age_groups ?? [],
      duration_minutes: r.duration_minutes,
      skill_focus: r.skill_focus,
      content_json: { ...sourceContent, title: dupTitle },
      equipment_used: r.equipment_used ?? [],
      created_by: gate.userId,
      version_number: 1,
      parent_version_id: null,
    });
    if (error) {
      errors.push({ id: r.id, error: error.message });
    } else {
      duplicated += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "programme_bulk_duplicated",
        entity_type: "program",
        entity_id: r.id,
      });
    }
  }

  revalidatePath("/admin/programs");
  revalidatePath("/ops/programs");

  return {
    duplicated,
    errors,
    error:
      errors.length && duplicated === 0
        ? "Failed to duplicate programmes."
        : errors.length
          ? "Some programmes failed to duplicate."
          : null,
  };
}

// ============================================================
// 16. bulkDeleteProgrammes
// ============================================================
//
// Mirrors the single-row `deleteProgram` — any programme that's still
// assigned to a session is skipped (with a per-id error message) so
// we never orphan a `sessions.program_id`. Ops-safe.

export async function bulkDeleteProgrammes(
  programmeIds: string[],
): Promise<{
  deleted: number;
  errors: { id: string; error: string }[];
  error: string | null;
}> {
  if (!programmeIds.length) {
    return { deleted: 0, errors: [], error: "No programmes selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { deleted: 0, errors: [], error: gate.error };
  }

  const supabase = await createSupabaseServerClient();

  // One bulk read for session counts so we don't make N round-trips.
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("program_id")
    .in("program_id", programmeIds);
  const sessionsByProgram = new Map<string, number>();
  for (const row of sessionRows ?? []) {
    const r = row as { program_id: string };
    sessionsByProgram.set(
      r.program_id,
      (sessionsByProgram.get(r.program_id) ?? 0) + 1,
    );
  }

  const errors: { id: string; error: string }[] = [];
  let deleted = 0;

  for (const id of programmeIds) {
    const count = sessionsByProgram.get(id) ?? 0;
    if (count > 0) {
      errors.push({
        id,
        error: `Assigned to ${count} session${count === 1 ? "" : "s"} — unassign first.`,
      });
      continue;
    }
    const { error } = await supabase.from("programs").delete().eq("id", id);
    if (error) {
      errors.push({ id, error: error.message });
    } else {
      deleted += 1;
      await supabase.from("activity_log").insert({
        user_id: gate.userId,
        action: "programme_bulk_deleted",
        entity_type: "program",
        entity_id: id,
      });
    }
  }

  revalidatePath("/admin/programs");
  revalidatePath("/ops/programs");

  return {
    deleted,
    errors,
    error:
      errors.length && deleted === 0
        ? "Failed to delete programmes."
        : errors.length
          ? "Some programmes couldn't be deleted."
          : null,
  };
}

// ============================================================
// 17. exportProgrammesCsv
// ============================================================
//
// Returns a CSV string of the selected programmes for accountants /
// curriculum review. We keep columns minimal — sport, age bands,
// duration, skill focus, equipment, session count, last used, who
// created it, when. The library client downloads as a Blob.

export async function exportProgrammesCsv(
  programmeIds: string[],
): Promise<{ csv: string | null; error: string | null }> {
  if (!programmeIds.length) {
    return { csv: null, error: "No programmes selected." };
  }
  const gate = await requireAdminOrOps();
  if (!gate.ok) {
    return { csv: null, error: gate.error };
  }

  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("programs")
    .select(
      "id, sport, age_group, age_groups, duration_minutes, skill_focus, content_json, equipment_used, created_at, profiles:created_by(name)",
    )
    .in("id", programmeIds);
  if (error) return { csv: null, error: error.message };

  // One bulk read for session usage.
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("program_id, date")
    .in("program_id", programmeIds);
  const usage = new Map<string, { count: number; lastUsedAt: string | null }>();
  for (const sr of sessionRows ?? []) {
    const r = sr as { program_id: string; date: string };
    const prev = usage.get(r.program_id);
    if (!prev) usage.set(r.program_id, { count: 1, lastUsedAt: r.date });
    else {
      prev.count += 1;
      if (!prev.lastUsedAt || r.date > prev.lastUsedAt) prev.lastUsedAt = r.date;
    }
  }

  const header = [
    "Title",
    "Sport",
    "Age bands",
    "Duration (min)",
    "Skill focus",
    "Equipment",
    "Sessions",
    "Last used",
    "Created by",
    "Created",
  ];

  function escape(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const lines: string[] = [header.map(escape).join(",")];
  for (const row of rows ?? []) {
    const r = row as unknown as {
      id: string;
      sport: string;
      age_group: string | null;
      age_groups: string[] | null;
      duration_minutes: number;
      skill_focus: string | null;
      content_json: Record<string, unknown> | null;
      equipment_used: string[] | null;
      created_at: string;
      profiles: { name: string | null } | null;
    };
    const content = r.content_json ?? {};
    const title =
      typeof content.title === "string" ? content.title : `${r.sport} Programme`;
    const ageBands =
      r.age_groups && r.age_groups.length > 0
        ? r.age_groups.join("; ")
        : (r.age_group ?? "");
    const u = usage.get(r.id) ?? { count: 0, lastUsedAt: null };
    lines.push(
      [
        title,
        r.sport,
        ageBands,
        String(r.duration_minutes),
        r.skill_focus ?? "",
        (r.equipment_used ?? []).join("; "),
        String(u.count),
        u.lastUsedAt ?? "",
        r.profiles?.name ?? "",
        r.created_at.slice(0, 10),
      ]
        .map(escape)
        .join(","),
    );
  }

  await supabase.from("activity_log").insert({
    user_id: gate.userId,
    action: "programme_bulk_exported",
    entity_type: "program",
    entity_id: null,
    metadata: { count: programmeIds.length },
  });

  return { csv: lines.join("\n"), error: null };
}

// ============================================================
// 18. checkProgrammeDuplicate
// ============================================================
//
// Lookup an existing programme matching sport + any overlap on age
// groups. The generator surfaces this inline so an admin can choose
// to open the existing one rather than seed a near-duplicate.

export interface ProgrammeDuplicateMatch {
  id: string;
  title: string;
  age_groups: string[];
  duration_minutes: number;
  created_at: string;
}

export async function checkProgrammeDuplicate(
  sport: string,
  ageGroups: string[],
): Promise<{
  matches: ProgrammeDuplicateMatch[];
  error: string | null;
}> {
  if (!sport || ageGroups.length === 0) {
    return { matches: [], error: null };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { matches: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("id, sport, age_group, age_groups, duration_minutes, content_json, created_at")
      .eq("sport", sport)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const matches: ProgrammeDuplicateMatch[] = [];
    for (const row of data ?? []) {
      const r = row as {
        id: string;
        sport: string;
        age_group: string | null;
        age_groups: string[] | null;
        duration_minutes: number;
        content_json: Record<string, unknown> | null;
        created_at: string;
      };
      const rowBands =
        r.age_groups && r.age_groups.length > 0
          ? r.age_groups
          : r.age_group
            ? [r.age_group]
            : [];
      // Match if there's any age-band overlap. "Exact" match would
      // miss the case where someone's adding a 3-5 band to an
      // existing 5-8 programme — that's still worth flagging.
      const overlaps = rowBands.some((b) => ageGroups.includes(b));
      if (!overlaps) continue;
      const title =
        typeof r.content_json?.title === "string"
          ? r.content_json.title
          : `${r.sport} Programme`;
      matches.push({
        id: r.id,
        title,
        age_groups: rowBands,
        duration_minutes: r.duration_minutes,
        created_at: r.created_at,
      });
    }

    return { matches, error: null };
  } catch (err) {
    console.error("checkProgrammeDuplicate error:", err);
    return { matches: [], error: "Failed to check for duplicates." };
  }
}

// ============================================================
// 19. getLinkedCentresForProgramme
// ============================================================
//
// Detail-page Linked centres tab feed — distinct centres that have
// scheduled this programme, with the count per centre and the most
// recent session date. Falls back to an empty array on RLS errors.

export interface LinkedCentreSummary {
  id: string;
  name: string;
  session_count: number;
  last_session_at: string | null;
}

export async function getLinkedCentresForProgramme(
  programmeId: string,
): Promise<{ data: LinkedCentreSummary[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("sessions")
      .select("centre_id, date, centres:centre_id(id, name)")
      .eq("program_id", programmeId)
      .order("date", { ascending: false });
    if (error) throw error;

    const map = new Map<string, LinkedCentreSummary>();
    for (const row of data ?? []) {
      const r = row as unknown as {
        centre_id: string | null;
        date: string;
        centres: { id: string; name: string } | null;
      };
      if (!r.centres) continue;
      const existing = map.get(r.centres.id);
      if (!existing) {
        map.set(r.centres.id, {
          id: r.centres.id,
          name: r.centres.name,
          session_count: 1,
          last_session_at: r.date,
        });
      } else {
        existing.session_count += 1;
        if (!existing.last_session_at || r.date > existing.last_session_at) {
          existing.last_session_at = r.date;
        }
      }
    }

    return {
      data: Array.from(map.values()).sort(
        (a, b) => b.session_count - a.session_count,
      ),
      error: null,
    };
  } catch (err) {
    console.error("getLinkedCentresForProgramme error:", err);
    return { data: [], error: "Failed to fetch linked centres." };
  }
}

// ============================================================
// getSeriesWeeks — sibling weeks of a multi-week series
// ============================================================

export async function getSeriesWeeks(seriesId: string): Promise<{
  data: Array<{ id: string; series_week: number; title: string }>;
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("programs")
      .select("id, series_week, content_json")
      .eq("series_id", seriesId)
      .order("series_week");
    return {
      data: (data ?? []).map((r) => ({
        id: r.id as string,
        series_week: r.series_week as number,
        title:
          ((r.content_json as Record<string, unknown>)?.title as string) ??
          `Week ${r.series_week}`,
      })),
      error: null,
    };
  } catch (err) {
    console.error("getSeriesWeeks error:", err);
    return { data: [], error: "Failed to load series weeks." };
  }
}

// ============================================================
// applySeriesToSessions — walk a multi-week series across the roster
// ============================================================

export interface ApplySeriesResult {
  weeks: Array<{
    week: number;
    weekOf: string;
    updated: number;
    matched: number;
  }>;
  totalUpdated: number;
}

/**
 * Week 1 of the series lands on the week containing `startWeekOf`
 * (snapped to Monday), week 2 the following week, and so on. Each
 * week reuses applyProgramToSessions, so the same safety rules hold:
 * sport must match, programme-less sessions only unless overwrite,
 * cancelled/completed untouched.
 */
export async function applySeriesToSessions(input: {
  seriesId: string;
  startWeekOf: string;
  centreId?: string;
  overwrite?: boolean;
  schoolClassIds?: string[];
}): Promise<{ data: ApplySeriesResult | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: weeks } = await supabase
      .from("programs")
      .select("id, series_week")
      .eq("series_id", input.seriesId)
      .order("series_week");
    if (!weeks || weeks.length === 0) {
      return { data: null, error: "Series not found." };
    }

    const { mondayOfIso } = await import("@/lib/utils/roster");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startWeekOf)) {
      return { data: null, error: "Invalid start date." };
    }
    const startMonday = mondayOfIso(input.startWeekOf);

    const result: ApplySeriesResult = { weeks: [], totalUpdated: 0 };
    for (const w of weeks) {
      const offsetDays = ((w.series_week as number) - 1) * 7;
      const weekOf = new Date(
        Date.UTC(
          Number(startMonday.slice(0, 4)),
          Number(startMonday.slice(5, 7)) - 1,
          Number(startMonday.slice(8, 10)) + offsetDays
        )
      )
        .toISOString()
        .split("T")[0];

      const { data: applied, error } = await applyProgramToSessions({
        programId: w.id as string,
        weekOf,
        centreId: input.centreId,
        overwrite: input.overwrite,
        schoolClassIds: input.schoolClassIds,
      });
      if (error) {
        return { data: result, error: `Week ${w.series_week}: ${error}` };
      }
      result.weeks.push({
        week: w.series_week as number,
        weekOf,
        updated: applied?.updated ?? 0,
        matched: applied?.matched ?? 0,
      });
      result.totalUpdated += applied?.updated ?? 0;
    }

    return { data: result, error: null };
  } catch (err) {
    console.error("applySeriesToSessions error:", err);
    return { data: null, error: "Failed to apply the series." };
  }
}

// ============================================================
// updateProgramTags — operator-curated labels
// ============================================================

export async function updateProgramTags(
  programId: string,
  tags: string[]
): Promise<{ error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated." };

    const clean = Array.from(
      new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))
    ).slice(0, 12);

    const { error } = await supabase
      .from("programs")
      .update({ tags: clean })
      .eq("id", programId);
    if (error) return { error: "Failed to save tags." };

    revalidatePath("/admin/programs");
    revalidatePath("/ops/programs");
    return { error: null };
  } catch (err) {
    console.error("updateProgramTags error:", err);
    return { error: "Failed to save tags." };
  }
}

// ============================================================
// getRecommendedPrograms — usage-ranked suggestions for a session
// ============================================================

export interface RecommendedProgram {
  id: string;
  title: string;
  version_number: number;
  tags: string[];
  /** Times any version ran at this session's centre. */
  usedAtCentre: number;
  /** Times used across all centres. */
  usedTotal: number;
}

export async function getRecommendedPrograms(
  sessionId: string
): Promise<{ data: RecommendedProgram[]; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();

    const { data: session } = await supabase
      .from("sessions")
      .select("id, sport, centre_id, school_class_ids")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return { data: [], error: "Session not found." };

    // Band awareness (Seam C): a session targeting classes knows its
    // age bands, and band-matched programmes outrank raw usage counts.
    const targetClassIds =
      ((session as Record<string, unknown>).school_class_ids as string[] | null) ?? [];
    let sessionBands: string[] = [];
    if (targetClassIds.length > 0) {
      const { data: targetClasses } = await supabase
        .from("school_classes")
        .select("year_group")
        .in("id", targetClassIds);
      sessionBands = bandsForYearGroups(
        (targetClasses ?? []).map((c) => c.year_group)
      );
    }

    const [{ data: programs }, { data: centreUsage }, { data: globalUsage }] =
      await Promise.all([
        supabase
          .from("programs")
          .select(
            "id, sport, content_json, version_number, tags, created_at, age_group, age_groups"
          )
          .eq("sport", session.sport),
        supabase
          .from("sessions")
          .select("program_id")
          .eq("centre_id", session.centre_id)
          .not("program_id", "is", null),
        supabase
          .from("sessions")
          .select("program_id")
          .eq("sport", session.sport)
          .not("program_id", "is", null),
      ]);
    if (!programs || programs.length === 0) return { data: [], error: null };

    const centreCounts = new Map<string, number>();
    for (const row of centreUsage ?? []) {
      centreCounts.set(
        row.program_id!,
        (centreCounts.get(row.program_id!) ?? 0) + 1
      );
    }
    const globalCounts = new Map<string, number>();
    for (const row of globalUsage ?? []) {
      globalCounts.set(
        row.program_id!,
        (globalCounts.get(row.program_id!) ?? 0) + 1
      );
    }

    const ranked = programs
      .map((p) => ({
        id: p.id as string,
        title:
          ((p.content_json as Record<string, unknown>)?.title as string) ??
          `${p.sport} programme`,
        version_number: p.version_number as number,
        tags: (p.tags as string[]) ?? [],
        usedAtCentre: centreCounts.get(p.id as string) ?? 0,
        usedTotal: globalCounts.get(p.id as string) ?? 0,
        bandMatch: bandMatchScore(
          programBands(p as { age_group?: string | null; age_groups?: unknown }),
          sessionBands
        ),
        created_at: p.created_at as string,
      }))
      .sort(
        (a, b) =>
          b.bandMatch - a.bandMatch ||
          b.usedAtCentre - a.usedAtCentre ||
          b.usedTotal - a.usedTotal ||
          b.created_at.localeCompare(a.created_at)
      )
      .slice(0, 3)
      .map(({ created_at: _createdAt, bandMatch: _bandMatch, ...rest }) => rest);

    return { data: ranked, error: null };
  } catch (err) {
    console.error("getRecommendedPrograms error:", err);
    return { data: [], error: "Failed to load suggestions." };
  }
}

// ============================================================
// generateProgramPdf — printable session plan
// ============================================================

export async function generateProgramPdf(
  programId: string
): Promise<{ data: { base64: string; filename: string } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: program } = await supabase
      .from("programs")
      .select("*")
      .eq("id", programId)
      .maybeSingle();
    if (!program) return { data: null, error: "Programme not found." };

    // Content may be stored camelCase (current generator) or snake_case
    // (early rows) — normalise the section keys the same way the
    // ProgramView component does.
    const raw = program.content_json as Record<string, unknown>;
    const content = {
      ...(raw as unknown as ProgramContentJson),
      warmUp: (raw.warmUp ?? raw.warm_up) as ProgramContentJson["warmUp"],
      skillDevelopment: (raw.skillDevelopment ??
        raw.skill_development ??
        []) as ProgramContentJson["skillDevelopment"],
      modifiedGame: (raw.modifiedGame ??
        raw.modified_game) as ProgramContentJson["modifiedGame"],
      coolDown: (raw.coolDown ?? raw.cool_down) as ProgramContentJson["coolDown"],
      title: (raw.title as string) ?? `${program.sport} programme`,
      sport: (raw.sport as string) ?? program.sport,
      duration: (raw.duration as number) ?? program.duration_minutes,
      objectives: (raw.objectives as string[]) ?? [],
      equipmentNeeded:
        (raw.equipmentNeeded as string[]) ??
        (raw.equipment_needed as string[]) ??
        program.equipment_used ??
        [],
    } as ProgramContentJson;

    const generatedOn = new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Australia/Sydney",
    }).format(new Date());

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const { ProgramPdf } = await import("./pdf-template");
    const React = (await import("react")).default;
    const element = React.createElement(ProgramPdf, {
      content,
      ageGroups: (program.age_groups as string[]) ?? [],
      generatedOn,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);

    const safeName = content.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    return {
      data: {
        base64: buffer.toString("base64"),
        filename: `${safeName || "session-plan"}.pdf`,
      },
      error: null,
    };
  } catch (err) {
    console.error("generateProgramPdf error:", err);
    return { data: null, error: "Failed to generate the PDF." };
  }
}

// ============================================================
// applyProgramToSessions — attach a programme to roster shifts
// ============================================================

export interface ApplyProgramInput {
  programId: string;
  /** Any date in the target week ("YYYY-MM-DD"); snapped to Monday. */
  weekOf: string;
  centreId?: string;
  /** When false (default) only sessions without a programme are touched. */
  overwrite?: boolean;
  /** Only touch sessions targeting at least one of these classes
   *  (Seam C — a Year 3 series lands on Year 3 sessions only). */
  schoolClassIds?: string[];
}

export async function applyProgramToSessions(
  input: ApplyProgramInput
): Promise<{ data: { updated: number; matched: number } | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    const { data: program } = await supabase
      .from("programs")
      .select("id, sport")
      .eq("id", input.programId)
      .maybeSingle();
    if (!program) return { data: null, error: "Programme not found." };

    const { mondayOfIso } = await import("@/lib/utils/roster");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekOf)) {
      return { data: null, error: "Invalid week date." };
    }
    const monday = mondayOfIso(input.weekOf);
    const friday = new Date(
      Date.UTC(
        Number(monday.slice(0, 4)),
        Number(monday.slice(5, 7)) - 1,
        Number(monday.slice(8, 10)) + 4
      )
    )
      .toISOString()
      .split("T")[0];

    let matchQuery = supabase
      .from("sessions")
      .select("id, program_id")
      .eq("sport", program.sport)
      .gte("date", monday)
      .lte("date", friday)
      .not("status", "in", "(cancelled,completed)");
    if (input.centreId) matchQuery = matchQuery.eq("centre_id", input.centreId);
    if (input.schoolClassIds && input.schoolClassIds.length > 0) {
      matchQuery = matchQuery.overlaps("school_class_ids", input.schoolClassIds);
    }

    const { data: matches, error: matchErr } = await matchQuery;
    if (matchErr) return { data: null, error: "Failed to look up sessions." };

    const targets = (matches ?? []).filter(
      (s) => input.overwrite || s.program_id === null
    );
    if (targets.length === 0) {
      return {
        data: { updated: 0, matched: matches?.length ?? 0 },
        error: null,
      };
    }

    const { error: updateErr } = await supabase
      .from("sessions")
      .update({ program_id: program.id })
      .in("id", targets.map((s) => s.id));
    if (updateErr) return { data: null, error: "Failed to apply the programme." };

    await supabase.from("activity_log").insert({
      user_id: user.id,
      action: "program_applied_to_sessions",
      entity_type: "program",
      entity_id: program.id,
      metadata: {
        week_start: monday,
        centre_id: input.centreId ?? null,
        updated: targets.length,
      },
    });

    revalidatePath("/admin/roster");
    revalidatePath("/ops/roster");

    return {
      data: { updated: targets.length, matched: matches?.length ?? 0 },
      error: null,
    };
  } catch (err) {
    console.error("applyProgramToSessions error:", err);
    return { data: null, error: "Failed to apply the programme." };
  }
}

// ============================================================
// Library coverage + one-click term programming (curriculum build)
// ============================================================

export interface CoverageCell {
  sport: string;
  band: string;
  /** Standalone programmes pitched at this band. */
  singles: number;
  /** Multi-week series (counted once, not per week). */
  series: number;
  /** Longest series length available for this cell. */
  longestSeries: number;
}

/**
 * Sport × age-band coverage of the programme library, with each series
 * counted once. Drives the Library coverage grid so gaps ("no 8-12
 * Netball block") are visible instead of inferred.
 */
export async function getLibraryCoverage(): Promise<{
  data: CoverageCell[];
  error: string | null;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not authenticated." };

    const { data, error } = await supabase
      .from("programs")
      .select("sport, age_group, age_groups, series_id, series_week, series_length");
    if (error) return { data: [], error: error.message };

    const cells = new Map<string, CoverageCell>();
    const bump = (
      sport: string,
      band: string,
      kind: "single" | "series",
      length: number
    ) => {
      const key = `${sport}|${band}`;
      const cell =
        cells.get(key) ??
        ({ sport, band, singles: 0, series: 0, longestSeries: 0 } as CoverageCell);
      if (kind === "single") cell.singles++;
      else {
        cell.series++;
        cell.longestSeries = Math.max(cell.longestSeries, length);
      }
      cells.set(key, cell);
    };

    for (const p of data ?? []) {
      // Series rows count once, at week 1.
      if (p.series_id && p.series_week !== 1) continue;
      const bands = programBands(p as { age_group?: string | null; age_groups?: unknown });
      for (const band of bands.length > 0 ? bands : ["?"]) {
        bump(
          p.sport,
          band,
          p.series_id ? "series" : "single",
          p.series_length ?? 0
        );
      }
    }

    return {
      data: [...cells.values()].sort(
        (a, b) => a.sport.localeCompare(b.sport) || a.band.localeCompare(b.band)
      ),
      error: null,
    };
  } catch (err) {
    console.error("getLibraryCoverage error:", err);
    return { data: [], error: "Failed to load coverage." };
  }
}

export interface AutoProgrammeGroup {
  centre_name: string;
  sport: string;
  bands: string[];
  /** What will be attached: a series title or a single programme title. */
  source: string | null;
  source_kind: "series" | "single" | "none";
  session_count: number;
}

export interface AutoProgrammeResult {
  groups: AutoProgrammeGroup[];
  programmed: number;
  skipped: number;
}

/**
 * One-click term programming: walk every UNPROGRAMMED session of a term
 * (optionally one centre), group by centre + sport + audience band, and
 * attach the best band-matched series week-by-week (falling back to the
 * best single programme). Session bands derive from targeted classes /
 * rooms; whole-centre sessions use the centre's age_groups. Assigns
 * per-session by chronological position, so weekend sessions and
 * odd cadences programme correctly (no Mon–Fri window).
 */
export async function autoProgrammeTerm(input: {
  termId: string;
  centreId?: string | null;
  dryRun?: boolean;
}): Promise<{ data: AutoProgrammeResult | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not authenticated." };

    let sessionQuery = supabase
      .from("sessions")
      .select("id, date, sport, centre_id, school_class_ids")
      .eq("term_id", input.termId)
      .is("program_id", null)
      .not("status", "in", "(cancelled,completed)")
      .order("date")
      .order("time");
    if (input.centreId) sessionQuery = sessionQuery.eq("centre_id", input.centreId);
    const { data: sessions, error: sessErr } = await sessionQuery;
    if (sessErr) return { data: null, error: sessErr.message };
    if (!sessions || sessions.length === 0) {
      return { data: { groups: [], programmed: 0, skipped: 0 }, error: null };
    }

    // Resolve audiences: classes → bands, centres → fallback bands.
    const centreIds = [...new Set(sessions.map((s) => s.centre_id))];
    const classIds = [
      ...new Set(
        sessions.flatMap(
          (s) =>
            ((s as Record<string, unknown>).school_class_ids as string[] | null) ??
            []
        )
      ),
    ];
    const [{ data: centres }, { data: classes }, { data: programs }] =
      await Promise.all([
        supabase.from("centres").select("id, name, age_groups").in("id", centreIds),
        classIds.length > 0
          ? supabase
              .from("school_classes")
              .select("id, year_group")
              .in("id", classIds)
          : Promise.resolve({ data: [] as { id: string; year_group: string }[] }),
        supabase
          .from("programs")
          .select(
            "id, sport, age_group, age_groups, skill_focus, series_id, series_week, series_length, created_at"
          ),
      ]);

    const centreById = new Map(
      (centres ?? []).map((c) => [
        c.id,
        { name: c.name as string, bands: (c.age_groups as string[]) ?? [] },
      ])
    );
    const bandByClass = new Map(
      (classes ?? []).map((c) => [c.id, yearGroupToAgeBand(c.year_group)])
    );

    // Group unprogrammed sessions by centre + sport + audience bands.
    interface Group {
      centreId: string;
      sport: string;
      bands: string[];
      sessions: { id: string; date: string }[];
    }
    const groups = new Map<string, Group>();
    for (const s of sessions) {
      const sessionClassIds =
        ((s as Record<string, unknown>).school_class_ids as string[] | null) ?? [];
      const classBands = [
        ...new Set(
          sessionClassIds
            .map((id) => bandByClass.get(id) as string | undefined)
            .filter((b): b is string => Boolean(b))
        ),
      ];
      const bands =
        classBands.length > 0
          ? classBands
          : (centreById.get(s.centre_id)?.bands ?? []);
      const key = `${s.centre_id}|${s.sport}|${[...bands].sort().join(",")}`;
      const group =
        groups.get(key) ??
        ({ centreId: s.centre_id, sport: s.sport, bands, sessions: [] } as Group);
      group.sessions.push({ id: s.id, date: s.date });
      groups.set(key, group);
    }

    // Candidate lookup structures.
    const allPrograms = programs ?? [];
    const seriesWeeks = new Map<string, Map<number, string>>(); // series_id → week → program id
    for (const p of allPrograms) {
      if (!p.series_id || p.series_week == null) continue;
      const weeks = seriesWeeks.get(p.series_id) ?? new Map<number, string>();
      weeks.set(p.series_week, p.id);
      seriesWeeks.set(p.series_id, weeks);
    }

    const resultGroups: AutoProgrammeGroup[] = [];
    const updates = new Map<string, string[]>(); // program_id → session ids
    let programmed = 0;
    let skipped = 0;

    for (const group of groups.values()) {
      const centreName = centreById.get(group.centreId)?.name ?? "Unknown";
      const sportPrograms = allPrograms.filter((p) => p.sport === group.sport);

      // Best series: band overlap first, then length fit, then recency.
      const seriesHeads = sportPrograms.filter(
        (p) => p.series_id && p.series_week === 1
      );
      const rankedSeries = seriesHeads
        .map((p) => {
          const pBands = programBands(
            p as { age_group?: string | null; age_groups?: unknown }
          );
          return {
            p,
            match: bandMatchScore(pBands, group.bands),
            // Specificity: a series pitched at exactly this band beats a
            // broad all-ages series that merely overlaps it.
            breadth: Math.max(1, pBands.length),
          };
        })
        .filter((r) => r.match > 0 || group.bands.length === 0)
        .sort(
          (a, b) =>
            b.match - a.match ||
            a.breadth - b.breadth ||
            Math.abs((a.p.series_length ?? 0) - group.sessions.length) -
              Math.abs((b.p.series_length ?? 0) - group.sessions.length) ||
            String(b.p.created_at).localeCompare(String(a.p.created_at))
        );
      const bestSeries = rankedSeries[0]?.p ?? null;

      if (bestSeries?.series_id) {
        const weeks = seriesWeeks.get(bestSeries.series_id)!;
        const length = bestSeries.series_length ?? weeks.size;
        group.sessions.forEach((sess, i) => {
          const week = (i % Math.max(1, length)) + 1;
          const programId = weeks.get(week) ?? bestSeries.id;
          const list = updates.get(programId) ?? [];
          list.push(sess.id);
          updates.set(programId, list);
        });
        programmed += group.sessions.length;
        resultGroups.push({
          centre_name: centreName,
          sport: group.sport,
          bands: group.bands,
          source: `${bestSeries.skill_focus ?? group.sport} (${length}-week series)`,
          source_kind: "series",
          session_count: group.sessions.length,
        });
        continue;
      }

      // Fallback: best band-matched single programme for every session.
      const singles = sportPrograms.filter((p) => !p.series_id);
      const rankedSingles = singles
        .map((p) => ({
          p,
          match: bandMatchScore(
            programBands(p as { age_group?: string | null; age_groups?: unknown }),
            group.bands
          ),
        }))
        .sort(
          (a, b) =>
            b.match - a.match ||
            String(b.p.created_at).localeCompare(String(a.p.created_at))
        );
      const best = rankedSingles.find((r) => r.match > 0)?.p ?? rankedSingles[0]?.p;

      if (best) {
        const list = updates.get(best.id) ?? [];
        list.push(...group.sessions.map((x) => x.id));
        updates.set(best.id, list);
        programmed += group.sessions.length;
        resultGroups.push({
          centre_name: centreName,
          sport: group.sport,
          bands: group.bands,
          source: best.skill_focus ?? group.sport,
          source_kind: "single",
          session_count: group.sessions.length,
        });
      } else {
        skipped += group.sessions.length;
        resultGroups.push({
          centre_name: centreName,
          sport: group.sport,
          bands: group.bands,
          source: null,
          source_kind: "none",
          session_count: group.sessions.length,
        });
      }
    }

    if (!input.dryRun && updates.size > 0) {
      for (const [programId, sessionIds] of updates) {
        const { error: updateErr } = await supabase
          .from("sessions")
          .update({ program_id: programId })
          .in("id", sessionIds)
          .is("program_id", null);
        if (updateErr) return { data: null, error: updateErr.message };
      }
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action: "term_auto_programmed",
        entity_type: "term",
        entity_id: input.termId,
        metadata: {
          centre_id: input.centreId ?? null,
          programmed,
          skipped,
        },
      });
      revalidatePath("/admin/roster");
      revalidatePath("/ops/roster");
    }

    resultGroups.sort(
      (a, b) =>
        a.centre_name.localeCompare(b.centre_name) ||
        a.sport.localeCompare(b.sport)
    );
    return { data: { groups: resultGroups, programmed, skipped }, error: null };
  } catch (err) {
    console.error("autoProgrammeTerm error:", err);
    return { data: null, error: "Failed to programme the term." };
  }
}
