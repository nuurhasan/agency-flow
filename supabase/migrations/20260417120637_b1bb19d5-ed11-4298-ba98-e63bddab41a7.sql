
-- Fix function search path
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- Replace permissive `true` write policies with auth-checked ones
-- projects
DROP POLICY IF EXISTS "team updates projects" ON public.projects;
CREATE POLICY "team updates projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- tasks
DROP POLICY IF EXISTS "team updates tasks" ON public.tasks;
CREATE POLICY "team updates tasks" ON public.tasks FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- task_assignees
DROP POLICY IF EXISTS "team manages assignees ins" ON public.task_assignees;
CREATE POLICY "team manages assignees ins" ON public.task_assignees FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "team manages assignees del" ON public.task_assignees;
CREATE POLICY "team manages assignees del" ON public.task_assignees FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- credentials
DROP POLICY IF EXISTS "team updates credentials" ON public.project_credentials;
CREATE POLICY "team updates credentials" ON public.project_credentials FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- domains
DROP POLICY IF EXISTS "team updates domains" ON public.client_domains;
CREATE POLICY "team updates domains" ON public.client_domains FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

-- domain_assignees
DROP POLICY IF EXISTS "team ins d_assignees" ON public.domain_assignees;
CREATE POLICY "team ins d_assignees" ON public.domain_assignees FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "team del d_assignees" ON public.domain_assignees;
CREATE POLICY "team del d_assignees" ON public.domain_assignees FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- domain_reminder_state
DROP POLICY IF EXISTS "team ins d_state" ON public.domain_reminder_state;
CREATE POLICY "team ins d_state" ON public.domain_reminder_state FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "team upd d_state" ON public.domain_reminder_state;
CREATE POLICY "team upd d_state" ON public.domain_reminder_state FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "team del d_state" ON public.domain_reminder_state;
CREATE POLICY "team del d_state" ON public.domain_reminder_state FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
