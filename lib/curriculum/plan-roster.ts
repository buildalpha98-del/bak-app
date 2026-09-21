import type { TermPlanJson, TermPlanUnit } from "./term-plan";

/**
 * The approved PDHPE term plan drives the roster: each rostered session
 * for the class takes its brief from the plan's week. Pure mapping — which
 * unit and focus a week carries, which plan leads a shared session — so
 * the rules are testable without a database or the model.
 *
 * Types only from term-plan.ts: that module pulls in the (server-only)
 * knowledge base, and this one is imported by the roster dialog.
 */

/** What a coach's session in a given week has to deliver. */
export interface PlanWeekBrief {
  week: number;
  weekCount: number;
  planTitle: string;
  unitTitle: string;
  strand: string;
  unitDescription: string;
  focus: string;
  /** The unit's validated outcome codes — the session picks from these. */
  outcomeCodes: string[];
  assessment: string | null;
  /** Earlier weeks of the same unit, so the session progresses. */
  previousFocuses: Array<{ week: number; focus: string }>;
  /** True on the unit's final week. */
  isUnitFinalWeek: boolean;
}

/**
 * A PDHPE plan runs a classroom strand and a movement strand in parallel.
 * A coach delivers the movement one — "Physical education" in the NSW
 * samples, "Movement and physical activity" in the Victorian curriculum,
 * and the 2024 NSW syllabus's "Movement skill and performance".
 */
export function isMovementUnit(unit: Pick<TermPlanUnit, "strand">): boolean {
  return /physical education|movement|physical activity/i.test(unit.strand);
}

/**
 * The unit a coach's session delivers in `week`: the movement unit
 * covering it, else — a plan written as one integrated unit — whichever
 * unit covers it. Null when the plan has nothing for the week.
 */
export function coachUnitForWeek(plan: TermPlanJson, week: number): TermPlanUnit | null {
  const covering = plan.units.filter((u) => u.weeks.includes(week));
  return covering.find(isMovementUnit) ?? covering[0] ?? null;
}

export function briefForWeek(plan: TermPlanJson, week: number): PlanWeekBrief | null {
  const unit = coachUnitForWeek(plan, week);
  if (!unit) return null;
  const focusOf = (w: number) => unit.weeklyFocus.find((f) => f.week === w)?.focus.trim() ?? "";
  const focus = focusOf(week) || unit.title;
  return {
    week,
    weekCount: plan.weekCount,
    planTitle: plan.title,
    unitTitle: unit.title,
    strand: unit.strand,
    unitDescription: unit.description,
    focus,
    outcomeCodes: unit.outcomes.map((o) => o.code),
    assessment: unit.assessment?.trim() || null,
    previousFocuses: unit.weeks
      .filter((w) => w < week)
      .map((w) => ({ week: w, focus: focusOf(w) }))
      .filter((f) => f.focus),
    isUnitFinalWeek: week === Math.max(...unit.weeks),
  };
}

/**
 * A session can target several classes. The plan that drives it is the
 * first targeted class (in the session's own order) with an approved
 * plan; the other classes still shape the programme through their year
 * groups.
 */
export function leadPlanClassId(sessionClassIds: string[], planClassIds: Set<string>): string | null {
  return sessionClassIds.find((id) => planClassIds.has(id)) ?? null;
}

export type PlanSessionState =
  /** No programme yet — will be written from the plan. */
  | "ready"
  /** Already carries this plan's programme for this week. */
  | "from_plan"
  /** Has some other programme — only replaced when asked. */
  | "programmed"
  /** Completed or cancelled — never touched. */
  | "locked"
  /** Falls outside the plan's weeks. */
  | "no_week";

export function planSessionState(s: {
  status: string;
  programId: string | null;
  programPlanId: string | null;
  programPlanWeek: number | null;
  planId: string;
  week: number | null;
  hasBrief: boolean;
}): PlanSessionState {
  if (s.status === "completed" || s.status === "cancelled") return "locked";
  if (s.week === null || !s.hasBrief) return "no_week";
  if (s.programId && s.programPlanId === s.planId && s.programPlanWeek === s.week) return "from_plan";
  if (s.programId) return "programmed";
  return "ready";
}
