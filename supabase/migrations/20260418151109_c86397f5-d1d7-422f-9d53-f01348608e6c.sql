-- 1. Tighten reveal_credential_password to creator + admin only
CREATE OR REPLACE FUNCTION public.reveal_credential_password(_credential_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _key TEXT;
  _enc BYTEA;
  _creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT created_by, password_encrypted
    INTO _creator, _enc
    FROM public.project_credentials
    WHERE id = _credential_id;

  IF _creator IS NULL AND _enc IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF _creator <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF _enc IS NULL THEN RETURN NULL; END IF;
  SELECT key INTO _key FROM public._encryption_key WHERE id = 1;
  RETURN pgp_sym_decrypt(_enc, _key);
END; $function$;

-- 2. Credential reveal audit log
CREATE TABLE IF NOT EXISTS public.credential_reveal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id UUID NOT NULL REFERENCES public.project_credentials(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credential_reveal_log_credential ON public.credential_reveal_log(credential_id, revealed_at DESC);

ALTER TABLE public.credential_reveal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team views reveal log" ON public.credential_reveal_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team inserts reveal log" ON public.credential_reveal_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "admins delete reveal log" ON public.credential_reveal_log
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Task templates
CREATE TABLE IF NOT EXISTS public.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'lavender',
  icon TEXT NOT NULL DEFAULT 'list-checks',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  default_priority public.task_priority NOT NULL DEFAULT 'medium',
  default_due_offset_days INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_template_items_template ON public.task_template_items(template_id, position);

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team views templates" ON public.task_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates templates" ON public.task_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "team updates templates" ON public.task_templates
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins delete templates" ON public.task_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "team views template items" ON public.task_template_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team creates template items" ON public.task_template_items
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "team updates template items" ON public.task_template_items
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "team deletes template items" ON public.task_template_items
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_task_templates_updated_at
  BEFORE UPDATE ON public.task_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Apply template RPC
CREATE OR REPLACE FUNCTION public.apply_task_template(
  _template_id UUID,
  _project_id UUID,
  _start_date DATE
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _count INT := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  INSERT INTO public.tasks (project_id, title, description, priority, due_date, created_by, status)
  SELECT
    _project_id,
    i.title,
    i.description,
    i.default_priority,
    CASE WHEN i.default_due_offset_days IS NOT NULL AND _start_date IS NOT NULL
         THEN _start_date + i.default_due_offset_days
         ELSE NULL END,
    _uid,
    'todo'::task_status
  FROM public.task_template_items i
  WHERE i.template_id = _template_id
  ORDER BY i.position;

  GET DIAGNOSTICS _count = ROW_COUNT;

  INSERT INTO public.activity_log (actor_id, project_id, action, meta)
  VALUES (_uid, _project_id, 'template.applied',
          jsonb_build_object('template_id', _template_id, 'count', _count));

  RETURN _count;
END;
$$;

-- 5. Seed 3 starter templates
DO $$
DECLARE
  _wp UUID := gen_random_uuid();
  _seo UUID := gen_random_uuid();
  _launch UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.task_templates LIMIT 1) THEN
    INSERT INTO public.task_templates (id, name, description, color, icon) VALUES
      (_wp, 'New WordPress site', 'Standard build flow for a new WordPress project.', 'mint', 'globe'),
      (_seo, 'Monthly SEO', 'Recurring SEO checklist to run each month per client.', 'lavender', 'trending-up'),
      (_launch, 'Site launch checklist', 'Pre-flight checks before pushing a site live.', 'peach', 'rocket');

    INSERT INTO public.task_template_items (template_id, title, position, default_priority, default_due_offset_days) VALUES
      (_wp, 'Kickoff call with client', 0, 'high', 1),
      (_wp, 'Collect brand assets & content', 1, 'high', 3),
      (_wp, 'Set up staging environment', 2, 'medium', 4),
      (_wp, 'Install WordPress + base theme', 3, 'medium', 5),
      (_wp, 'Build homepage', 4, 'high', 10),
      (_wp, 'Build inner pages', 5, 'medium', 14),
      (_wp, 'Mobile responsive QA', 6, 'medium', 18),
      (_wp, 'SEO basics (titles, meta, sitemap)', 7, 'medium', 19),
      (_wp, 'Performance & image optimization', 8, 'medium', 20),
      (_wp, 'Plugin & security setup', 9, 'medium', 21),
      (_wp, 'Analytics & Search Console', 10, 'medium', 22),
      (_wp, 'Client review round', 11, 'high', 24),
      (_wp, 'Apply revisions', 12, 'high', 27),
      (_wp, 'DNS migration to live', 13, 'high', 28),
      (_wp, 'Post-launch monitoring (48h)', 14, 'medium', 30);

    INSERT INTO public.task_template_items (template_id, title, position, default_priority, default_due_offset_days) VALUES
      (_seo, 'Pull rank report', 0, 'medium', 2),
      (_seo, 'Review Search Console errors', 1, 'high', 3),
      (_seo, 'Audit Core Web Vitals', 2, 'medium', 5),
      (_seo, 'Backlink audit', 3, 'medium', 7),
      (_seo, 'Publish 1 SEO blog post', 4, 'high', 14),
      (_seo, 'Internal linking review', 5, 'low', 18),
      (_seo, 'Fix broken links', 6, 'medium', 20),
      (_seo, 'Optimize 2 underperforming pages', 7, 'medium', 24),
      (_seo, 'Send monthly SEO report to client', 8, 'high', 28);

    INSERT INTO public.task_template_items (template_id, title, position, default_priority, default_due_offset_days) VALUES
      (_launch, 'Final cross-browser QA', 0, 'high', 0),
      (_launch, 'Mobile / tablet QA', 1, 'high', 0),
      (_launch, 'Form submissions tested', 2, 'high', 0),
      (_launch, '404 page in place', 3, 'medium', 0),
      (_launch, 'Favicon & social images', 4, 'medium', 0),
      (_launch, 'Robots.txt + sitemap.xml', 5, 'medium', 0),
      (_launch, 'SSL active on live domain', 6, 'high', 1),
      (_launch, 'Backups configured', 7, 'high', 1),
      (_launch, 'Analytics firing on live', 8, 'high', 1),
      (_launch, 'Handover doc to client', 9, 'medium', 2);
  END IF;
END $$;