CREATE TABLE public.backlog_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, title)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_groups TO authenticated;
GRANT ALL ON public.backlog_groups TO service_role;

ALTER TABLE public.backlog_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own backlog groups"
ON public.backlog_groups
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);