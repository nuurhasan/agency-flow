
-- 1) Owner column on projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Backfill owner from created_by; if null, fall back to first profile
UPDATE public.projects p
SET owner_id = COALESCE(p.created_by, (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1))
WHERE owner_id IS NULL;

ALTER TABLE public.projects ALTER COLUMN owner_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON public.projects(owner_id);

-- 2) project_members table
CREATE TABLE IF NOT EXISTS public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   uuid,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- 3) Backfill: every existing project gets its owner as member, and all existing team members
INSERT INTO public.project_members (project_id, user_id, role)
SELECT p.id, p.owner_id, 'owner'
FROM public.projects p
ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner';

INSERT INTO public.project_members (project_id, user_id, role)
SELECT p.id, prof.id, 'member'
FROM public.projects p
CROSS JOIN public.profiles prof
WHERE prof.id <> p.owner_id
ON CONFLICT (project_id, user_id) DO NOTHING;

-- 4) Helper functions (SECURITY DEFINER so RLS doesn't recurse)
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE user_id = _user_id AND project_id = _project_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_owner(_user_id uuid, _project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND owner_id = _user_id
  );
$$;

-- 5) Trigger: when a project is created, owner_id auto-set + owner row added
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := COALESCE(NEW.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_project_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_set_owner ON public.projects;
CREATE TRIGGER trg_projects_set_owner
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

DROP TRIGGER IF EXISTS trg_projects_owner_membership ON public.projects;
CREATE TRIGGER trg_projects_owner_membership
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_new_project_after();

-- 6) RLS policies on project_members
DROP POLICY IF EXISTS "members view project_members" ON public.project_members;
CREATE POLICY "members view project_members" ON public.project_members
FOR SELECT TO authenticated
USING (
  public.is_project_member(auth.uid(), project_id)
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "owner manages project_members insert" ON public.project_members;
CREATE POLICY "owner manages project_members insert" ON public.project_members
FOR INSERT TO authenticated
WITH CHECK (
  public.is_project_owner(auth.uid(), project_id)
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "owner manages project_members delete" ON public.project_members;
CREATE POLICY "owner manages project_members delete" ON public.project_members
FOR DELETE TO authenticated
USING (
  public.is_project_owner(auth.uid(), project_id)
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "owner manages project_members update" ON public.project_members;
CREATE POLICY "owner manages project_members update" ON public.project_members
FOR UPDATE TO authenticated
USING (
  public.is_project_owner(auth.uid(), project_id)
  OR public.has_role(auth.uid(), 'admin')
);

-- 7) Replace projects RLS
DROP POLICY IF EXISTS "team views projects" ON public.projects;
DROP POLICY IF EXISTS "team updates projects" ON public.projects;
DROP POLICY IF EXISTS "team creates projects" ON public.projects;
DROP POLICY IF EXISTS "admins delete projects" ON public.projects;

CREATE POLICY "members view projects" ON public.projects
FOR SELECT TO authenticated
USING (
  public.is_project_member(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "owner updates projects" ON public.projects
FOR UPDATE TO authenticated
USING (
  owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "auth creates projects" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "owner or admin deletes projects" ON public.projects
FOR DELETE TO authenticated
USING (
  owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
);

-- 8) Tasks RLS scoped to project membership
DROP POLICY IF EXISTS "team views tasks" ON public.tasks;
DROP POLICY IF EXISTS "team updates tasks" ON public.tasks;
DROP POLICY IF EXISTS "team creates tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins delete tasks" ON public.tasks;

CREATE POLICY "members view tasks" ON public.tasks
FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members update tasks" ON public.tasks
FOR UPDATE TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members create tasks" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "owner or admin deletes tasks" ON public.tasks
FOR DELETE TO authenticated
USING (public.is_project_owner(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

-- 9) Sprints RLS
DROP POLICY IF EXISTS "team views sprints" ON public.sprints;
DROP POLICY IF EXISTS "team updates sprints" ON public.sprints;
DROP POLICY IF EXISTS "team creates sprints" ON public.sprints;
DROP POLICY IF EXISTS "admins delete sprints" ON public.sprints;

CREATE POLICY "members view sprints" ON public.sprints
FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members update sprints" ON public.sprints
FOR UPDATE TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members create sprints" ON public.sprints
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "owner or admin deletes sprints" ON public.sprints
FOR DELETE TO authenticated
USING (public.is_project_owner(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

-- 10) Project credentials RLS
DROP POLICY IF EXISTS "team views credentials" ON public.project_credentials;
DROP POLICY IF EXISTS "team updates credentials" ON public.project_credentials;
DROP POLICY IF EXISTS "team creates credentials" ON public.project_credentials;
DROP POLICY IF EXISTS "admins delete credentials" ON public.project_credentials;

CREATE POLICY "members view credentials" ON public.project_credentials
FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members update credentials" ON public.project_credentials
FOR UPDATE TO authenticated
USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "members create credentials" ON public.project_credentials
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "owner or admin deletes credentials" ON public.project_credentials
FOR DELETE TO authenticated
USING (public.is_project_owner(auth.uid(), project_id) OR public.has_role(auth.uid(), 'admin'));

-- 11) Task assignees scoped via task -> project membership
DROP POLICY IF EXISTS "team views assignees" ON public.task_assignees;
DROP POLICY IF EXISTS "team manages assignees ins" ON public.task_assignees;
DROP POLICY IF EXISTS "team manages assignees del" ON public.task_assignees;

CREATE POLICY "members view assignees" ON public.task_assignees
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_assignees.task_id
      AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "members insert assignees" ON public.task_assignees
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_assignees.task_id
      AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "members delete assignees" ON public.task_assignees
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_assignees.task_id
      AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

-- 12) Task comments scoped via task -> project membership
DROP POLICY IF EXISTS "team views comments" ON public.task_comments;
DROP POLICY IF EXISTS "users insert own comments" ON public.task_comments;
DROP POLICY IF EXISTS "users delete own comments" ON public.task_comments;

CREATE POLICY "members view comments" ON public.task_comments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
      AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "members insert own comments" ON public.task_comments
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_comments.task_id
      AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "users delete own comments" ON public.task_comments
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 13) Activity log scoped to membership
DROP POLICY IF EXISTS "team views activity" ON public.activity_log;
DROP POLICY IF EXISTS "team inserts activity" ON public.activity_log;

CREATE POLICY "members view activity" ON public.activity_log
FOR SELECT TO authenticated
USING (
  project_id IS NULL
  OR public.is_project_member(auth.uid(), project_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "members insert activity" ON public.activity_log
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = actor_id
  AND (
    project_id IS NULL
    OR public.is_project_member(auth.uid(), project_id)
    OR public.has_role(auth.uid(), 'admin')
  )
);
