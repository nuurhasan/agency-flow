-- Checklist items
CREATE TABLE public.task_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_checklist_items_task ON public.task_checklist_items(task_id, position);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view checklist"
  ON public.task_checklist_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_checklist_items.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members insert checklist"
  ON public.task_checklist_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_checklist_items.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members update checklist"
  ON public.task_checklist_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_checklist_items.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members delete checklist"
  ON public.task_checklist_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_checklist_items.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE TRIGGER trg_checklist_updated_at
  BEFORE UPDATE ON public.task_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Links / attachments
CREATE TABLE public.task_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  kind TEXT NOT NULL DEFAULT 'other',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_links_task ON public.task_links(task_id, created_at DESC);

ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view links"
  ON public.task_links FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_links.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members insert links"
  ON public.task_links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_links.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members update links"
  ON public.task_links FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_links.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));

CREATE POLICY "members delete links"
  ON public.task_links FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t
    WHERE t.id = task_links.task_id
    AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(), 'admin'::app_role))));