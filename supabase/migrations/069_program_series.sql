-- 069: Multi-week programme series ("Dribbling School — Week 2 of 4").
--
-- A series is a set of ordinary programme rows sharing a series_id,
-- ordered by series_week (1-based) with series_length stamped on each
-- row. Everything that works on a single programme (editor, versions,
-- PDFs, coach feedback, apply-to-roster) works per week unchanged;
-- the series apply action walks the weeks forward across the roster.

alter table programs add column if not exists series_id uuid;
alter table programs add column if not exists series_week int;
alter table programs add column if not exists series_length int;
create index if not exists idx_programs_series on programs (series_id, series_week) where series_id is not null;
