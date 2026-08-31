// Per-class rollups — "3B: 92% attendance, marks up 0.6 this term" —
// shared by the portal Impact dashboard and the term-report compiler so
// the number a principal sees on screen is the number in the PDF.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { yearGroupSortKey } from "@/lib/schools/year-groups";

export interface ClassRollup {
  id: string;
  name: string;
  year_group: string;
  teacher_name: string | null;
  student_count: number;
  /** % of this term's attendance records marked present. Null before any records. */
  attendance_percentage: number | null;
  /** Average skill mark (1-5) across the class this term. Null before assessment. */
  avg_mark: number | null;
  /** avg_mark minus last term's, one decimal. Null without both terms. */
  mark_delta: number | null;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function avgMarkByChild(
  rows: { child_id: string; ratings_json: unknown }[] | null
): Map<string, number[]> {
  const byChild = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const marks = ((row.ratings_json as { rating: number }[]) ?? [])
      .map((s) => s.rating)
      .filter((n) => Number.isFinite(n));
    if (marks.length === 0) continue;
    byChild.set(row.child_id, [...(byChild.get(row.child_id) ?? []), ...marks]);
  }
  return byChild;
}

const avg = (xs: number[]) =>
  xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * Compute the latest school year's per-class rollups for a centre.
 * Attendance is scoped to the caller's `termSessionIds`; marks to
 * `termId` (and `prevTermId` for the delta). Returns [] for centres
 * without a class list — callers can treat empty as "not a school".
 * RLS decides visibility: the portal calls this through the client-role
 * cookie session, staff paths through theirs.
 */
export async function computeClassRollups(
  supabase: Supabase,
  centreId: string,
  opts: { termId: string; prevTermId: string | null; termSessionIds: string[] }
): Promise<ClassRollup[]> {
  const { data: classes } = await supabase
    .from("school_classes")
    .select("id, name, year_group, teacher_name, school_year")
    .eq("centre_id", centreId);
  if (!classes || classes.length === 0) return [];

  const latestYear = Math.max(...classes.map((c) => c.school_year));
  const currentClasses = classes.filter((c) => c.school_year === latestYear);
  const { data: members } = await supabase
    .from("school_class_children")
    .select("class_id, child_id")
    .in("class_id", currentClasses.map((c) => c.id))
    .is("ended_at", null);
  const childIds = Array.from(new Set((members ?? []).map((m) => m.child_id)));

  const [{ data: termAttendance }, { data: termMarks }, { data: prevMarks }] =
    await Promise.all([
      opts.termSessionIds.length > 0 && childIds.length > 0
        ? supabase
            .from("session_attendances")
            .select("child_id, present")
            .in("session_id", opts.termSessionIds)
            .in("child_id", childIds)
        : Promise.resolve({ data: [] as { child_id: string; present: boolean }[] }),
      childIds.length > 0
        ? supabase
            .from("skill_ratings")
            .select("child_id, ratings_json")
            .eq("term_id", opts.termId)
            .in("child_id", childIds)
        : Promise.resolve({ data: [] }),
      childIds.length > 0 && opts.prevTermId
        ? supabase
            .from("skill_ratings")
            .select("child_id, ratings_json")
            .eq("term_id", opts.prevTermId)
            .in("child_id", childIds)
        : Promise.resolve({ data: [] }),
    ]);

  const termByChild = avgMarkByChild(termMarks as never);
  const prevByChild = avgMarkByChild(prevMarks as never);
  const attByChild = new Map<string, { present: number; total: number }>();
  for (const a of termAttendance ?? []) {
    const cur = attByChild.get(a.child_id) ?? { present: 0, total: 0 };
    cur.total++;
    if (a.present) cur.present++;
    attByChild.set(a.child_id, cur);
  }

  const rollups: ClassRollup[] = [];
  for (const cls of currentClasses) {
    const clsChildIds = (members ?? [])
      .filter((m) => m.class_id === cls.id)
      .map((m) => m.child_id);

    let present = 0;
    let total = 0;
    const termMarksAll: number[] = [];
    const prevMarksAll: number[] = [];
    for (const id of clsChildIds) {
      const att = attByChild.get(id);
      if (att) {
        present += att.present;
        total += att.total;
      }
      termMarksAll.push(...(termByChild.get(id) ?? []));
      prevMarksAll.push(...(prevByChild.get(id) ?? []));
    }
    const avgMark = avg(termMarksAll);
    const prevAvg = avg(prevMarksAll);

    rollups.push({
      id: cls.id,
      name: cls.name,
      year_group: cls.year_group,
      teacher_name: cls.teacher_name,
      student_count: clsChildIds.length,
      attendance_percentage: total > 0 ? Math.round((present / total) * 100) : null,
      avg_mark: avgMark == null ? null : Math.round(avgMark * 10) / 10,
      mark_delta:
        avgMark == null || prevAvg == null
          ? null
          : Math.round((avgMark - prevAvg) * 10) / 10,
    });
  }
  rollups.sort(
    (a, b) =>
      yearGroupSortKey(a.year_group) - yearGroupSortKey(b.year_group) ||
      a.name.localeCompare(b.name)
  );
  return rollups;
}
