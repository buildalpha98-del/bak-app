import type { CurriculumOutcome } from "@/lib/ai/types";
import type { YearBand } from "./frameworks";
import { validateOutcomes } from "./knowledge-base";

/**
 * A term plan (migration 096): the Scope & Sequence a class follows for
 * one subject this term, as the AI drafts it and the school approves it.
 * Pure shape + normalisation; no I/O, so the rules the portal relies on
 * are testable without a database.
 */
export interface TermPlanUnit {
  title: string;
  /** Strand / focus area / programme type the unit sits in. */
  strand: string;
  /** Term weeks the unit runs, 1-based, contiguous, e.g. [1,2,3]. */
  weeks: number[];
  description: string;
  /** Optional key inquiry questions (PDHPE K–6 samples carry them). */
  inquiryQuestions?: string[];
  /** Real outcome codes with official statements (validated). */
  outcomes: CurriculumOutcome[];
  /** Where and how the unit is assessed. */
  assessment?: string;
  /** One line per week: what that week's lesson focuses on. */
  weeklyFocus: Array<{ week: number; focus: string }>;
}

export interface TermPlanJson {
  title: string;
  subject: string;
  /** Framework band label as the school reads it, e.g. "Stage 2". */
  bandLabel: string;
  rationale: string;
  weekCount: number;
  units: TermPlanUnit[];
}

export interface TermPlanIssue {
  code: "no_units" | "week_gap" | "week_overlap" | "week_out_of_range" | "no_outcomes";
  detail: string;
}

/**
 * Tidy what the model returned and check it covers the term: every week
 * 1..weekCount belongs to exactly one unit, every unit keeps only real
 * in-band outcomes (official statements as titles), weekly focus lines
 * exist for every week. Returns the normalised plan and the issues that
 * remain — a plan with issues is still shown, so the teacher can fix it,
 * but the save path refuses it.
 */
export function normaliseTermPlan(
  raw: unknown,
  opts: { subject: string; bandLabel: string; bands: YearBand[]; weekCount: number }
): { plan: TermPlanJson; issues: TermPlanIssue[]; unknownCodes: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const issues: TermPlanIssue[] = [];
  const unknownCodes: string[] = [];
  const weekCount = opts.weekCount;

  const rawUnits = Array.isArray(r.units) ? (r.units as unknown[]) : [];
  const units: TermPlanUnit[] = [];
  for (const u of rawUnits) {
    if (!u || typeof u !== "object") continue;
    const x = u as Record<string, unknown>;
    const weeks = Array.from(
      new Set(
        (Array.isArray(x.weeks) ? (x.weeks as unknown[]) : [])
          .map((w) => Number(w))
          .filter((w) => Number.isInteger(w) && w >= 1)
      )
    ).sort((a, b) => a - b);
    const check = validateOutcomes(
      (Array.isArray(x.outcomes) ? (x.outcomes as CurriculumOutcome[]) : []).map((o) => ({
        framework: (o?.framework as CurriculumOutcome["framework"]) ?? "pdhpe",
        code: String(o?.code ?? ""),
        title: String(o?.title ?? ""),
        description: String(o?.description ?? ""),
      })),
      { bands: opts.bands }
    );
    unknownCodes.push(...check.unknown, ...check.offBand);
    const weeklyRaw = Array.isArray(x.weeklyFocus) ? (x.weeklyFocus as unknown[]) : [];
    const weeklyFocus = weeklyRaw
      .map((w) => {
        const y = (w ?? {}) as Record<string, unknown>;
        return { week: Number(y.week), focus: String(y.focus ?? "").trim() };
      })
      .filter((w) => Number.isInteger(w.week) && weeks.includes(w.week) && w.focus);
    // Every week of the unit gets a focus line, even if the model skipped one.
    for (const w of weeks) {
      if (!weeklyFocus.some((f) => f.week === w)) weeklyFocus.push({ week: w, focus: String(x.title ?? "").trim() });
    }
    weeklyFocus.sort((a, b) => a.week - b.week);
    const unit: TermPlanUnit = {
      title: String(x.title ?? "").trim() || "Untitled unit",
      strand: String(x.strand ?? "").trim(),
      weeks,
      description: String(x.description ?? "").trim(),
      outcomes: check.kept,
      weeklyFocus,
    };
    const iq = Array.isArray(x.inquiryQuestions)
      ? (x.inquiryQuestions as unknown[]).map((q) => String(q).trim()).filter(Boolean)
      : [];
    if (iq.length) unit.inquiryQuestions = iq;
    const assessment = String(x.assessment ?? "").trim();
    if (assessment) unit.assessment = assessment;
    if (unit.outcomes.length === 0) issues.push({ code: "no_outcomes", detail: `"${unit.title}" has no recognised outcomes.` });
    units.push(unit);
  }
  units.sort((a, b) => (a.weeks[0] ?? 99) - (b.weeks[0] ?? 99));

  if (units.length === 0) issues.push({ code: "no_units", detail: "The plan has no units." });
  // Units may run side by side when their strands differ (PDHPE's PDH
  // and PE units share a term); within one strand a week belongs to one
  // unit. Every week must belong to at least one unit.
  const seen = new Map<string, string>();
  const covered = new Set<number>();
  for (const u of units) {
    for (const w of u.weeks) {
      if (w > weekCount) {
        issues.push({ code: "week_out_of_range", detail: `"${u.title}" runs past week ${weekCount}.` });
        continue;
      }
      const key = `${u.strand.toLowerCase()}#${w}`;
      if (seen.has(key)) issues.push({ code: "week_overlap", detail: `Week ${w} is in both "${seen.get(key)}" and "${u.title}".` });
      else seen.set(key, u.title);
      covered.add(w);
    }
  }
  const missing: number[] = [];
  for (let w = 1; w <= weekCount; w++) if (!covered.has(w)) missing.push(w);
  if (missing.length && units.length) issues.push({ code: "week_gap", detail: `No unit covers week${missing.length > 1 ? "s" : ""} ${missing.join(", ")}.` });

  const plan: TermPlanJson = {
    title: String(r.title ?? "").trim() || `${opts.bandLabel} term plan`,
    subject: opts.subject,
    bandLabel: opts.bandLabel,
    rationale: String(r.rationale ?? "").trim(),
    weekCount,
    units,
  };
  return { plan, issues, unknownCodes: Array.from(new Set(unknownCodes)) };
}

/** Is a stored content_json a usable TermPlanJson? (Tolerant read for old rows.) */
export function isTermPlanJson(value: unknown): value is TermPlanJson {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === "string" && Array.isArray(v.units) && typeof v.weekCount === "number";
}

/** The unit running in a given term week, if any. */
export function unitForWeek(plan: TermPlanJson, week: number): TermPlanUnit | null {
  return plan.units.find((u) => u.weeks.includes(week)) ?? null;
}
