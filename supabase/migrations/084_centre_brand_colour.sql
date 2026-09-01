-- White-label portal accent (finishes PR #36's shell work).
-- One anchor colour per centre: the portal's accent scale is derived
-- from it at render time via color-mix (see --portal-* in globals.css),
-- so a single hex re-themes chips, buttons, charts and nav highlights.
-- Null → the default BAK portal cyan. Only read when
-- branding_mode = 'white_label'. Distinct from centres.colour (072),
-- which is the internal roster colour-coding accent.

ALTER TABLE centres ADD COLUMN brand_colour text
  CHECK (brand_colour IS NULL OR brand_colour ~ '^#[0-9A-Fa-f]{6}$');
