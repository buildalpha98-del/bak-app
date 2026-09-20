# Curriculum knowledge base

**Date:** 2026-09-21 · **Status:** built on Jayden's instruction ("build the curriculum knowledge base") after he asked what background knowledge feeds the AI and the answer was "nothing external".

## Problem

Until now every outcome code, title and statement on a programme, lesson,
assessment or report card came from the model's own recall, steered only by
code-shape hints in the prompt. Nothing checked the result. Two real defects
came from that: Early Stage 1 codes on a Year 6 report card, and titles that
paraphrased rather than quoted the syllabus. For the schools this platform is
sold to, an outcome code on a report card has to be audit-grade.

## Design

**Official data, in the repo.** `lib/curriculum/data/*.json` — one file per
syllabus, pulled from the primary sources on 2026-09-21:

| File | Source | Count |
|---|---|---|
| `nsw-pdhpe-2018.json` | NSW Department of Education outcome cards for the NESA PDHPE K–10 Syllabus (2018); valid to 2026-12-31 | 66 |
| `nsw-pdhpe-2024.json` | NESA digital curriculum, PDHPE K–6 and 7–10 (2024); valid from 2027-01-01 | 35 |
| `nsw-english.json` | NESA digital curriculum, English K–10 (2022) | 52 |
| `nsw-mathematics.json` | NESA digital curriculum, Mathematics K–10 (2022) | 131 |
| `vic-pdhpe.json` | VCAA Victorian Curriculum F–10 v2.0 JSON:API, Health and Physical Education | 104 |
| `vic-english.json` | VCAA JSON:API, English | 293 |
| `vic-mathematics.json` | VCAA JSON:API, Mathematics | 283 |

Each outcome carries `code`, the official `statement`, canonical `bands`
(the shared NSW-stage ids) and `years`; Victorian rows add `strand` and
`substrand`. Life Skills outcomes and the Victorian Foundation A–D levels are
excluded. JSON in the repo rather than a table: nobody edits these, they are
versioned with the code, and the prompt path needs no I/O.

**`lib/curriculum/knowledge-base.ts`** (server-only, ~270 KB of data):
- `setsFor(framework, subject, on)` picks the syllabus in force on a date, so
  NSW PDHPE flips from 2018 to 2024 codes on 1 January 2027 with no setting.
- `outcomesFor({framework, subject, bands | years})`, `findOutcome(code)`,
  `officialStatement(code)`.
- `promptOutcomeList(framework, subject, bands)` — "CODE (band) [strand] —
  statement" lines, capped at 90.
- `validateOutcomes(list, {bands})` — splits bundles, drops unknown codes and
  codes outside the requested bands, replaces the model's title with the
  official statement, passes EYLF through.

**Where it is used.**
- Programme / lesson prompt: the band's real list with "choose ONLY from
  this list, copy codes exactly". After generation `validateOutcomes` runs;
  if nothing survives the model's list is kept (never a blank section).
- Assessment skills prompt: the band's outcomes as anchors, code named in
  each skill's description.
- Quiz prompt: the band's outcomes, each question's `skill` names a code.
- Report card: every printed code's title is the official statement.
- Portal: `/client/[id]/curriculum/outcomes` — the school's framework
  outcomes by subject and band, linked from Scope & Sequence.

**Registry change.** NSW PDHPE now has two code families (`PD` and `PH`) so
the 2024 codes sit in the same bands as the 2018 ones.

## Known gaps

- Three NESA Mathematics outcomes (`MA3-RQF-02`, `MA4-EQU-C-01`,
  `MA5-EQU-P-01`) have no statement on the digital curriculum. They validate
  as real codes but are left out of the prompt lists.
- No EYLF set. Childcare programmes still rely on the model for EYLF sub-
  outcomes (a fixed list of 19 that the sport prompt already spells out).
- No exemplar Scope & Sequences or unit plans yet; that is the second half
  of the original proposal and a separate piece of work.
- Refreshing the data is a re-run of the pull scripts; there is no scheduled
  sync. NESA's digital curriculum is versioned, so a re-pull should be
  deliberate and reviewed.

## Verification

Unit: `lib/curriculum/__tests__/knowledge-base.test.ts` — counts per set,
uniqueness, every code sits in the band its framework predicts, the 2027
switch, lookups, band/year filters, validation semantics, prompt list shape.
Seam (`scripts/.rehearsal-p17-kb.mjs`, local server against prod data): the
reference page lists the 2018 PDHPE syllabus and NESA English Stage 1
exactly; a real English lesson for 2R returns only Stage 1 codes that exist,
titled with official statements; the report card prints official statements;
under VIC the reference page reads Levels 3–4 with VC2M3/VC2M4 codes.
