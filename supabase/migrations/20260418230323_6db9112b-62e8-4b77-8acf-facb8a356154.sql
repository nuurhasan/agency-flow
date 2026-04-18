-- 1. Rename task_status enum value
ALTER TYPE public.task_status RENAME VALUE 'waiting' TO 'in_review';

-- 2. Sprint status enum
CREATE TYPE public.sprint_status AS ENUM ('planned', 'active', 'completed');

-- 3. Sprints table
CREATE TABLE public.sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text,
  start_date date,
  end_date date,
  status public.sprint_status NOT NULL DEFAULT 'planned',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active sprint per project
CREATE UNIQUE INDEX sprints_one_active_per_project
  ON public.sprints (project_id)
  WHERE status = 'active';

CREATE INDEX sprints_project_id_idx ON public.sprints (project_id);

ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team views sprints" ON public.sprints
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "team creates sprints" ON public.sprints
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "team updates sprints" ON public.sprints
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "admins delete sprints" ON public.sprints
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_sprints_updated_at
  BEFORE UPDATE ON public.sprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Tasks: add sprint_id, is_backlog, board_position
ALTER TABLE public.tasks
  ADD COLUMN sprint_id uuid REFERENCES public.sprints(id) ON DELETE SET NULL,
  ADD COLUMN is_backlog boolean NOT NULL DEFAULT false,
  ADD COLUMN board_position integer NOT NULL DEFAULT 0;

CREATE INDEX tasks_sprint_id_idx ON public.tasks (sprint_id);
CREATE INDEX tasks_project_backlog_idx ON public.tasks (project_id) WHERE is_backlog = true;

-- All existing tasks become backlog
UPDATE public.tasks SET is_backlog = true WHERE sprint_id IS NULL;

-- 5. RPC: activate_sprint
CREATE OR REPLACE FUNCTION public.activate_sprint(_sprint_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
  _existing_active uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT project_id INTO _project_id FROM public.sprints WHERE id = _sprint_id;
  IF _project_id IS NULL THEN RAISE EXCEPTION 'sprint_not_found'; END IF;

  SELECT id INTO _existing_active
    FROM public.sprints
    WHERE project_id = _project_id AND status = 'active' AND id <> _sprint_id;

  IF _existing_active IS NOT NULL THEN
    RAISE EXCEPTION 'another_sprint_active';
  END IF;

  UPDATE public.sprints SET status = 'active' WHERE id = _sprint_id;

  INSERT INTO public.activity_log (actor_id, project_id, action, meta)
  VALUES (auth.uid(), _project_id, 'sprint.activated',
          jsonb_build_object('sprint_id', _sprint_id));
END; $$;

-- 6. RPC: complete_sprint — moves incomplete tasks back to backlog
CREATE OR REPLACE FUNCTION public.complete_sprint(_sprint_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_id uuid;
  _moved int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT project_id INTO _project_id FROM public.sprints WHERE id = _sprint_id;
  IF _project_id IS NULL THEN RAISE EXCEPTION 'sprint_not_found'; END IF;

  UPDATE public.tasks
    SET sprint_id = NULL, is_backlog = true
    WHERE sprint_id = _sprint_id AND status <> 'done';
  GET DIAGNOSTICS _moved = ROW_COUNT;

  UPDATE public.sprints SET status = 'completed' WHERE id = _sprint_id;

  INSERT INTO public.activity_log (actor_id, project_id, action, meta)
  VALUES (auth.uid(), _project_id, 'sprint.completed',
          jsonb_build_object('sprint_id', _sprint_id, 'returned_to_backlog', _moved));

  RETURN _moved;
END; $$;