import type { CurriculumOutcome } from "@/lib/ai/types";
import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import { FRAMEWORKS, frameworkForCode, type FrameworkDef, type FrameworkKey, type YearBand } from "./frameworks";
import { SUBJECTS, type SubjectDef, type SubjectKey } from "./subjects";
import nswPdhpe2018 from "./data/nsw-pdhpe-2018.json";
import nswPdhpe2024 from "./data/nsw-pdhpe-2024.json";
import nswEnglish from "./data/nsw-english.json";
import nswMathematics from "./data/nsw-mathematics.json";
import vicPdhpe from "./data/vic-pdhpe.json";
import vicEnglish from "./data/vic-english.json";
import vicMathematics from "./data/vic-mathematics.json";

/**
 * Curriculum knowledge base — every outcome (NSW) or content description
 * (Victoria) the platform can align a programme, assessment or quiz to,
 * with its official statement, band and years. Loaded from JSON pulled
 * off the NESA digital curriculum and the VCAA JSON:API on 2026-09-21
 * (see each file's `source`). Until this existed the AI recalled codes
 * from memory and nothing checked them; now the prompt is handed the
 * real list for the band and every returned code is validated against it
 * (`validateOutcomes`), with the official statement replacing whatever
 * title the model wrote.
 *
 * Server-only: the data is ~270 KB. Never import from a client component.
 *
 * NSW PDHPE carries two syllabuses: the 2018 one in force until the end
 * of 2026 (PDe-1 … PD5-11) and the 2024 K–6 / 7–10 syllabuses implemented
 * from 2027 (PHE-MSP-01 … PH5-SHP-01). `validFrom` / `validTo` pick the
 * right one by date, so the switch on 1 January 2027 needs no setting.
 */
export interface KbOutcome {
  code: string;
  /** Official statement. Empty for the three NESA Mathematics outcomes
   *  whose text is not published on the digital curriculum. */
  statement: string;
  bands: YearBand[];
  years: number[];
  strand?: string;
  substrand?: string;
  overarching?: boolean;
}

export interface KbSet {
  framework: FrameworkKey;
  subject: SubjectKey;
  syllabus: string;
  source: string;
  validFrom: string | null;
  validTo: string | null;
  outcomes: KbOutcome[];
}

const SETS: KbSet[] = [
  nswPdhpe2018,
  nswPdhpe2024,
  nswEnglish,
  nswMathematics,
  vicPdhpe,
  vicEnglish,
  vicMathematics,
] as KbSet[];

/** Every set, for tests and the reference page. */
export function allSets(): KbSet[] {
  return SETS;
}

/** Sets for a framework + subject in force on a date (default: today, Sydney). */
export function setsFor(
  framework: FrameworkDef | FrameworkKey,
  subject: SubjectDef | SubjectKey,
  on: string = sydneyTodayIso()
): KbSet[] {
  const fw = typeof framework === "string" ? framework : framework.key;
  const sk = typeof subject === "string" ? subject : subject.key;
  return SETS.filter(
    (s) =>
      s.framework === fw &&
      s.subject === sk &&
      (!s.validFrom || s.validFrom <= on) &&
      (!s.validTo || s.validTo >= on)
  );
}

/** Name of the syllabus document(s) in force, e.g. for prompts and PDFs. */
export function syllabusNameFor(
  framework: FrameworkDef | FrameworkKey,
  subject: SubjectDef | SubjectKey,
  on?: string
): string | null {
  const sets = setsFor(framework, subject, on);
  return sets.length > 0 ? sets.map((s) => s.syllabus).join(" / ") : null;
}

/** Which canonical bands a platform age band spans (3-5 → none: EYLF). */
export function bandsForAgeBand(ageBand: string): YearBand[] {
  switch (ageBand.trim()) {
    case "5-8":
      return ["Early Stage 1", "Stage 1"];
    case "8-12":
      return ["Stage 2", "Stage 3"];
    case "12-16":
      return ["Stage 4", "Stage 5"];
    default:
      return [];
  }
}

export interface OutcomesQuery {
  framework: FrameworkDef | FrameworkKey;
  subject: SubjectDef | SubjectKey;
  /** Restrict to these bands; omit for the whole syllabus. */
  bands?: YearBand[];
  /** Restrict to these school years (0 = K/Prep); narrower than bands. */
  years?: number[];
  on?: string;
  /** Drop outcomes with no published statement (default true). */
  requireStatement?: boolean;
}

/** Outcomes in force for a framework + subject, optionally by band/year. */
export function outcomesFor(q: OutcomesQuery): KbOutcome[] {
  const out: KbOutcome[] = [];
  for (const set of setsFor(q.framework, q.subject, q.on)) {
    for (const o of set.outcomes) {
      if (q.requireStatement !== false && !o.statement) continue;
      if (q.bands && q.bands.length > 0 && !o.bands.some((b) => q.bands!.includes(b))) continue;
      if (q.years && q.years.length > 0 && !o.years.some((y) => q.years!.includes(y))) continue;
      out.push(o);
    }
  }
  return out;
}

const INDEX: Map<string, { outcome: KbOutcome; set: KbSet }> = new Map();
for (const set of SETS) {
  for (const outcome of set.outcomes) {
    INDEX.set(normaliseCode(outcome.code), { outcome, set });
  }
}

/** Upper-case, trimmed, so "pde-1" and "PDe-1" meet. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Look a code up across every set (any framework, any date). */
export function findOutcome(code: string): { outcome: KbOutcome; set: KbSet } | null {
  return INDEX.get(normaliseCode(code)) ?? null;
}

/** Official statement for a code, or null when the code is unknown. */
export function officialStatement(code: string): string | null {
  const hit = findOutcome(code);
  return hit?.outcome.statement || null;
}

export interface ValidationResult {
  /** Outcomes that exist, with the official statement as `title`. */
  kept: CurriculumOutcome[];
  /** Codes the model wrote that are not in the knowledge base. */
  unknown: string[];
  /** Codes that exist but sit outside the requested band(s). */
  offBand: string[];
}

/**
 * Check what the model returned against the knowledge base. Bundled
 * codes ("PD1-6 / PD2-6") are split; each atomic code must exist. The
 * official statement replaces the model's title. Codes outside the
 * requested bands are dropped so a Year 3 lesson never carries a Stage 5
 * outcome. EYLF codes are passed through unchanged — there is no EYLF
 * set and childcare programmes are not the audience of this check.
 */
export function validateOutcomes(
  outcomes: CurriculumOutcome[] | undefined,
  opts: { bands?: YearBand[]; on?: string }
): ValidationResult {
  const kept: CurriculumOutcome[] = [];
  const unknown: string[] = [];
  const offBand: string[] = [];
  const seen = new Set<string>();
  for (const o of outcomes ?? []) {
    if (!o?.code) continue;
    const atomic = String(o.code)
      .split(/[\/,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const code of atomic) {
      const key = normaliseCode(code);
      if (seen.has(key)) continue;
      if (/^EYLF/i.test(code)) {
        seen.add(key);
        kept.push({ ...o, code });
        continue;
      }
      const hit = findOutcome(code);
      if (!hit) {
        unknown.push(code);
        continue;
      }
      // With a date, a real code from a syllabus not in force then is as
      // wrong as an invented one (a 2027 plan citing PD2-4, a 2026 plan
      // citing PH2-MSP-01). Without one, any published code passes — a
      // stored programme keeps the codes it was written with.
      if (opts.on && ((hit.set.validFrom && hit.set.validFrom > opts.on) || (hit.set.validTo && hit.set.validTo < opts.on))) {
        unknown.push(code);
        continue;
      }
      if (opts.bands && opts.bands.length > 0 && !hit.outcome.bands.some((b) => opts.bands!.includes(b))) {
        offBand.push(code);
        continue;
      }
      seen.add(key);
      kept.push({
        framework: hit.set.subject,
        code: hit.outcome.code,
        title: hit.outcome.statement || o.title,
        description: o.description ?? "",
      });
    }
  }
  return { kept, unknown, offBand };
}

/**
 * The list handed to the model: "CODE — statement" per line for the
 * bands in question, capped so a Victorian English band (≈60 content
 * descriptions) stays a few thousand tokens.
 */
export function promptOutcomeList(
  framework: FrameworkDef,
  subject: SubjectDef,
  bands: YearBand[],
  opts: { max?: number; on?: string } = {}
): string {
  const max = opts.max ?? 90;
  const list = outcomesFor({ framework, subject, bands, on: opts.on });
  const lines = list.slice(0, max).map((o) => {
    const band = o.bands.map((b) => framework.bandLabels[b]).join(" / ");
    const strand = o.strand ? ` [${o.strand}${o.substrand ? ` › ${o.substrand}` : ""}]` : "";
    return `- ${o.code} (${band})${strand} — ${o.statement}`;
  });
  return lines.join("\n");
}

/** Sizes per set — for the reference page and tests. */
export function kbSummary(): Array<{ framework: FrameworkKey; subject: SubjectKey; syllabus: string; count: number; validFrom: string | null; validTo: string | null }> {
  return SETS.map((s) => ({
    framework: s.framework,
    subject: s.subject,
    syllabus: s.syllabus,
    count: s.outcomes.length,
    validFrom: s.validFrom,
    validTo: s.validTo,
  }));
}

/** The framework a stored programme's codes were written against. */
export function frameworkOfOutcomes(outcomes: CurriculumOutcome[] | undefined): FrameworkDef | null {
  for (const o of outcomes ?? []) {
    const fw = o?.code ? frameworkForCode(o.code) : null;
    if (fw) return fw;
  }
  return null;
}

export { FRAMEWORKS, SUBJECTS };
