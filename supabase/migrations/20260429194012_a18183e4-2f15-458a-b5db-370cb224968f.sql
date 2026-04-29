-- Per-user cache of name-classification verdicts so AI only runs once per token.
CREATE TABLE public.known_names (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  is_name BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX idx_known_names_user_token ON public.known_names (user_id, token);

ALTER TABLE public.known_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own known names"
  ON public.known_names FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own known names"
  ON public.known_names FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own known names"
  ON public.known_names FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own known names"
  ON public.known_names FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_known_names_updated_at
  BEFORE UPDATE ON public.known_names
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();