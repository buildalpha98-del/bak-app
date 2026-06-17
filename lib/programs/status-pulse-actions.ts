"use server";

// ============================================================
// Programmes — status pulse server action
// ============================================================
//
// Powers the inline pulse strip above the programme library list.
// Four counts surface "what to look at first" when an admin or ops
// user lands on /admin/programs (or /ops/programs):
//
//   1. Programmes missing skills    — `content_json.skillDevelopment`
//      is empty or absent. The programme exists but the rubric / drill
//      ladder is half-built so it can't drive a real session.
//   2. Unused programmes            — no `sessions.program_id = p.id`
//      rows. The library has 50+ entries and a slice of them have
//      never been scheduled. Useful for pruning dead weight.
//   3. New this week                — `programs.created_at >= Monday`.
//      Head count keeps the wire small.
//   4. Stale programmes             — created ≥ 60 days ago AND has
//      sessions but the most-recent session is ≥ 90 days old. The
//      "used to land, now drifting" cohort.
//
// Implementation notes:
//   - All Supabase calls fan out in parallel where possible.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - `head: true` on the new-this-week count keeps it a head call.
//   - We pull the list of all programme ids once and bucket sessions
//     by program_id in memory rather than per-row count queries.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface ProgramsStatusPulse {
  programmesMissingSkillsCount: number;
  programmesUnusedCount: number;
  programmesNewThisWeekCount: number;
  programmesStaleCount: number;
}

const STALE_AGE_DAYS = 60; // programme must be at least this old to count as stale
const STALE_LAST_USED_DAYS = 90; // and its most-recent session must be at least this old

export async function getProgramsStatusPulse(): Promise<ProgramsStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    const staleCutoff = new Date(now);
    staleCutoff.setDate(staleCutoff.getDate() - STALE_AGE_DAYS);
    const staleCutoffIso = staleCutoff.toISOString();

    const lastUsedCutoff = new Date(now);
    lastUsedCutoff.setDate(lastUsedCutoff.getDate() - STALE_LAST_USED_DAYS);
    const lastUsedCutoffIso = lastUsedCutoff.toISOString().slice(0, 10);

    // ============================================================
    // Fan out:
    //
    // 1. All programmes — id, created_at, content_json. We need
    //    content_json to count missing-skills, created_at for the
    //    stale bucket, and id to bucket sessions by program_id.
    // 2. New programmes head count — `created_at >= Monday`.
    // 3. All sessions with a `program_id` set — date + program_id.
    //    Used to derive "unused" and "stale" cohorts.
    // ============================================================

    const [allProgramsRes, newProgramsRes, sessionsRes] = await Promise.all([
      supabase
        .from("programs")
        .select("id, created_at, content_json"),
      supabase
        .from("programs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("sessions")
        .select("program_id, date")
        .not("program_id", "is", null),
    ]);

    const programmesNewThisWeekCount = newProgramsRes.count ?? 0;

    const allPrograms = (allProgramsRes.data ?? []) as Array<{
      id: string;
      created_at: string;
      content_json: Record<string, unknown> | null;
    }>;

    // (1) Programmes without skills — content_json.skillDevelopment is
    // empty or absent. We treat a missing field, a non-array, and an
    // empty array all as "no rubric yet".
    let programmesMissingSkillsCount = 0;
    for (const p of allPrograms) {
      const skills = (p.content_json as Record<string, unknown> | null)
        ?.skillDevelopment;
      if (!Array.isArray(skills) || skills.length === 0) {
        programmesMissingSkillsCount += 1;
      }
    }

    // Build a per-program latest session-date map for the unused +
    // stale calculations. `null` last_used means never used.
    const lastUsedByProgram = new Map<string, string>();
    for (const row of sessionsRes.data ?? []) {
      const r = row as { program_id: string | null; date: string };
      if (!r.program_id) continue;
      const prev = lastUsedByProgram.get(r.program_id);
      if (!prev || r.date > prev) {
        lastUsedByProgram.set(r.program_id, r.date);
      }
    }

    // (2) Unused programmes — no session row at all.
    // (4) Stale programmes — created ≥ STALE_AGE_DAYS ago, has at
    //     least one session, and most-recent session date is ≥
    //     STALE_LAST_USED_DAYS ago.
    let programmesUnusedCount = 0;
    let programmesStaleCount = 0;
    for (const p of allPrograms) {
      const lastUsed = lastUsedByProgram.get(p.id) ?? null;
      if (lastUsed === null) {
        programmesUnusedCount += 1;
        continue;
      }
      if (p.created_at < staleCutoffIso && lastUsed < lastUsedCutoffIso) {
        programmesStaleCount += 1;
      }
    }

    return {
      programmesMissingSkillsCount,
      programmesUnusedCount,
      programmesNewThisWeekCount,
      programmesStaleCount,
    };
  } catch (err) {
    console.error("getProgramsStatusPulse error:", err);
    return {
      programmesMissingSkillsCount: 0,
      programmesUnusedCount: 0,
      programmesNewThisWeekCount: 0,
      programmesStaleCount: 0,
    };
  }
}
