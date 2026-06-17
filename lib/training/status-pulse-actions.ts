"use server";

// ============================================================
// Training — status pulse server action
// ============================================================
//
// Powers the inline pulse strip at the top of /admin/training (and
// /ops/training). Four counts surface "what to look at first":
//
//   1. Overdue assignments   — `training_assignments` rows whose
//      `due_date < CURRENT_DATE` AND `status != 'completed'`. The
//      LMS soft-gates rostering, so an overdue assignment is the
//      bluntest signal of a coach who's about to fall out of
//      compliance for an upcoming shift.
//   2. Unassigned mandatory  — `training_modules` rows with
//      `is_mandatory = true AND status = 'published'` that have at
//      least one active coach with no current assignment. CLAUDE.md
//      contract: "Auto-assign mandatory on new coach", but old
//      coaches predate new mandatory rules, so we surface the gap.
//   3. New modules this week — `training_modules.created_at >=
//      Monday`. Head count — keeps the wire small.
//   4. Coaches with zero completions — active coaches who have
//      `training_completions` rows count == 0. The "never finished
//      anything" cohort that hides in onboarding limbo.
//
// Implementation notes:
//   - All Supabase calls fan out in parallel where possible.
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.
//   - `head: true` on the new-this-week count keeps it a head call.
//   - We pull the active-coach + completions sets once and bucket
//     in memory rather than per-row count queries.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonday } from "@/lib/utils/roster";

export interface TrainingStatusPulse {
  overdueAssignmentsCount: number;
  unassignedMandatoryCount: number;
  newModulesThisWeekCount: number;
  coachesZeroCompletionsCount: number;
}

export async function getTrainingStatusPulse(): Promise<TrainingStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monday = getMonday(now);
    const mondayIso = monday.toISOString();

    // ============================================================
    // Fan out:
    //
    // 1. Overdue assignments — head count where due_date < today
    //    AND status != 'completed'. Direct head call.
    // 2. New modules head count — `created_at >= Monday`.
    // 3. Active coaches — id list. Used to drive #2 (gap detection)
    //    and #4 (zero-completion bucket).
    // 4. Mandatory published modules — id list. Used for gap join.
    // 5. Open assignments — coach_id + module_id pairs for any
    //    assignment that's still 'assigned' or 'in_progress' on a
    //    mandatory module. Used to derive the gap set.
    // 6. Completions — distinct coach_id values for the zero-
    //    completion bucket.
    // ============================================================

    const [
      overdueRes,
      newModulesRes,
      coachesRes,
      mandatoryModulesRes,
      completionsRes,
    ] = await Promise.all([
      supabase
        .from("training_assignments")
        .select("id", { count: "exact", head: true })
        .lt("due_date", today)
        .not("due_date", "is", null)
        .neq("status", "completed"),
      supabase
        .from("training_modules")
        .select("id", { count: "exact", head: true })
        .gte("created_at", mondayIso),
      supabase
        .from("profiles")
        .select("id")
        .eq("role", "coach")
        .eq("status", "active"),
      supabase
        .from("training_modules")
        .select("id")
        .eq("is_mandatory", true)
        .eq("status", "published"),
      supabase
        .from("training_completions")
        .select("coach_id"),
    ]);

    const overdueAssignmentsCount = overdueRes.count ?? 0;
    const newModulesThisWeekCount = newModulesRes.count ?? 0;

    const coachIds = (coachesRes.data ?? []).map(
      (r) => (r as { id: string }).id,
    );
    const mandatoryModuleIds = (mandatoryModulesRes.data ?? []).map(
      (r) => (r as { id: string }).id,
    );

    // (4) Coaches with zero completions — active coach whose id never
    //     appears in `training_completions.coach_id`.
    const coachesWithCompletions = new Set<string>();
    for (const row of completionsRes.data ?? []) {
      const r = row as { coach_id: string };
      coachesWithCompletions.add(r.coach_id);
    }
    let coachesZeroCompletionsCount = 0;
    for (const id of coachIds) {
      if (!coachesWithCompletions.has(id)) {
        coachesZeroCompletionsCount += 1;
      }
    }

    // (2) Unassigned mandatory — distinct (coach, mandatory module)
    //     pairs without an open assignment row. We pull only the
    //     open assignment rows scoped to mandatory module ids — keeps
    //     the wire small even with thousands of historical rows.
    let unassignedMandatoryCount = 0;
    if (coachIds.length > 0 && mandatoryModuleIds.length > 0) {
      const { data: openAssignments } = await supabase
        .from("training_assignments")
        .select("coach_id, module_id")
        .in("module_id", mandatoryModuleIds)
        .in("status", ["assigned", "in_progress"]);

      const openPairs = new Set<string>();
      for (const row of openAssignments ?? []) {
        const r = row as { coach_id: string; module_id: string };
        openPairs.add(`${r.coach_id}::${r.module_id}`);
      }
      for (const coachId of coachIds) {
        for (const modId of mandatoryModuleIds) {
          if (!openPairs.has(`${coachId}::${modId}`)) {
            unassignedMandatoryCount += 1;
          }
        }
      }
    }

    return {
      overdueAssignmentsCount,
      unassignedMandatoryCount,
      newModulesThisWeekCount,
      coachesZeroCompletionsCount,
    };
  } catch (err) {
    console.error("getTrainingStatusPulse error:", err);
    return {
      overdueAssignmentsCount: 0,
      unassignedMandatoryCount: 0,
      newModulesThisWeekCount: 0,
      coachesZeroCompletionsCount: 0,
    };
  }
}
