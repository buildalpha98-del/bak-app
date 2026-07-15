-- 068: Close the silent zero-row write class for coaches.
--
-- Found by auditing every cookie-client UPDATE against pg_policies
-- (the class behind "selected a programme but it never showed up").
-- PostgREST reports an RLS-blocked UPDATE as success with zero rows,
-- so these failures were invisible to both the coach and the code.
--
-- 1. coach_update_own_sessions qualed on sessions.coach_id only — the
--    PRIMARY coach. P5 made sessions multi-coach, so every secondary
--    coach's confirm / start / complete silently did nothing. The
--    policy now also matches assignment via session_coaches.
--
-- 2. rerostering_events had no coach policy at all, so a replacement
--    coach tapping Accept/Decline on an offer zero-rowed the event
--    update — the offer stayed "sent", timed out, and escalated even
--    though the coach had accepted. Coaches may now update events
--    where they are the selected replacement.

drop policy if exists coach_update_own_sessions on sessions;
create policy coach_update_own_sessions on sessions for update
  using (
    coach_id = auth.uid()
    or exists (
      select 1 from session_coaches sc
      where sc.session_id = sessions.id and sc.user_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    or exists (
      select 1 from session_coaches sc
      where sc.session_id = sessions.id and sc.user_id = auth.uid()
    )
  );

create policy coach_respond_own_offer on rerostering_events for update
  using (selected_replacement_id = auth.uid())
  with check (selected_replacement_id = auth.uid());
