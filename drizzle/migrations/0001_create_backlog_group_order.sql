CREATE TABLE public.backlog_group_order (
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (user_id, title)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_group_order TO authenticated;
GRANT ALL ON public.backlog_group_order TO service_role;

ALTER TABLE public.backlog_group_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own group order"
ON public.backlog_group_order
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);