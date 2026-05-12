CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending_scheduled
ON public.notification_outbox (scheduled_for)
WHERE status = 'pending';