-- ============================================================
-- 101: profiles.also_coaches — an ops member who also coaches
-- ============================================================
--
-- A profile has exactly one role, and "who can be put on a shift" was
-- `role = 'coach'` in some thirty queries. So an ops member who also
-- runs sessions (Carla, Oct 2026) had to pick: ops, and vanish from
-- every coach picker and the AI solver; or coach, and lose the roster.
--
-- This flag adds the second hat without a second role. It means
-- something only for ops — a coach coaches already, and an admin can
-- open the coach screens regardless. The app reads it through
-- lib/staff/coach-pool.ts (COACH_POOL_FILTER / isInCoachPool), which is
-- the one definition of "the coaching pool"; a CI guard fails the build
-- on a new `.eq("role", "coach")` against profiles.
--
-- RLS needs nothing: ops already has full access on every table whose
-- coach policies matter, and the coach's own-row policies key on
-- auth.uid(), not on the role.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS also_coaches boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.also_coaches IS
  'Ops member who is also rostered as a coach. Meaningful only when role = ''ops''. See lib/staff/coach-pool.ts.';
