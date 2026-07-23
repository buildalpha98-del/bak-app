-- 075: Fix "infinite recursion detected in policy for relation sessions".
--
-- 068 gave coach_update_own_sessions (on sessions) an EXISTS subquery
-- into session_coaches. But the pre-existing "session_coaches read"
-- policy (on session_coaches) has an EXISTS subquery back into
-- sessions (to check s.coach_id = auth.uid()). Postgres evaluates RLS
-- quals as subplans, and once the planner walks into that cycle —
-- sessions policy -> session_coaches policy -> sessions policy -> ... —
-- it hits its reentrancy guard and the whole UPDATE fails. This broke
-- every edit to an existing session (e.g. fixing a wrong date/time),
-- not just the multi-coach path 068 was aimed at.
--
-- Fix: two SECURITY DEFINER helpers (same bypass-RLS pattern already
-- used by auth_user_role()/auth_client_centre_ids() — both tables are
-- owned by postgres with relforcerowsecurity=false, so a function
-- running as postgres reads them without re-entering their policies).
-- Swapping the raw cross-table EXISTS subqueries for these functions
-- keeps the exact same access rules but stops either policy from
-- ever re-triggering the other's RLS.

create or replace function public.auth_is_session_coach(p_session_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from session_coaches sc
    where sc.session_id = p_session_id and sc.user_id = auth.uid()
  );
$$;

create or replace function public.auth_is_session_primary_coach(p_session_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1 from sessions s
    where s.id = p_session_id and s.coach_id = auth.uid()
  );
$$;

drop policy if exists coach_update_own_sessions on sessions;
create policy coach_update_own_sessions on sessions for update
  using (
    coach_id = auth.uid()
    or auth_is_session_coach(id)
  )
  with check (
    coach_id = auth.uid()
    or auth_is_session_coach(id)
  );

drop policy if exists "session_coaches read" on session_coaches;
create policy "session_coaches read" on session_coaches for select
  using (
    auth_user_role() = any (array['admin'::user_role, 'ops'::user_role])
    or user_id = auth.uid()
    or auth_is_session_primary_coach(session_id)
  );
