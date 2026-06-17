-- ============================================================
-- Migration 055: sms_opt_in toggle on profiles + parent_profiles
-- ============================================================
--
-- SMS fallback is opt-in by default. The dispatcher in
-- `lib/sms/actions.ts::sendUrgentNotificationViaSms` checks this
-- flag before hitting the provider — if false, it skips silently
-- (we still have push + email + in-app to carry the message).
--
-- Defaulting to false avoids surprising new users with SMS they
-- never asked for; the toggle UIs live on /coach/profile and
-- /parent/account so users can flip it themselves.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE parent_profiles ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false;
