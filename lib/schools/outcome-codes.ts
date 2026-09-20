import type { NswStage } from "./year-groups";
import { SUBJECTS, subjectForCode, type SubjectDef } from "@/lib/curriculum/subjects";

/**
 * Programme `curriculumOutcomes` codes arrive as the AI wrote them —
 * frequently a multi-stage bundle in one string ("PDe-1 / PD1-6 / PD2-6",
 * or the same with no spaces) — so a naive dedupe by string prints the
 * same outcome several times on a report card. Split every bundle into
 * atomic codes and keep the first title seen for each.
 */
export interface OutcomeEntry {
  code: string;
  title: string;
}

export function splitOutcomeCode(code: string): string[] {
  return code
    .split(/[\/,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Flatten, dedupe and — for a school student whose class maps to a
 * stage — keep only that stage's outcomes for the subject. A Year 4
 * child has no use for the Early Stage 1 line of a multi-band programme,
 * and EYLF (pre-school framework) codes never belong on a school report.
 * If the stage filter would empty the list (programme written for
 * another band), fall back to every code of the subject so the section
 * is never blank for a child who attended mapped sessions.
 */
export function normaliseOutcomes(
  raw: Array<{ code?: string | null; title?: string | null }>,
  stage: NswStage | null,
  subject: SubjectDef = SUBJECTS.pdhpe
): OutcomeEntry[] {
  const seen = new Map<string, string>();
  for (const o of raw) {
    if (!o.code) continue;
    for (const atomic of splitOutcomeCode(o.code)) {
      const key = atomic.toUpperCase();
      if (!seen.has(key)) seen.set(key, o.title?.trim() ?? "");
    }
  }
  const all = Array.from(seen.entries()).map(([key, title]) => ({
    code: displayCode(key),
    title,
  }));
  if (!stage) return sortCodes(all);

  const ofSubject = all.filter((o) => o.code.toUpperCase().startsWith(subject.codeFamily));
  const forStage = ofSubject.filter((o) =>
    o.code.toUpperCase().startsWith(subject.stagePrefixes[stage])
  );
  if (forStage.length > 0) return sortCodes(forStage);
  // Nothing written for this stage (older programmes only listed up to
  // Stage 2): show the nearest stage that has codes rather than every
  // stage at once — a Year 6 card should never read PDe-1.
  const order: NswStage[] = ["Early Stage 1", "Stage 1", "Stage 2", "Stage 3"];
  const idx = order.indexOf(stage);
  const byDistance = order
    .map((s, i) => ({ s, d: Math.abs(i - idx) }))
    .filter((x) => x.s !== stage)
    .sort((a, b) => a.d - b.d || (b.s > a.s ? 1 : -1));
  for (const { s } of byDistance) {
    const near = ofSubject.filter((o) => o.code.toUpperCase().startsWith(subject.stagePrefixes[s]));
    if (near.length > 0) return sortCodes(near);
  }
  return sortCodes(ofSubject);
}

/** Split a mixed outcome list by subject, keyed by subject key. */
export function groupOutcomesBySubject(
  raw: Array<{ code?: string | null; title?: string | null }>
): Map<SubjectDef, Array<{ code: string; title: string }>> {
  const groups = new Map<SubjectDef, Array<{ code: string; title: string }>>();
  for (const o of raw) {
    if (!o.code) continue;
    for (const atomic of splitOutcomeCode(o.code)) {
      const subject = subjectForCode(atomic);
      if (!subject) continue;
      const list = groups.get(subject) ?? [];
      list.push({ code: atomic, title: o.title ?? "" });
      groups.set(subject, list);
    }
  }
  return groups;
}

function displayCode(upper: string): string {
  // Early Stage 1 codes are written "PDe-1" / "ENe-1" / "MAe-1" in the
  // syllabus; everything else is upper-case.
  const m = /^([A-Z]{2})E-(.*)$/.exec(upper);
  return m ? `${m[1]}e-${m[2]}` : upper;
}

function sortCodes(list: OutcomeEntry[]): OutcomeEntry[] {
  return [...list].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true })
  );
}
