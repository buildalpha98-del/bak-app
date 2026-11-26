-- Audit §2.16: public callers cannot forge notification or delivery records.
DROP POLICY IF EXISTS "Server can insert notifications" ON public.notifications;
CREATE POLICY "Server can insert notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (public.auth_user_role() IN ('admin', 'ops', 'coach'));
DROP POLICY IF EXISTS "Service role inserts email log" ON public.email_log;
REVOKE ALL ON public.notifications, public.email_log FROM anon;
