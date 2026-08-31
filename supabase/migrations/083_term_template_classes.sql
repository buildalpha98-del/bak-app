-- Classes on term templates (roster-to-report Seam B).
-- "3B every Wednesday 9:15" is how a school books us, so the class
-- targeting belongs on the recurring template: week generation copies
-- it onto each session's school_class_ids (migration 080), making
-- targeting the default instead of a per-session retrofit in the
-- detail sheet. Nullable; childcare templates never set it.
-- No RLS change: term_templates policies are staff-only already and
-- the portal/coach surfaces read sessions, not templates.

ALTER TABLE term_templates ADD COLUMN school_class_ids uuid[] DEFAULT NULL;
