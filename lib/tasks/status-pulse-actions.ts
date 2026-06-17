"use server";

// ============================================================
// Tasks — status pulse server action
// ============================================================
//
// Powers the inline "overdue · due today · mine · unassigned" pulse
// strip above the /admin/tasks board. Each count is a link-to-jump
// that flips a query param on the list view so the operator can
// drill straight into the work that needs attention.
//
// All four buckets exclude tasks that already live in a final
// (`task_columns.is_final = true`) column — once a task is Done
// it doesn't count as overdue / due-today / mine / unassigned for
// pulse purposes.
//
// Implementation notes:
//   - We fetch the final-column id list once (typically 1 row), then
//     use `.not('column_id','in', '(...)')` for each count. Supabase's
//     `.in()` accepts `(a,b,c)` style strings for the negation form.
//   - `head: true` count queries avoid hauling rows back across the
//     wire for a pure aggregate.
//   - The "mine" bucket needs the current viewer id — pulled from
//     `supabase.auth.getUser()`. If there's no authed user we bail
//     to all-zeros (mirrors the children/staff pulse pattern).
//   - Errors swallow to zeros so a single broken sub-query doesn't
//     blank the whole page.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface TasksStatusPulse {
  overdueCount: number;
  dueTodayCount: number;
  mineCount: number;
  unassignedCount: number;
}

export async function getTasksStatusPulse(): Promise<TasksStatusPulse> {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        overdueCount: 0,
        dueTodayCount: 0,
        mineCount: 0,
        unassignedCount: 0,
      };
    }

    const today = new Date().toISOString().slice(0, 10);

    // ============================================================
    // Resolve the final-column id list first. Every count below
    // excludes these so completed tasks don't inflate the pulse.
    // ============================================================
    const { data: finalCols } = await supabase
      .from("task_columns")
      .select("id")
      .eq("is_final", true);

    const finalIds = (finalCols ?? [])
      .map((c: { id: string }) => c.id)
      .filter(Boolean);

    // Supabase wants the negated-in list as "(id1,id2,id3)". Empty
    // list is fine — the .not() simply matches everything in that case
    // (no exclusions).
    const finalInClause =
      finalIds.length > 0 ? `(${finalIds.join(",")})` : null;

    // ============================================================
    // Fan out the four counts in parallel.
    // ============================================================
    const [
      overdueRes,
      dueTodayRes,
      mineRes,
      unassignedRes,
    ] = await Promise.all([
      (() => {
        let q = supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .lt("due_date", today);
        if (finalInClause) q = q.not("column_id", "in", finalInClause);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("due_date", today);
        if (finalInClause) q = q.not("column_id", "in", finalInClause);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assignee_id", user.id);
        if (finalInClause) q = q.not("column_id", "in", finalInClause);
        return q;
      })(),
      (() => {
        let q = supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .is("assignee_id", null);
        if (finalInClause) q = q.not("column_id", "in", finalInClause);
        return q;
      })(),
    ]);

    return {
      overdueCount: overdueRes.count ?? 0,
      dueTodayCount: dueTodayRes.count ?? 0,
      mineCount: mineRes.count ?? 0,
      unassignedCount: unassignedRes.count ?? 0,
    };
  } catch (err) {
    console.error("getTasksStatusPulse error:", err);
    return {
      overdueCount: 0,
      dueTodayCount: 0,
      mineCount: 0,
      unassignedCount: 0,
    };
  }
}
