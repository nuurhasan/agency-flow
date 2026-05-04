
-- 1. Preferences
CREATE TYPE public.notification_mode AS ENUM ('instant', 'digest', 'off');
CREATE TYPE public.notification_digest_frequency AS ENUM ('hourly', 'daily');

CREATE TABLE public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mode public.notification_mode NOT NULL DEFAULT 'instant',
  digest_frequency public.notification_digest_frequency NOT NULL DEFAULT 'daily',
  digest_hour INT NOT NULL DEFAULT 9,
  event_task_assigned BOOLEAN NOT NULL DEFAULT true,
  event_task_status_changed BOOLEAN NOT NULL DEFAULT true,
  event_task_comment BOOLEAN NOT NULL DEFAULT true,
  event_task_mention BOOLEAN NOT NULL DEFAULT true,
  event_task_due_soon BOOLEAN NOT NULL DEFAULT true,
  event_project_update BOOLEAN NOT NULL DEFAULT true,
  event_client_approval BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own prefs" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "users update own prefs" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "users insert own prefs" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Backfill existing users
INSERT INTO public.notification_preferences (user_id)
  SELECT id FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;

-- 2. Events log (append-only)
CREATE TABLE public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  project_id UUID,
  task_id UUID,
  event_type TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notification_events_created ON public.notification_events(created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view events" ON public.notification_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Outbox
CREATE TYPE public.notification_status AS ENUM ('pending','sent','skipped','failed');

CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.notification_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  project_id UUID,
  task_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  email_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_outbox_pending_dedup
  ON public.notification_outbox(user_id, dedup_key)
  WHERE status = 'pending';

CREATE INDEX idx_outbox_pending_due
  ON public.notification_outbox(scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own outbox" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Default-prefs trigger for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user_notification_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created_notif_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_notification_prefs();

-- 5. Core enqueue function with dedup + preference check
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _user_id UUID,
  _event_type TEXT,
  _dedup_key TEXT,
  _payload JSONB,
  _project_id UUID,
  _task_id UUID,
  _event_id UUID
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prefs notification_preferences%ROWTYPE;
  _enabled BOOLEAN := true;
  _scheduled TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO _prefs FROM notification_preferences WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO notification_preferences (user_id) VALUES (_user_id)
      ON CONFLICT DO NOTHING;
    SELECT * INTO _prefs FROM notification_preferences WHERE user_id = _user_id;
  END IF;

  IF _prefs.mode = 'off' THEN RETURN; END IF;

  _enabled := CASE _event_type
    WHEN 'task_assigned' THEN _prefs.event_task_assigned
    WHEN 'task_status_changed' THEN _prefs.event_task_status_changed
    WHEN 'task_comment' THEN _prefs.event_task_comment
    WHEN 'task_mention' THEN _prefs.event_task_mention
    WHEN 'task_due_soon' THEN _prefs.event_task_due_soon
    WHEN 'task_overdue' THEN _prefs.event_task_due_soon
    WHEN 'project_update' THEN _prefs.event_project_update
    WHEN 'client_approval' THEN _prefs.event_client_approval
    ELSE true END;

  IF NOT _enabled THEN RETURN; END IF;

  -- Mentions and approvals are always instant; otherwise honor digest mode
  IF _prefs.mode = 'digest' AND _event_type NOT IN ('task_mention','client_approval') THEN
    IF _prefs.digest_frequency = 'hourly' THEN
      _scheduled := date_trunc('hour', now()) + interval '1 hour';
    ELSE
      _scheduled := date_trunc('day', now()) + make_interval(hours => _prefs.digest_hour);
      IF _scheduled <= now() THEN
        _scheduled := _scheduled + interval '1 day';
      END IF;
    END IF;
  END IF;

  INSERT INTO notification_outbox
    (user_id, event_id, event_type, project_id, task_id, payload, dedup_key, scheduled_for)
    VALUES (_user_id, _event_id, _event_type, _project_id, _task_id, _payload, _dedup_key, _scheduled)
  ON CONFLICT (user_id, dedup_key) WHERE status = 'pending' DO NOTHING;
END; $$;

-- 6. Trigger: task_assignees INSERT -> task_assigned
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _task tasks%ROWTYPE;
  _actor UUID := auth.uid();
  _event_id UUID;
  _payload JSONB;
BEGIN
  SELECT * INTO _task FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND OR NEW.user_id = _actor THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'task_id', _task.id, 'task_title', _task.title,
    'project_id', _task.project_id, 'priority', _task.priority,
    'due_date', _task.due_date, 'actor_id', _actor);

  INSERT INTO notification_events (actor_id, project_id, task_id, event_type, meta)
    VALUES (_actor, _task.project_id, _task.id, 'task_assigned', _payload)
    RETURNING id INTO _event_id;

  PERFORM enqueue_notification(
    NEW.user_id, 'task_assigned',
    'task:' || _task.id || ':assigned:' || NEW.user_id,
    _payload, _task.project_id, _task.id, _event_id);

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- 7. Trigger: tasks status change
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _event_id UUID;
  _payload JSONB;
  _bucket BIGINT := floor(extract(epoch FROM now()) / 300);
  _assignee RECORD;
  _event_type TEXT := 'task_status_changed';
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'awaiting_client' THEN
    _event_type := 'client_approval';
  END IF;

  _payload := jsonb_build_object(
    'task_id', NEW.id, 'task_title', NEW.title,
    'project_id', NEW.project_id, 'old_status', OLD.status,
    'new_status', NEW.status, 'actor_id', _actor);

  INSERT INTO notification_events (actor_id, project_id, task_id, event_type, meta)
    VALUES (_actor, NEW.project_id, NEW.id, _event_type, _payload)
    RETURNING id INTO _event_id;

  FOR _assignee IN SELECT user_id FROM task_assignees WHERE task_id = NEW.id LOOP
    IF _assignee.user_id = _actor THEN CONTINUE; END IF;
    PERFORM enqueue_notification(
      _assignee.user_id, _event_type,
      'task:' || NEW.id || ':status:' || _bucket || ':' || _assignee.user_id,
      _payload, NEW.project_id, NEW.id, _event_id);
  END LOOP;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_task_status_changed
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_status_changed();

-- 8. Trigger: task_comments INSERT
CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _task tasks%ROWTYPE;
  _event_id UUID;
  _mention_event_id UUID;
  _payload JSONB;
  _assignee RECORD;
  _mention UUID;
BEGIN
  SELECT * INTO _task FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  _payload := jsonb_build_object(
    'task_id', _task.id, 'task_title', _task.title,
    'project_id', _task.project_id, 'comment_id', NEW.id,
    'comment_excerpt', left(NEW.body, 200),
    'actor_id', NEW.user_id);

  -- Mentions (always instant)
  IF array_length(NEW.mentions, 1) > 0 THEN
    INSERT INTO notification_events (actor_id, project_id, task_id, event_type, meta)
      VALUES (NEW.user_id, _task.project_id, _task.id, 'task_mention', _payload)
      RETURNING id INTO _mention_event_id;
    FOREACH _mention IN ARRAY NEW.mentions LOOP
      IF _mention = NEW.user_id THEN CONTINUE; END IF;
      PERFORM enqueue_notification(
        _mention, 'task_mention',
        'task:' || _task.id || ':mention:' || NEW.id || ':' || _mention,
        _payload, _task.project_id, _task.id, _mention_event_id);
    END LOOP;
  END IF;

  -- Comment to assignees (digest-friendly)
  INSERT INTO notification_events (actor_id, project_id, task_id, event_type, meta)
    VALUES (NEW.user_id, _task.project_id, _task.id, 'task_comment', _payload)
    RETURNING id INTO _event_id;

  FOR _assignee IN SELECT user_id FROM task_assignees WHERE task_id = _task.id LOOP
    IF _assignee.user_id = NEW.user_id THEN CONTINUE; END IF;
    -- Skip if already mentioned (mention email covers it)
    IF NEW.mentions IS NOT NULL AND _assignee.user_id = ANY(NEW.mentions) THEN CONTINUE; END IF;
    PERFORM enqueue_notification(
      _assignee.user_id, 'task_comment',
      'task:' || _task.id || ':comment:' || _assignee.user_id || ':' || floor(extract(epoch FROM now())/3600),
      _payload, _task.project_id, _task.id, _event_id);
  END LOOP;

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_task_comment
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment();

-- 9. Daily reminder generator
CREATE OR REPLACE FUNCTION public.generate_due_date_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _today DATE := current_date;
  _row RECORD;
  _payload JSONB;
  _event_id UUID;
  _count INT := 0;
  _evt TEXT;
  _dedup TEXT;
BEGIN
  FOR _row IN
    SELECT t.id, t.title, t.project_id, t.due_date, t.priority, ta.user_id,
           CASE WHEN t.due_date < _today THEN 'task_overdue' ELSE 'task_due_soon' END AS evt
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
      WHERE t.status NOT IN ('done')
        AND t.due_date IS NOT NULL
        AND t.due_date <= _today
  LOOP
    _evt := _row.evt;
    _payload := jsonb_build_object(
      'task_id', _row.id, 'task_title', _row.title,
      'project_id', _row.project_id, 'due_date', _row.due_date,
      'priority', _row.priority);
    INSERT INTO notification_events (project_id, task_id, event_type, meta)
      VALUES (_row.project_id, _row.id, _evt, _payload)
      RETURNING id INTO _event_id;
    _dedup := 'task:' || _row.id || ':' || _evt || ':' || _today || ':' || _row.user_id;
    PERFORM enqueue_notification(
      _row.user_id, _evt, _dedup, _payload,
      _row.project_id, _row.id, _event_id);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END; $$;

-- 10. pg_cron schedules
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'process-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b8984a37-ef14-4524-80d7-e03f47628d3e.lovable.app/api/public/hooks/process-notifications',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdnc2ZpbHNha3doa2pvdHRyYXJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTgzMzcsImV4cCI6MjA5MTk5NDMzN30.bhpQtGHogu6CD7x07XWu2NubghlW0VOBLKJIfgx3S5I"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'generate-due-reminders',
  '0 8 * * *',
  $$ SELECT public.generate_due_date_reminders(); $$
);
