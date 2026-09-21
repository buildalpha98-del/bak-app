import { SPORTS } from "@/lib/types/enums";

/**
 * Subject registry (migration 089). PDHPE is where the platform started;
 * English and Mathematics reuse the same assessment templates, teacher
 * rating flow, report card and rollups. What differs per subject is the
 * word for a template's grouping ("Sport" / "Focus area" / "Strand"), its
 * options, and the programme-section headings. Anything that depends on
 * the *state* — band names, outcome-code prefixes, mark scale — lives in
 * lib/curriculum/frameworks.ts (migration 095).
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
    strandLabel: "Sport",
    strandOptions: SPORTS,
    resourceOptions: [],
    programSections: SPORT_SECTIONS,
  },
  english: {
    key: "english",
    label: "English",
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

/**
 * PDHPE has two halves. A coach delivers the movement half as a sport
 * session; the classroom half — health, wellbeing, relationships, safety
 * — is a teacher's lesson, shaped like an English or Maths one. It stays
 * subject "pdhpe" (same syllabus, same report-card subject); what marks
 * it as a lesson is the focus area sitting where a sport would. None of
 * these names is a sport, so the strand alone decides.
 *
 * The first five are the strand names term plans use (NSW 2018 samples,
 * the Victorian curriculum, the NSW 2024 focus areas), so a plan's
 * "Write lesson" link prefills.
 */
export const PDHPE_HEALTH_FOCUS = [
  "Personal development and health",
  "Personal, social and community health",
  // The 2024 NSW K–6 syllabus's classroom focus areas (in force 2027).
  "Respectful relationships and safety",
  "Identity, health and wellbeing",
  "Self-management and interpersonal skills",
  "Health, wellbeing and relationships",
  "Healthy, safe and active lifestyles",
  "Personal safety and protective behaviours",
  "Respectful relationships",
  "Emotions, resilience and mental health",
  "Growth, change and identity",
  "Nutrition and healthy choices",
  "Road, water and sun safety",
  "Online safety",
  "Medicines, drugs and help-seeking",
] as const;

/**
 * The lesson focus a term plan's strand points at. Plans name strands
 * freely — "Personal development and health — Identity, health and
 * wellbeing / Self-management…" — so match the most specific focus area
 * the strand mentions, not the whole string.
 */
export function lessonFocusForStrand(def: SubjectDef, strand: string | null | undefined): string | null {
  const text = (strand ?? "").toLowerCase();
  if (!text) return null;
  const hits = def.strandOptions.filter((o) => text.includes(o.toLowerCase()));
  if (hits.length === 0) return null;
  // Prefer a specific focus area over the umbrella strand name.
  const umbrella = new Set<string>(["Personal development and health", "Personal, social and community health"]);
  return hits.find((h) => !umbrella.has(h)) ?? hits[0];
}

/** The PDHPE classroom lesson: PDHPE's key and syllabus, a lesson's shape. */
export const PDHPE_HEALTH: SubjectDef = {
  key: "pdhpe",
  label: "PDHPE",
  strandLabel: "Focus area",
  strandOptions: PDHPE_HEALTH_FOCUS,
  resourceOptions: [
    "Whiteboard",
    "Interactive display",
    "Scenario cards",
    "Picture books",
    "Chart paper and markers",
    "Sticky notes",
    "Student workbooks",
    "Body outline / feelings charts",
    "Food models or packaging",
    "Safety signs and posters",
    "Role-play props",
    "Devices (tablets / laptops)",
  ],
  programSections: LESSON_SECTIONS,
};

/** Lesson-shaped (teacher in a classroom) rather than a coach's session. */
export function isLessonDef(def: SubjectDef): boolean {
  return def.programSections === LESSON_SECTIONS;
}

/** A stored programme is a classroom lesson: any English / Maths one, or
 *  a PDHPE one whose strand is a health focus area rather than a sport. */
export function isClassroomLesson(subject: string | null | undefined, strand: string | null | undefined): boolean {
  const def = subjectOf(subject);
  if (def.key !== "pdhpe") return true;
  return (PDHPE_HEALTH_FOCUS as readonly string[]).includes((strand ?? "").trim());
}

/** The definition a lesson is generated and rendered with. */
export function lessonDefFor(subject: string | null | undefined, strand?: string | null): SubjectDef {
  const def = subjectOf(subject);
  return def.key === "pdhpe" && isClassroomLesson(subject, strand) ? PDHPE_HEALTH : def;
}

/** Section headings for a programme, from its stored subject key and —
 *  for PDHPE, where it decides session vs lesson — its strand. */
export function programSectionsFor(
  subject: string | null | undefined,
  strand?: string | null
): ProgramSectionLabels {
  return lessonDefFor(subject, strand).programSections;
}

export const DEFAULT_SUBJECT: SubjectKey = "pdhpe";

export function isSubjectKey(value: unknown): value is SubjectKey {
  return typeof value === "string" && (SUBJECT_KEYS as readonly string[]).includes(value);
}

/** Tolerant lookup: unknown or missing → PDHPE (every pre-089 row). */
export function subjectOf(value: string | null | undefined): SubjectDef {
  return SUBJECTS[isSubjectKey(value) ? value : DEFAULT_SUBJECT];
}
