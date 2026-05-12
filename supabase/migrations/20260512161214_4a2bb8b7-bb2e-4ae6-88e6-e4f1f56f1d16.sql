-- Reschedule process-notifications with EXISTS guard + stable published URL
SELECT cron.unschedule('process-notifications');

SELECT cron.schedule(
  'process-notifications',
  '* * * * *',
  $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.notification_outbox
      WHERE status = 'pending' AND scheduled_for <= now()
      LIMIT 1
    )
    THEN net.http_post(
      url := 'https://sparkle-work-flow.lovable.app/api/public/hooks/process-notifications',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdnc2ZpbHNha3doa2pvdHRyYXJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTgzMzcsImV4cCI6MjA5MTk5NDMzN30.bhpQtGHogu6CD7x07XWu2NubghlW0VOBLKJIfgx3S5I"}'::jsonb,
      body := '{}'::jsonb
    )
    ELSE NULL
  END;
  $$
);

-- Reschedule process-email-queue to use stable published URL
SELECT cron.unschedule('process-email-queue');

SELECT cron.schedule(
  'process-email-queue',
  '5 seconds',
  $$
  SELECT CASE
    WHEN (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now()
      THEN NULL
    WHEN EXISTS (SELECT 1 FROM pgmq.q_auth_emails LIMIT 1)
      OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails LIMIT 1)
      THEN net.http_post(
        url := 'https://sparkle-work-flow.lovable.app/lovable/email/queue/process',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      )
    ELSE NULL
  END;
  $$
);