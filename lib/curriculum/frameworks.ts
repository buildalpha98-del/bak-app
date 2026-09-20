import { NSW_STAGES, yearGroupToStage, type NswStage } from "@/lib/schools/year-groups";
import { SUBJECTS, SUBJECT_KEYS, type SubjectDef, type SubjectKey } from "./subjects";

/**
 * Curriculum frameworks (migration 095). A school follows one framework:
 * the NSW syllabus (NESA — Early Stage 1 → Stage 5, codes like PD2-4,
 * EN3-RECOM-01) or the Victorian Curriculum F–10 v2.0 (VCAA — Foundation
 * and Levels 1–10, content descriptions like VC2HP4M01, VC2E3LY02).
 *
 * The *subject* registry (subjects.ts) holds what is the same in both
 * states — strands, resources, programme-section headings. This file
 * holds what differs: how the six canonical year bands are named, which
 * code family each subject's outcomes use, how a report card's mark scale
 * reads, and how the AI prompts should talk about the curriculum.
 *
 * The canonical band ids are the NSW stage strings from year-groups.ts
 * ("Stage 2" …). Both frameworks group years the same way (K, 1–2, 3–4,
 * 5–6, 7–8, 9–10), so a band id is framework-neutral data; only its
 * label is not. Never print a band id — print `bandLabel(band)`.
 */
export const FRAMEWORK_KEYS = ["nsw", "vic"] as const;
export type FrameworkKey = (typeof FRAMEWORK_KEYS)[number];

/** Canonical year band shared by every framework. */
export type YearBand = NswStage;
export const YEAR_BANDS = NSW_STAGES;

export interface FrameworkDef {
  key: FrameworkKey;
  /** "NSW syllabus" / "Victorian Curriculum" — for selects and copy. */
  label: string;
  /** Long form for document intros. */
  fullLabel: string;
  authority: string;
  /** Word for a band in headings: "Stage" / "Level". */
  bandNoun: string;
  /** Per-band display label: "Stage 2" / "Levels 3–4". */
  bandLabels: Record<YearBand, string>;
  /** What the first school year is called: "Kindergarten" / "Foundation (Prep)". */
  foundationLabel: string;
  /** The word for a curriculum item: "outcome" / "content description". */
  outcomeNoun: string;
  /** Upper-case prefix every code of a subject starts with, e.g. "PD" / "VC2HP". */
  codeFamily: Record<SubjectKey, string>;
  /**
   * Code prefixes that belong to a band for a subject. NSW has one per
   * stage ("PD2-"); the Victorian Curriculum's English and Mathematics
   * are per level so a band carries two ("VC2E3", "VC2E4"). Matching is
   * digit-boundary aware — "VC2E1" never claims "VC2E10…".
   */
  bandPrefixes: Record<SubjectKey, Record<YearBand, readonly string[]>>;
  /** Name of the syllabus document for a subject, for prompts and intros. */
  documentName: (subject: SubjectDef) => string;
  /** Subject as the framework names it ("PDHPE" vs "Health and Physical Education"). */
  subjectLabel: (subject: SubjectDef) => string;
  /** Report-card heading for a subject's outcome list. */
  outcomesHeading: (subject: SubjectDef) => string;
  /** Five-point achievement scale, 5 → 1. */
  markScale: Record<number, string>;
  /** Footnote under the marks on a report card. */
  markScaleNote: string;
  /** AI prompt persona for a subject teacher. */
  persona: (subject: SubjectDef) => string;
  /** AI prompt paragraph: which codes to use for a lesson/session. */
  alignmentGuidance: (subject: SubjectDef) => string;
}

const NSW_BAND_LABELS: Record<YearBand, string> = {
  "Early Stage 1": "Early Stage 1",
  "Stage 1": "Stage 1",
  "Stage 2": "Stage 2",
  "Stage 3": "Stage 3",
  "Stage 4": "Stage 4",
  "Stage 5": "Stage 5",
};

const VIC_BAND_LABELS: Record<YearBand, string> = {
  "Early Stage 1": "Foundation",
  "Stage 1": "Levels 1–2",
  "Stage 2": "Levels 3–4",
  "Stage 3": "Levels 5–6",
  "Stage 4": "Levels 7–8",
  "Stage 5": "Levels 9–10",
};

function nswPrefixes(family: string): Record<YearBand, readonly string[]> {
  return {
    "Early Stage 1": [`${family}E-`],
    "Stage 1": [`${family}1-`],
    "Stage 2": [`${family}2-`],
    "Stage 3": [`${family}3-`],
    "Stage 4": [`${family}4-`],
    "Stage 5": [`${family}5-`],
  };
}

/** VIC HPE is banded (VC2HP2… = Levels 1–2, VC2HP10… = Levels 9–10). */
const VIC_HPE_PREFIXES: Record<YearBand, readonly string[]> = {
  "Early Stage 1": ["VC2HPF"],
  "Stage 1": ["VC2HP2"],
  "Stage 2": ["VC2HP4"],
  "Stage 3": ["VC2HP6"],
  "Stage 4": ["VC2HP8"],
  "Stage 5": ["VC2HP10"],
};

/** VIC English/Maths are per level; a band carries both of its levels. */
function vicLevelPrefixes(family: string): Record<YearBand, readonly string[]> {
  return {
    "Early Stage 1": [`${family}F`],
    "Stage 1": [`${family}1`, `${family}2`],
    "Stage 2": [`${family}3`, `${family}4`],
    "Stage 3": [`${family}5`, `${family}6`],
    "Stage 4": [`${family}7`, `${family}8`],
    "Stage 5": [`${family}9`, `${family}10`],
  };
}

export const NSW_MARK_SCALE: Record<number, string> = {
  5: "Outstanding",
  4: "High",
  3: "Sound",
  2: "Basic",
  1: "Limited",
};

export const VIC_MARK_SCALE: Record<number, string> = {
  5: "Well above",
  4: "Above",
  3: "At level",
  2: "Below",
  1: "Well below",
};

export const FRAMEWORKS: Record<FrameworkKey, FrameworkDef> = {
  nsw: {
    key: "nsw",
    label: "NSW syllabus",
    fullLabel: "NSW syllabus (NESA)",
    authority: "NESA",
    bandNoun: "Stage",
    bandLabels: NSW_BAND_LABELS,
    foundationLabel: "Kindergarten",
    outcomeNoun: "outcome",
    codeFamily: { pdhpe: "PD", english: "EN", mathematics: "MA" },
    bandPrefixes: {
      pdhpe: nswPrefixes("PD"),
      english: nswPrefixes("EN"),
      mathematics: nswPrefixes("MA"),
    },
    documentName: (s) =>
      s.key === "pdhpe" ? "NSW PDHPE K–10 syllabus" : `NSW ${s.label} K–10 syllabus`,
    subjectLabel: (s) => s.label,
    outcomesHeading: (s) => `NSW ${s.label} Outcomes Addressed`,
    markScale: NSW_MARK_SCALE,
    markScaleNote:
      "Achievement scale: Outstanding (5) · High (4) · Sound (3) · Basic (2) · Limited (1)",
    persona: (s) =>
      s.key === "pdhpe"
        ? "NSW PDHPE teacher"
        : `NSW ${s.label} teacher (K–10)`,
    alignmentGuidance: (s) =>
      `Use ${FRAMEWORKS.nsw.documentName(s)} outcomes with real outcome codes for the band (${Object.values(
        FRAMEWORKS.nsw.bandPrefixes[s.key]
      )
        .flat()
        .join(", ")}…). Early Stage 1 = Kindergarten, Stage 1 = Years 1–2, Stage 2 = Years 3–4, Stage 3 = Years 5–6, Stage 4 = Years 7–8, Stage 5 = Years 9–10.`,
  },
  vic: {
    key: "vic",
    label: "Victorian Curriculum",
    fullLabel: "Victorian Curriculum F–10 v2.0 (VCAA)",
    authority: "VCAA",
    bandNoun: "Level",
    bandLabels: VIC_BAND_LABELS,
    foundationLabel: "Foundation (Prep)",
    outcomeNoun: "content description",
    codeFamily: { pdhpe: "VC2HP", english: "VC2E", mathematics: "VC2M" },
    bandPrefixes: {
      pdhpe: VIC_HPE_PREFIXES,
      english: vicLevelPrefixes("VC2E"),
      mathematics: vicLevelPrefixes("VC2M"),
    },
    documentName: (s) =>
      `Victorian Curriculum F–10 v2.0 ${FRAMEWORKS.vic.subjectLabel(s)}`,
    subjectLabel: (s) => (s.key === "pdhpe" ? "Health and Physical Education" : s.label),
    outcomesHeading: (s) =>
      `Victorian Curriculum ${s.key === "pdhpe" ? "HPE" : s.label} Content Descriptions Addressed`,
    markScale: VIC_MARK_SCALE,
    markScaleNote:
      "Achievement against the expected level: Well above (5) · Above (4) · At level (3) · Below (2) · Well below (1)",
    persona: (s) =>
      s.key === "pdhpe"
        ? "Victorian Health and Physical Education teacher"
        : `Victorian ${s.label} teacher (F–10)`,
    alignmentGuidance: (s) =>
      s.key === "pdhpe"
        ? "Use Victorian Curriculum F–10 v2.0 Health and Physical Education content descriptions with their real codes. HPE is banded: VC2HPF… = Foundation, VC2HP2… = Levels 1–2, VC2HP4… = Levels 3–4, VC2HP6… = Levels 5–6, VC2HP8… = Levels 7–8, VC2HP10… = Levels 9–10; the strand letter follows the band (M = Movement and Physical Activity, P = Personal, Social and Community Health), e.g. VC2HP4M01. Include a code for every band the age group covers."
        : `Use Victorian Curriculum F–10 v2.0 ${s.label} content descriptions with their real codes. ${s.label} is per level: ${FRAMEWORKS.vic.codeFamily[s.key]}F… = Foundation, ${FRAMEWORKS.vic.codeFamily[s.key]}1… = Level 1 … ${FRAMEWORKS.vic.codeFamily[s.key]}10… = Level 10 (e.g. ${
            s.key === "english" ? "VC2E3LA01, VC2E4LY02" : "VC2M3N01, VC2M4M02"
          }). Include a code for every level the age group covers.`,
  },
};

export const DEFAULT_FRAMEWORK: FrameworkKey = "nsw";

export function isFrameworkKey(value: unknown): value is FrameworkKey {
  return typeof value === "string" && (FRAMEWORK_KEYS as readonly string[]).includes(value);
}

/** Tolerant lookup: unknown or missing → NSW (every pre-095 row). */
export function frameworkOf(value: string | null | undefined): FrameworkDef {
  return FRAMEWORKS[isFrameworkKey(value) ? value : DEFAULT_FRAMEWORK];
}

/**
 * Does a code sit under a prefix? Plain startsWith, except that a prefix
 * ending in a digit must not be continued by another digit — "VC2E1"
 * covers VC2E1LA01 but not VC2E10LA01.
 */
export function codeHasPrefix(code: string, prefix: string): boolean {
  const upper = code.toUpperCase();
  const p = prefix.toUpperCase();
  if (!upper.startsWith(p)) return false;
  if (!/\d$/.test(p)) return true;
  const next = upper.charAt(p.length);
  return next === "" || !/\d/.test(next);
}

/** Which subject an outcome code belongs to, across every framework. */
export function subjectForCode(code: string): SubjectDef | null {
  const upper = code.toUpperCase();
  // Longest family first so "VC2HP" is tested before "VC2E"/"VC2M"
  // would be, and neither NSW family can shadow a VC2 code.
  const families: Array<{ family: string; subject: SubjectKey }> = [];
  for (const fw of FRAMEWORK_KEYS) {
    for (const key of SUBJECT_KEYS) {
      families.push({ family: FRAMEWORKS[fw].codeFamily[key], subject: key });
    }
  }
  families.sort((a, b) => b.family.length - a.family.length);
  const hit = families.find((f) => upper.startsWith(f.family));
  return hit ? SUBJECTS[hit.subject] : null;
}

/** Which framework a code was written against, by its family. */
export function frameworkForCode(code: string): FrameworkDef | null {
  const upper = code.toUpperCase();
  if (upper.startsWith("VC2")) return FRAMEWORKS.vic;
  for (const key of SUBJECT_KEYS) {
    if (upper.startsWith(FRAMEWORKS.nsw.codeFamily[key])) return FRAMEWORKS.nsw;
  }
  return null;
}

/** Does a code belong to a band of a subject under this framework? */
export function codeInBand(
  framework: FrameworkDef,
  subject: SubjectDef,
  band: YearBand,
  code: string
): boolean {
  return framework.bandPrefixes[subject.key][band].some((p) => codeHasPrefix(code, p));
}

/** Framework-labelled band for a class year group ("Levels 3–4"), null for rooms. */
export function bandLabelForYearGroup(framework: FrameworkDef, yearGroup: string): string | null {
  const band = yearGroupToStage(yearGroup);
  return band ? framework.bandLabels[band] : null;
}

/** Combine class year groups into one band label, syllabus order, deduped. */
export function bandsLabelForYearGroups(
  framework: FrameworkDef,
  yearGroups: string[]
): string | null {
  const bands = YEAR_BANDS.filter((band) =>
    yearGroups.some((yg) => yearGroupToStage(yg) === band)
  );
  return bands.length > 0 ? bands.map((b) => framework.bandLabels[b]).join(", ") : null;
}

/**
 * Approximate band label for a platform age band — the fallback when a
 * session isn't targeted at specific classes. Bands straddle band
 * boundaries, so the label is a range, and "3-5" (pre-school) maps to
 * none. Class-targeted sessions should use bandLabelForYearGroup.
 */
export function ageBandToBandLabel(
  framework: FrameworkDef,
  band: string | null | undefined
): string | null {
  const L = framework.bandLabels;
  switch ((band ?? "").trim()) {
    case "5-8":
      return `${L["Early Stage 1"]} – ${L["Stage 1"]}`;
    case "8-12":
      return `${L["Stage 2"]} – ${L["Stage 3"]}`;
    case "12-16":
      return `${L["Stage 4"]} – ${L["Stage 5"]}`;
    default:
      return null;
  }
}

/** "By Stage (NSW PDHPE)" / "By Level (Victorian Curriculum HPE)". */
export function bandSummaryHeading(framework: FrameworkDef): string {
  return framework.key === "vic"
    ? "By Level (Victorian Curriculum HPE)"
    : "By Stage (NSW PDHPE)";
}

/** Word for a percentage on the framework's scale, matching the report card. */
export function quizBandFor(framework: FrameworkDef, percent: number): string {
  const s = framework.markScale;
  if (percent >= 90) return s[5];
  if (percent >= 75) return s[4];
  if (percent >= 50) return s[3];
  if (percent >= 25) return s[2];
  return s[1];
}
