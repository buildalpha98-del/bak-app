-- 067: Track which channels actually delivered a notification.
--
-- The daily digest emails every unread important/informational
-- notification from the last 24h — including ones that already went
-- out as an immediate email, so users got the same message twice.
-- triggerNotification now records 'push' / 'email' per row and the
-- digest skips anything already emailed (push-only rows still digest:
-- push is ephemeral and catch-up is the digest's whole job).

alter table notifications add column if not exists delivered_channels text[] not null default '{}';
