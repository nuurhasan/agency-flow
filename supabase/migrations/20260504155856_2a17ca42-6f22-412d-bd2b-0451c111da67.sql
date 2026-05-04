-- Add new status to enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'awaiting_client' BEFORE 'done';

-- Add columns
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS revision_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Trigger function to bump revision_count when bouncing back from in_review -> in_progress
CREATE OR REPLACE FUNCTION public.bump_task_revision_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'in_review' THEN
    NEW.revision_count = COALESCE(OLD.revision_count, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_task_revision ON public.tasks;
CREATE TRIGGER trg_bump_task_revision
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_task_revision_count();
