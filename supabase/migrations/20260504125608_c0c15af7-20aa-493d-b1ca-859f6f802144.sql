ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id_created_at
  ON public.task_comments (task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_comments_mentions
  ON public.task_comments USING GIN (mentions);