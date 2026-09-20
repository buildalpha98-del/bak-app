-- ============================================================
-- 095 — Curriculum framework per centre (NSW syllabus | Victorian Curriculum)
-- ============================================================
-- Until now every school was assumed to follow the NSW syllabus: stage
-- names, outcome-code prefixes (PD2-, EN3-, MA4-…), the report card's
-- five-point scale and the AI prompts' persona were all NSW-only. A
-- Victorian school reports against the Victorian Curriculum F–10 v2.0
-- (Foundation + Levels 1–10, VC2HP…/VC2E…/VC2M… content descriptions,
-- achievement "at / above / below the expected level").
--
-- The framework is a property of the school, chosen by ops when the
-- centre is set up (or changed later in the centre's settings).
-- Everything that reads it lives in code: lib/curriculum/frameworks.ts
-- is the registry; year-groups' six canonical bands are shared and each
-- framework labels them (Stage 2 ↔ Levels 3–4).

ALTER TABLE centres
  ADD COLUMN IF NOT EXISTS curriculum_framework text NOT NULL DEFAULT 'nsw'
  CHECK (curriculum_framework IN ('nsw', 'vic'));

COMMENT ON COLUMN centres.curriculum_framework IS
  'Which curriculum a school reports against: nsw (NESA syllabus stages) or vic (Victorian Curriculum F–10 levels). Ignored for childcare centres (EYLF).';
