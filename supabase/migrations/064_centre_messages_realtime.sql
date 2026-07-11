-- 064: Broadcast centre_messages inserts over Supabase Realtime.
--
-- The staff centre inbox and the client portal thread both subscribe to
-- INSERT events on centre_messages so new messages appear without a
-- manual reload. Realtime only emits events for tables in the
-- supabase_realtime publication — centre_messages was never added, so
-- subscriptions connected but received nothing. RLS still applies to
-- delivery (centre_messages_staff_read / centre_messages_client_read).

alter publication supabase_realtime add table public.centre_messages;
