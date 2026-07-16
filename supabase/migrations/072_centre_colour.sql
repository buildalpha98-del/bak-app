-- ============================================================
-- 072 — centre colour (P4 colour coding)
-- ============================================================
--
-- Per-centre accent so the roster can be scanned by location, toggled
-- against the existing colour-by-sport view. Nullable: the app resolves
-- a deterministic default from the centre id when it's null
-- (lib/utils/centre-colours.ts), so nothing depends on a backfill —
-- but we backfill anyway so the settings colour picker opens on the
-- colour the operator already sees.

ALTER TABLE centres ADD COLUMN IF NOT EXISTS colour text;

-- Constrain to a 6-digit hex so a bad value can't reach the UI as an
-- unparseable border colour.
ALTER TABLE centres DROP CONSTRAINT IF EXISTS centres_colour_hex_chk;
ALTER TABLE centres
  ADD CONSTRAINT centres_colour_hex_chk
  CHECK (colour IS NULL OR colour ~ '^#[0-9A-Fa-f]{6}$');

-- Backfill NULL colours with a deterministic value from the palette.
-- This need not match the app's JS fallback exactly — centreColour()
-- always prefers the stored value, so once backfilled the stored colour
-- is the single source of truth. hashtext() is Postgres's own stable
-- hash; +1 because array indexing is 1-based, abs() to stay in range.
UPDATE centres
SET colour = (ARRAY[
    '#E8712A','#2563EB','#059669','#7C3AED','#DB2777','#0891B2',
    '#CA8A04','#DC2626','#4F46E5','#65A30D','#0D9488','#9333EA',
    '#EA580C','#0284C7','#BE123C','#15803D'
  ])[(abs(hashtext(id::text)) % 16) + 1]
WHERE colour IS NULL;
