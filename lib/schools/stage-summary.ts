// Stage-level rollup, derived at render time from a report's
// class_breakdown — no new stored data, so old reports gain the stage
// view retroactively and the numbers can never drift from the class
// table they sit beside. Rendered by the term-report PDF and the
// portal's expanded report card.

import { NSW_STAGES, yearGroupToStage, type NswStage } from "@/lib/schools/year-groups";

export interface StageSummaryRow {
  stage: NswStage;
  student_count: number;
  /** Student-weighted attendance %, null when no class in the stage has data. */
  attendance_percentage: number | null;
  /** Student-weighted average mark (1-5), null when unassessed. */
  avg_mark: number | null;
  /** Student-weighted movement vs last term, null without both terms. */
  mark_delta: number | null;
}

interface ClassLike {
  year_group: string;
  student_count: number;
  attendance_percentage: number | null;
  avg_mark: number | null;
  mark_delta: number | null;
}

function weighted(
  pairs: Array<{ value: number | null; weight: number }>
): number | null {
  let sum = 0;
  let weightTotal = 0;
  for (const { value, weight } of pairs) {
    if (value == null || weight <= 0) continue;
    sum += value * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? sum / weightTotal : null;
}

/**
 * Group classes into NSW stages. Classes whose year group doesn't map
 * to a stage (childcare rooms, unparseable input) are skipped, which
 * hides the section entirely for non-school content. Returns [] when
 * fewer than one stage resolves.
 */
export function stageSummaryFromClasses(
  classes: ClassLike[] | undefined | null
): StageSummaryRow[] {
  if (!classes || classes.length === 0) return [];
  const byStage = new Map<NswStage, ClassLike[]>();
  for (const cls of classes) {
    const stage = yearGroupToStage(cls.year_group);
    if (!stage) continue;
    byStage.set(stage, [...(byStage.get(stage) ?? []), cls]);
  }

  const rows: StageSummaryRow[] = [];
  for (const stage of NSW_STAGES) {
    const members = byStage.get(stage);
    if (!members) continue;
    const attendance = weighted(
      members.map((c) => ({ value: c.attendance_percentage, weight: c.student_count }))
    );
    const mark = weighted(
      members.map((c) => ({ value: c.avg_mark, weight: c.student_count }))
    );
    const delta = weighted(
      members.map((c) => ({ value: c.mark_delta, weight: c.student_count }))
    );
    rows.push({
      stage,
      student_count: members.reduce((sum, c) => sum + c.student_count, 0),
      attendance_percentage: attendance == null ? null : Math.round(attendance),
      avg_mark: mark == null ? null : Math.round(mark * 10) / 10,
      mark_delta: delta == null ? null : Math.round(delta * 10) / 10,
    });
  }
  return rows;
}
