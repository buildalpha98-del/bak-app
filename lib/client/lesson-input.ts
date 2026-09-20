// Pure validation for a teacher's lesson request (migration 091). Kept
// out of the route so the rules are testable without Next.

import { SUBJECTS, isSubjectKey, type SubjectDef } from "@/lib/curriculum/subjects";

export const LESSON_SUBJECT_KEYS = ["english", "mathematics"] as const;
export const LESSON_DURATIONS = [30, 45, 60] as const;
export const LESSON_AGE_BANDS = ["3-5", "5-8", "8-12"] as const;

export interface LessonInput {
  subject: SubjectDef;
  focus: string;
  ageBand: (typeof LESSON_AGE_BANDS)[number];
  durationMinutes: (typeof LESSON_DURATIONS)[number];
  learningFocus?: string;
  resources: string[];
  classId: string | null;
}

export function validateLessonInput(
  body: Record<string, unknown>
): { ok: true; value: LessonInput } | { ok: false; error: string } {
  const subjectKey = typeof body.subject === "string" ? body.subject : "";
  if (!isSubjectKey(subjectKey) || !(LESSON_SUBJECT_KEYS as readonly string[]).includes(subjectKey)) {
    return { ok: false, error: "Pick English or Mathematics." };
  }
  const subject = SUBJECTS[subjectKey];

  const focus = typeof body.focus === "string" ? body.focus.trim() : "";
  if (!subject.strandOptions.includes(focus)) {
    return { ok: false, error: `Pick a ${subject.strandLabel.toLowerCase()}.` };
  }

  const ageBand = typeof body.ageBand === "string" ? body.ageBand : "";
  if (!(LESSON_AGE_BANDS as readonly string[]).includes(ageBand)) {
    return { ok: false, error: "Pick a class." };
  }

  const duration = Number(body.durationMinutes);
  if (!(LESSON_DURATIONS as readonly number[]).includes(duration)) {
    return { ok: false, error: "Pick a lesson length." };
  }

  const learningFocus =
    typeof body.learningFocus === "string" ? body.learningFocus.trim().slice(0, 200) : "";

  const resources = Array.isArray(body.resources)
    ? (body.resources as unknown[]).filter(
        (r): r is string => typeof r === "string" && subject.resourceOptions.includes(r)
      )
    : [];
  if (resources.length === 0) {
    return { ok: false, error: "Pick at least one resource." };
  }

  const classId = typeof body.classId === "string" && body.classId ? body.classId : null;

  return {
    ok: true,
    value: {
      subject,
      focus,
      ageBand: ageBand as LessonInput["ageBand"],
      durationMinutes: duration as LessonInput["durationMinutes"],
      learningFocus: learningFocus || undefined,
      resources: Array.from(new Set(resources)),
      classId,
    },
  };
}
