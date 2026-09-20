import type { NswStage } from "./year-groups";

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

const STAGE_PREFIX: Record<NswStage, string> = {
  "Early Stage 1": "PDE-",
  "Stage 1": "PD1-",
  "Stage 2": "PD2-",
  "Stage 3": "PD3-",
};

export function splitOutcomeCode(code: string): string[] {
  return code
    .split(/[\/,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Flatten, dedupe and — for a school student whose class maps to a
 * stage — keep only that stage's PDHPE outcomes. A Year 4 child has no
 * use for the Early Stage 1 line of a multi-band programme, and EYLF
 * (pre-school framework) codes never belong on a school report. If the
 * stage filter would empty the list (programme written for another
 * band), fall back to every PDHPE code so the section is never blank
 * for a child who attended mapped sessions.
 */
export function normaliseOutcomes(
  raw: Array<{ code?: string | null; title?: string | null }>,
  stage: NswStage | null
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

  const pdhpe = all.filter((o) => o.code.toUpperCase().startsWith("PD"));
  const forStage = pdhpe.filter((o) =>
    o.code.toUpperCase().startsWith(STAGE_PREFIX[stage])
  );
  return sortCodes(forStage.length > 0 ? forStage : pdhpe);
}

function displayCode(upper: string): string {
  // "PDE-1" is written "PDe-1" in the syllabus; everything else is upper-case.
  return upper.startsWith("PDE-") ? `PDe-${upper.slice(4)}` : upper;
}

function sortCodes(list: OutcomeEntry[]): OutcomeEntry[] {
  return [...list].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true })
  );
}
