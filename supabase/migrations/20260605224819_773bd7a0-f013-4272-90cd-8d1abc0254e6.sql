CREATE TABLE public.dismissed_duplicate_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pair_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pair_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dismissed_duplicate_pairs TO authenticated;
GRANT ALL ON public.dismissed_duplicate_pairs TO service_role;

ALTER TABLE public.dismissed_duplicate_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own dismissed pairs"
  ON public.dismissed_duplicate_pairs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX dismissed_duplicate_pairs_user_idx ON public.dismissed_duplicate_pairs (user_id);