# Curriculum frameworks — NSW syllabus and Victorian Curriculum

**Date:** 2026-09-21 · **Status:** built on Jayden's instruction ("start on the VIC curriculum") after Stage 4–5 (#62) closed the NSW ladder at Years K–10.

## Problem

Every school was assumed to follow the NSW syllabus. Stage names, outcome-code
prefixes (`PD2-`, `EN3-`, `MA4-`), the report card's five-point scale
(Outstanding … Limited), the "By Stage (NSW PDHPE)" rollup and the AI prompts'
persona were all NSW-only. A Victorian school reports against the Victorian
Curriculum F–10 v2.0: Foundation and Levels 1–10, content descriptions coded
`VC2HP4M01` / `VC2E3LY02` / `VC2M4N01`, and achievement "at / above / below
the expected level".

## Design

**One framework per school**, chosen by ops (migration 095,
`centres.curriculum_framework` ∈ `nsw | vic`, default `nsw`). Childcare
centres ignore it (EYLF). Set on the add-centre form and in the centre's
settings card; the portal reads it through `getCurrentClientUser` as
`centre_framework`.

**A framework layer over the subject registry.** `lib/curriculum/subjects.ts`
keeps what is the same in both states (strands, resources, programme-section
headings). `lib/curriculum/frameworks.ts` holds what differs:

| | NSW | VIC |
|---|---|---|
| Band labels | Early Stage 1 … Stage 5 | Foundation, Levels 1–2 … Levels 9–10 |
| Code family | `PD` / `EN` / `MA` | `VC2HP` / `VC2E` / `VC2M` |
| Band prefixes | one per stage (`PD2-`) | HPE banded (`VC2HP4`); English/Maths per level (`VC2E3`, `VC2E4`) |
| Mark scale | Outstanding / High / Sound / Basic / Limited | Well above / Above / At level / Below / Well below |
| Outcomes heading | "NSW English Outcomes Addressed" | "Victorian Curriculum English Content Descriptions Addressed" |
| Rollup heading | By Stage (NSW PDHPE) | By Level (Victorian Curriculum HPE) |

The six canonical year bands stay the NSW stage strings from
`lib/schools/year-groups.ts` — both states group years the same way (K, 1–2,
3–4, 5–6, 7–8, 9–10), so a band id is framework-neutral data. Nothing prints a
band id directly; everything goes through `framework.bandLabels`.

**Prefix matching is digit-boundary aware** (`codeHasPrefix`): `VC2E1` covers
`VC2E1LA01` but not `VC2E10LA01`. NSW prefixes end in `-` so they are
unaffected.

**Report card** (`normaliseOutcomes`) filters a student's outcomes to their
band under the school's framework, falling back to the nearest band, then to
any code of the subject. Codes from the other framework (a programme generated
before the school was flipped) still print rather than vanish.

**AI prompts** take the framework: persona ("Victorian Health and Physical
Education teacher"), the alignment paragraph (which codes, how bands map) and
the band guidance labels. The sport prompt's PDHPE code rows are NSW-only and
are swapped for the VIC HPE banding rule.

**Year-group parsing** accepts `F`, `P`, `Prep` and `Foundation` as year 0 so
Victorian class lists import without renaming.

## Not in scope

- A per-programme framework. A programme is written for the school it was
  generated in; the school's framework applies.
- Verified content-description numbers. The registry knows the code *shape*;
  the model supplies the numbers. A Victorian teacher should sanity-check the
  first few lessons' codes against the VCAA site, as a NSW teacher did for PD3-.
- Other states (QLD, WA follow the Australian Curriculum v9 directly — same
  band shape, `AC9…` codes). Adding one is a new entry in `FRAMEWORKS`.

## Verification

Unit: `lib/curriculum/__tests__/frameworks.test.ts` (labels, prefixes with
boundary, subject/framework detection, band label helpers), updated
outcome-codes / subjects / year-groups suites.
Seam (`scripts/.rehearsal-p16-vic.mjs`, local server against prod data): flip
the rehearsal school to VIC → portal copy, lesson generator band label, report
card heading and scale, term-report rollup heading all read Victorian; flip back.
