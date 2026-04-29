CREATE TABLE public.report_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX report_templates_user_id_idx ON public.report_templates(user_id);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report templates"
  ON public.report_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own report templates"
  ON public.report_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own report templates"
  ON public.report_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own report templates"
  ON public.report_templates FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate each user's existing email_template into a default named template
INSERT INTO public.report_templates (user_id, name, template, is_default)
SELECT user_id, 'My Template', email_template, true
FROM public.user_settings
WHERE email_template IS NOT NULL AND email_template <> '';