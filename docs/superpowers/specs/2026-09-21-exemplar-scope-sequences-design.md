# Exemplar scope and sequences → term plans

**Date:** 2026-09-21 · **Status:** built on Jayden's instruction ("build the exemplar scope and sequences"), the second half of the proposal made when he asked what feeds the AI.

## Problem

The knowledge base (previous PR) fixed *which codes* the AI may use. It did
not fix *what a term looks like*. The Scope & Sequence page assembles what has
already been rostered or written; nothing produced the document a head of
department writes first — the units a class covers this term, the weeks each
takes, the outcomes each addresses, where assessment sits. And the model had
no example of what NSW schools actually file.

## Design

**Exemplars: the Department's own samples, in the repo.**
`lib/curriculum/exemplars/*.json`, converted from the NSW Department of
Education's published sample scope and sequences on 2026-09-21:

| Subject | Bands | Source form | Shape |
|---|---|---|---|
| PDHPE (2018 syllabus, valid to 2026-12-31) | ES1, S1, S2, S3 | DOCX | a PDH unit and a PE unit per term, even/odd-year rotation (ES1 single year); unit title, description, key inquiry questions, outcomes, policy opportunities |
| PDHPE (2024 syllabus, valid from 2027-01-01) | S4 | DOCX | per-year (7 and 8) units per term with programme type, overview, outcomes with statements, assessment |
| English (2022) | S1, S2, S3 | DOCX | per focus area (outcome), which content points each term introduces; S2/S3 per year with early/late-term phases |
| Mathematics (2022) | S1, S2, S3 | XLSX | Year A / Year B, five learning sequences a term with syllabus area, outcomes, focus areas, content groups |

`lib/curriculum/exemplars.ts`: `exemplarFor(framework, subject, band, on)`
(syllabus in force by date; Victoria gets the NSW sample flagged
`structuralOnly` because the VCAA publishes no school samples),
`nearestExemplarFor` (Stage 5 → Stage 4), `exemplarPromptText` (one term as
few-shot text, English merging the stage-wide and per-year tables, capped).
Every code the samples cite exists in the knowledge base (tested).

**Term plans (migration 096).** `term_plans`: one per class × subject ×
term, `content_json` = `TermPlanJson` (units with weeks, outcomes, inquiry
questions, assessment, a focus line per week), `status` draft | approved.
Clients read their own school's plans; writes go through the admin client
after the portal auth check.

**Generator.** `lib/ai/generate-term-plan.ts`: persona and rules per
framework; the Department sample for the same stage/subject/term as the
model to match ("structure and rigour, not content"); the knowledge base's
list as the only codes; PDHPE allowed two parallel strand units.
`normaliseTermPlan` (`lib/curriculum/term-plan.ts`, pure) validates codes via
`validateOutcomes`, fills missing weekly focus lines, and reports issues —
week gaps, same-strand overlaps, overruns, units with no recognised
outcomes. A draft with issues is shown but cannot be saved.

**Portal.** `/client/[id]/curriculum/plan` — pick class and subject, add a
steer, draft, review, save. Scope & Sequence lists saved plans (approve /
withdraw for the primary contact; delete), each week linking into the lesson
generator prefilled with subject, class, term week and the week's focus. The
Scope & Sequence PDF opens with a "Term overview" table per plan.

**Editing in place** (added the same day on Jayden's instruction).
`TermPlanEditor` on the plan card: title, rationale, and per unit the
title, strand, from/to weeks, description, inquiry questions, assessment and
each week's focus; outcomes are picked from the band's syllabus list
(`outcome_options` on `SchoolTermPlan`), so a code cannot be typed wrong.
Structural problems (`lib/curriculum/term-plan-checks.ts`, shared with the
normaliser and safe for the client bundle) show live and disable Save.
`updateTermPlan` re-runs the full normalisation server-side, refuses a plan
with issues or unknown codes, and returns an approved plan to draft so the
principal approves the new version. Teachers can edit only their classes'
plans. Seam: `scripts/.rehearsal-p19-edit-plan.mjs`.

## Not in scope

- Victorian sample plans: none are published; NSW structure is used and the
  prompt says so.
- Secondary English/Maths samples (Stage 4–5): the Department publishes K–6
  only; the generator falls back to the Stage 3 sample.
- Auto-writing every week's lesson from a plan in one click (the "Write
  lesson" link is per week).

## Verification

Unit: `exemplars.test.ts` (coverage, integrity, codes exist in the knowledge
base, syllabus-by-date, structure-only for Victoria, prompt text),
`term-plan.test.ts` (normalisation, parallel strands, gaps/overlaps/overruns,
empty plans). Seam (`scripts/.rehearsal-p18-term-plan.mjs`, local server
against prod data): a real PDHPE draft for 4T with only Stage 2 codes and no
week gaps, saved, listed, approved, in the PDF; an English plan's week link
opens the lesson generator prefilled; cleanup.
