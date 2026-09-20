import { sydneyTodayIso } from "@/lib/utils/sydney-time";
import type { FrameworkDef, FrameworkKey, YearBand } from "./frameworks";
import type { SubjectDef, SubjectKey } from "./subjects";
import pdhpe18Es1 from "./exemplars/nsw-pdhpe-2018-early-stage-1.json";
import pdhpe18S1 from "./exemplars/nsw-pdhpe-2018-stage-1.json";
import pdhpe18S2 from "./exemplars/nsw-pdhpe-2018-stage-2.json";
import pdhpe18S3 from "./exemplars/nsw-pdhpe-2018-stage-3.json";
import pdhpe24S4 from "./exemplars/nsw-pdhpe-2024-stage-4.json";
import englishS1 from "./exemplars/nsw-english-stage-1.json";
import englishS2 from "./exemplars/nsw-english-stage-2.json";
import englishS3 from "./exemplars/nsw-english-stage-3.json";
import mathsS1 from "./exemplars/nsw-mathematics-stage-1.json";
import mathsS2 from "./exemplars/nsw-mathematics-stage-2.json";
import mathsS3 from "./exemplars/nsw-mathematics-stage-3.json";

/**
 * Exemplar scope and sequences — the NSW Department of Education's own
 * sample scope and sequences (education.nsw.gov.au), one per stage and
 * subject, converted from the published DOCX/XLSX on 2026-09-21. They
 * are what a head of department expects a term plan to look like: unit
 * titles, the weeks each runs, the outcomes it addresses, key inquiry
 * questions, where assessment sits. The term-plan generator shows the
 * model the sample for the same stage, subject and term as a few-shot
 * reference ("match this structure and rigour"), while the knowledge
 * base supplies the only codes it may use.
 *
 * Two organisations: PDHPE and Mathematics samples are unit-based
 * (a unit per strand per term, or five learning sequences a term);
 * English samples are focus-area based (per outcome, which content
 * points each term introduces). Both serialise to prompt text.
 *
 * Server-only (~250 KB). Never import from a client component.
 *
 * Victoria: the VCAA publishes no sample school scope and sequences, so
 * a Victorian school's plan is modelled on the NSW sample for the same
 * band as a *structural* reference only — the prompt says so, and the
 * codes still come from the Victorian knowledge base.
 */
export interface ExemplarUnit {
  title: string;
  strand: string;
  weeks?: string;
  description?: string;
  inquiryQuestions?: string[];
  outcomes: string[];
  focusAreas?: string[];
  contentGroups?: string[];
  assessment?: string;
  opportunities?: string[];
}

export interface ExemplarFocusArea {
  focusArea: string;
  outcome: string;
  points: string[];
  phase?: string;
}

export interface ExemplarTerm {
  term: number;
  units?: ExemplarUnit[];
  focusAreas?: ExemplarFocusArea[];
}

export interface ExemplarVariant {
  /** "Even year", "Year A", "Year 7", "Single year"… */
  label: string;
  terms: ExemplarTerm[];
}

export interface ExemplarDoc {
  framework: FrameworkKey;
  subject: SubjectKey;
  syllabus: string;
  validFrom?: string;
  validTo?: string;
  band: YearBand;
  organisation: "units" | "focus-areas";
  source: string;
  variants: ExemplarVariant[];
}

const DOCS: ExemplarDoc[] = [
  pdhpe18Es1,
  pdhpe18S1,
  pdhpe18S2,
  pdhpe18S3,
  pdhpe24S4,
  englishS1,
  englishS2,
  englishS3,
  mathsS1,
  mathsS2,
  mathsS3,
] as ExemplarDoc[];

export function allExemplars(): ExemplarDoc[] {
  return DOCS;
}

export interface ExemplarMatch {
  doc: ExemplarDoc;
  /** True when the sample is from another framework (Victoria has none). */
  structuralOnly: boolean;
}

/**
 * The best sample for a framework, subject and band on a date. Same
 * framework first; else the NSW sample for the band as structure only.
 * Null when no band has a sample (Stage 5, secondary English/Maths).
 */
export function exemplarFor(
  framework: FrameworkDef | FrameworkKey,
  subject: SubjectDef | SubjectKey,
  band: YearBand,
  on: string = sydneyTodayIso()
): ExemplarMatch | null {
  const fw = typeof framework === "string" ? framework : framework.key;
  const sk = typeof subject === "string" ? subject : subject.key;
  const inForce = (d: ExemplarDoc) => (!d.validFrom || d.validFrom <= on) && (!d.validTo || d.validTo >= on);
  const same = DOCS.find((d) => d.framework === fw && d.subject === sk && d.band === band && inForce(d));
  if (same) return { doc: same, structuralOnly: false };
  const other = DOCS.find((d) => d.subject === sk && d.band === band && inForce(d));
  return other ? { doc: other, structuralOnly: true } : null;
}

/** Nearest band with a sample when the exact one has none (Stage 5 → Stage 4). */
export function nearestExemplarFor(
  framework: FrameworkDef | FrameworkKey,
  subject: SubjectDef | SubjectKey,
  bands: YearBand[],
  on?: string
): ExemplarMatch | null {
  const order: YearBand[] = ["Early Stage 1", "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5"];
  for (const b of bands) {
    const hit = exemplarFor(framework, subject, b, on);
    if (hit) return hit;
  }
  const idx = bands.map((b) => order.indexOf(b)).filter((i) => i >= 0);
  if (idx.length === 0) return null;
  const centre = Math.max(...idx);
  const byDistance = order
    .map((b, i) => ({ b, d: Math.abs(i - centre) }))
    .sort((a, b) => a.d - b.d);
  for (const { b } of byDistance) {
    const hit = exemplarFor(framework, subject, b, on);
    if (hit) return hit;
  }
  return null;
}

/**
 * Serialise one term of a sample as prompt text. Units print title,
 * strand, weeks, description, outcomes, assessment; focus-area samples
 * print each focus area's content points. Capped by characters so a
 * Mathematics term (five learning sequences with content groups) stays
 * a couple of thousand tokens.
 */
export function exemplarPromptText(
  match: ExemplarMatch,
  opts: { term?: number | null; variant?: string; maxChars?: number } = {}
): string {
  const { doc } = match;
  const max = opts.maxChars ?? 6000;
  // Focus-area samples (English) hold stage-wide tables under "Single
  // year" and year-specific tables under "Year N": a term is the union.
  const specific =
    doc.variants.find((v) => opts.variant && v.label === opts.variant) ??
    doc.variants.find((v) => v.label !== "Single year") ??
    doc.variants[0];
  if (!specific) return "";
  const termNo =
    opts.term != null && doc.variants.some((v) => v.terms.some((t) => t.term === opts.term))
      ? opts.term
      : specific.terms[0]?.term ?? 1;
  const pick = (v: ExemplarVariant | undefined) => v?.terms.find((t) => t.term === termNo);
  const term: ExemplarTerm | undefined =
    doc.organisation === "focus-areas"
      ? {
          term: termNo,
          focusAreas: [
            ...(pick(doc.variants.find((v) => v.label === "Single year"))?.focusAreas ?? []),
            ...(specific.label !== "Single year" ? pick(specific)?.focusAreas ?? [] : []),
          ],
        }
      : pick(specific) ?? specific.terms[0];
  if (!term) return "";
  const variant = specific;
  const lines: string[] = [
    `Sample: ${doc.syllabus} — ${doc.band}${variant.label !== "Single year" ? ` (${variant.label})` : ""}, Term ${term.term}. Source: ${doc.source.split(" — ")[0]}.`,
  ];
  if (term.units) {
    term.units.forEach((u, i) => {
      lines.push(`Unit ${i + 1}: ${u.title}${u.strand ? ` [${u.strand}]` : ""}${u.weeks ? ` — ${u.weeks}` : ""}`);
      if (u.description) lines.push(`  ${u.description}`);
      if (u.inquiryQuestions?.length) lines.push(`  Key inquiry questions: ${u.inquiryQuestions.join(" | ")}`);
      lines.push(`  Outcomes: ${u.outcomes.join(", ")}`);
      if (u.focusAreas?.length) lines.push(`  Focus areas: ${u.focusAreas.join("; ")}`);
      if (u.contentGroups?.length) lines.push(`  Content: ${u.contentGroups.slice(0, 6).join("; ")}`);
      if (u.assessment) lines.push(`  Assessment: ${u.assessment}`);
    });
  } else if (term.focusAreas) {
    for (const fa of term.focusAreas) {
      lines.push(`${fa.focusArea} (${fa.outcome})${fa.phase ? ` — ${fa.phase} in term` : ""}: ${fa.points.slice(0, 8).join("; ")}`);
    }
  }
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > max) break;
    out += (out ? "\n" : "") + l;
  }
  return out;
}

/** Every outcome code a sample cites (for tests: all must exist in the knowledge base). */
export function exemplarCodes(doc: ExemplarDoc): string[] {
  const codes = new Set<string>();
  for (const v of doc.variants) {
    for (const t of v.terms) {
      for (const u of t.units ?? []) u.outcomes.forEach((c) => codes.add(c));
      for (const f of t.focusAreas ?? []) codes.add(f.outcome);
    }
  }
  return Array.from(codes);
}
