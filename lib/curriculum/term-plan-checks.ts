// Structural checks on a term plan that need no knowledge base — safe to
// import from the client (the editor shows them live) and used by the
// server-side normaliser after it has validated the codes.

export interface TermPlanIssue {
  code: "no_units" | "week_gap" | "week_overlap" | "week_out_of_range" | "no_outcomes";
  detail: string;
}

export interface UnitLike {
  title: string;
  strand: string;
  weeks: number[];
  outcomes: Array<{ code: string }>;
}

/**
 * Units may run side by side when their strands differ (PDHPE's PDH and
 * PE units share a term); within one strand a week belongs to one unit.
 * Every week 1..weekCount must belong to at least one unit, no unit may
 * run past the term, and every unit needs at least one outcome.
 */
export function structuralIssues(units: UnitLike[], weekCount: number): TermPlanIssue[] {
  const issues: TermPlanIssue[] = [];
  for (const u of units) {
    if (u.outcomes.length === 0) issues.push({ code: "no_outcomes", detail: `"${u.title}" has no recognised outcomes.` });
  }
  if (units.length === 0) issues.push({ code: "no_units", detail: "The plan has no units." });
  const seen = new Map<string, string>();
  const covered = new Set<number>();
  for (const u of units) {
    for (const w of u.weeks) {
      if (w > weekCount) {
        issues.push({ code: "week_out_of_range", detail: `"${u.title}" runs past week ${weekCount}.` });
        continue;
      }
      const key = `${u.strand.trim().toLowerCase()}#${w}`;
      if (seen.has(key)) issues.push({ code: "week_overlap", detail: `Week ${w} is in both "${seen.get(key)}" and "${u.title}".` });
      else seen.set(key, u.title);
      covered.add(w);
    }
  }
  const missing: number[] = [];
  for (let w = 1; w <= weekCount; w++) if (!covered.has(w)) missing.push(w);
  if (missing.length && units.length) {
    issues.push({ code: "week_gap", detail: `No unit covers week${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.` });
  }
  return issues;
}

/** Contiguous week list from a from/to pair, clamped to the term. */
export function weekRange(from: number, to: number, weekCount: number): number[] {
  const a = Math.max(1, Math.min(from, to));
  const b = Math.min(weekCount, Math.max(from, to));
  const out: number[] = [];
  for (let w = a; w <= b; w++) out.push(w);
  return out;
}
