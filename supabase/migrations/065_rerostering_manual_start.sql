-- 065: Allow admin/ops to start rerostering on an already-unassigned shift.
--
-- rerostering_events.original_coach_id was NOT NULL because events were
-- only ever created by a coach cancelling their own shift. Sessions can
-- also reach needs_replacement with no coach on record (bulk edits,
-- imports, a coach removed via the sheet) — the roster sheet now offers
-- "Start rerostering" for those, and there is no original coach to name.

alter table rerostering_events alter column original_coach_id drop not null;
