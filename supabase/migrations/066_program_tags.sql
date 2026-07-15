-- 066: Programme tags (Tier 3 — tags + recommendations).
--
-- Free-form labels ("wet weather", "small space", "high energy") that
-- operators attach to programmes. Searched by the library and shown as
-- badges; the recommendation ranking in the session sheet is
-- usage-based, with tags as the human-curation layer on top.

alter table programs add column if not exists tags text[] not null default '{}';
create index if not exists idx_programs_tags on programs using gin (tags);
