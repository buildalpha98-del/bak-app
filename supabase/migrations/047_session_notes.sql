-- ============================================================
-- Migration 047: sessions.notes — single-text note per shift
-- ============================================================
--
-- Per-session free-text note (e.g. "parent collecting at 3:45",
-- "check first aid kit", "centre door code 4271"). Single source
-- of truth for quick context. For longer threaded discussion
-- between ops and the assigned coach, see the existing
-- shift_threads table — P3 deliberately keeps that surface alive.
--
-- Existing session RLS policies already cover this column (the
-- column inherits row-level access); no new policy needed.

ALTER TABLE sessions
  ADD COLUMN notes text;
