import type { NswStage } from "@/lib/schools/year-groups";
import { SPORTS } from "@/lib/types/enums";

/**
 * Subject registry (migration 089). PDHPE is where the platform started;
 * English and Mathematics reuse the same assessment templates, teacher
 * rating flow, report card and rollups. What differs per subject is the
 * NSW syllabus outcome-code prefixes per stage, the word for a template's
 * grouping ("Sport" / "Focus area" / "Strand") and its options.
 */
export const SUBJECT_KEYS = ["pdhpe", "english", "mathematics"] as const;
export type SubjectKey = (typeof SUBJECT_KEYS)[number];

/** What the five programme sections are called for a subject. The JSON
 *  keys never change (warmUp, skillDevelopment, modifiedGame, coolDown,
 *  equipmentNeeded) so every reader — editor, PDFs, Scope & Sequence,
 *  coach app, portal — keeps working; only the headings differ. */
export interface ProgramSectionLabels {
  warmUp: string;
  skillDevelopment: string;
  skillItem: string;
  modifiedGame: string;
  coolDown: string;
  equipment: string;
  session: string;
  tip: string;
}

export interface SubjectDef {
  key: SubjectKey;
  label: string;
  fullName: string;
  /** Upper-case prefix per NSW stage, e.g. Stage 2 English → "EN2-". */
  stagePrefixes: Record<NswStage, string>;
  /** Every code of this subject starts with one of these (upper-case). */
  codeFamily: string;
  /** Label for the template grouping the `sport` column carries. */
  strandLabel: string;
  strandOptions: readonly string[];
  /** What a lesson needs — replaces the equipment picker for non-PDHPE. */
  resourceOptions: readonly string[];
  programSections: ProgramSectionLabels;
}

const SPORT_SECTIONS: ProgramSectionLabels = {
  warmUp: "Warm-up",
  skillDevelopment: "Skill development",
  skillItem: "Drill",
  modifiedGame: "Modified game",
  coolDown: "Cool-down",
  equipment: "Equipment",
  session: "session",
  tip: "Coaching tip",
};

const LESSON_SECTIONS: ProgramSectionLabels = {
  warmUp: "Hook / tuning in",
  skillDevelopment: "Explicit teaching & guided practice",
  skillItem: "Activity",
  modifiedGame: "Independent task",
  coolDown: "Reflection / plenary",
  equipment: "Resources",
  session: "lesson",
  tip: "Teaching tip",
};

export const SUBJECTS: Record<SubjectKey, SubjectDef> = {
  pdhpe: {
    key: "pdhpe",
    label: "PDHPE",
    fullName: "Personal Development, Health and Physical Education",
    stagePrefixes: {
      "Early Stage 1": "PDE-",
      "Stage 1": "PD1-",
      "Stage 2": "PD2-",
      "Stage 3": "PD3-",
    },
    codeFamily: "PD",
    strandLabel: "Sport",
    strandOptions: SPORTS,
    resourceOptions: [],
    programSections: SPORT_SECTIONS,
  },
  english: {
    key: "english",
    label: "English",
    fullName: "English K–6",
    stagePrefixes: {
      "Early Stage 1": "ENE-",
      "Stage 1": "EN1-",
      "Stage 2": "EN2-",
      "Stage 3": "EN3-",
    },
    codeFamily: "EN",
    strandLabel: "Focus area",
    strandOptions: [
      "Oral language and communication",
      "Vocabulary",
      "Phonological awareness",
      "Phonic knowledge",
      "Reading fluency",
      "Reading comprehension",
      "Creating written texts",
      "Spelling",
      "Handwriting and digital transcription",
      "Understanding and responding to literature",
    ],
    resourceOptions: [
      "Whiteboard",
      "Picture books",
      "Decodable readers",
      "Class novel",
      "Mini whiteboards",
      "Word cards",
      "Sentence strips",
      "Writing books",
      "Anchor charts",
      "Graphic organisers",
      "Sound / letter tiles",
      "Interactive display",
    ],
    programSections: LESSON_SECTIONS,
  },
  mathematics: {
    key: "mathematics",
    label: "Mathematics",
    fullName: "Mathematics K–6",
    stagePrefixes: {
      "Early Stage 1": "MAE-",
      "Stage 1": "MA1-",
      "Stage 2": "MA2-",
      "Stage 3": "MA3-",
    },
    codeFamily: "MA",
    strandLabel: "Strand",
    strandOptions: [
      "Number and algebra",
      "Measurement and space",
      "Statistics and probability",
      "Working mathematically",
    ],
    resourceOptions: [
      "Whiteboard",
      "Mini whiteboards",
      "Counters",
      "Unifix / linking cubes",
      "Base-ten blocks",
      "Number lines",
      "Hundreds chart",
      "Dice",
      "Playing cards",
      "Rulers / measuring tapes",
      "Pattern blocks",
      "Ten frames",
      "Interactive display",
    ],
    programSections: LESSON_SECTIONS,
  },
};

/** Section headings for a programme, from its stored subject key. */
export function programSectionsFor(subject: string | null | undefined): ProgramSectionLabels {
  return subjectOf(subject).programSections;
}

export const DEFAULT_SUBJECT: SubjectKey = "pdhpe";

export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === "string" && (SUBJECT_KEYS as readonly string[]).includes(value);
}

/** Tolerant lookup: unknown or missing → PDHPE (every pre-089 row). */
export function subjectOf(value: string | null | undefined): SubjectDef {
  return SUBJECTS[isSubjectKey(value) ? value : DEFAULT_SUBJECT];
}

/** Which subject an outcome code belongs to, by its family prefix. */
export function subjectForCode(code: string): SubjectDef | null {
  const upper = code.toUpperCase();
  for (const key of SUBJECT_KEYS) {
    if (upper.startsWith(SUBJECTS[key].codeFamily)) return SUBJECTS[key];
  }
  return null;
}

/** Report-card heading for a subject's outcome list. */
export function outcomesHeading(subject: SubjectDef): string {
  return `NSW ${subject.label} Outcomes Addressed`;
}
