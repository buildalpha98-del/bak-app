-- 063 — permanent credential purge marker for archived staff
-- Set when a staff member's login (email/phone/password on
-- auth.users) has been irreversibly scrubbed because a full account
-- delete was blocked by historical records (session_notes,
-- skill_ratings, invoices, etc. with NO ACTION constraints on
-- profiles.id). The profile row and all historical data stay intact;
-- this column just distinguishes "purged, not restorable" from a
-- normal archive (banned but restorable).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credentials_purged_at timestamptz;
