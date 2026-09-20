-- ============================================================
-- 094 — Secondary band: Years 7–10 (NSW Stage 4 and Stage 5)
-- ============================================================
-- The platform's age bands stopped at 8-12 (Year 6). Schools run PDHPE,
-- English and Mathematics through Year 10, so a fourth band carries
-- Years 7–10: "12-16". Everything else — year groups 7–10, Stage 4/5
-- stage mapping, PD4-/PD5-, EN4-/EN5-, MA4-/MA5- outcome prefixes and the
-- AI prompts' band guidance — lives in code (lib/schools/year-groups.ts,
-- lib/utils/programs/age-bands.ts, lib/curriculum/subjects.ts).
--
-- children.age_group is the only enum-typed column; programs and
-- assessment_templates store the band as text and need nothing here.

ALTER TYPE age_group ADD VALUE IF NOT EXISTS '12-16';
