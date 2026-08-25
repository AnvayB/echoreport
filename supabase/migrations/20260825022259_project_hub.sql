CREATE TABLE public.ph_regions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX ph_regions_user_id_idx ON public.ph_regions(user_id);

ALTER TABLE public.ph_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own regions"
  ON public.ph_regions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own regions"
  ON public.ph_regions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own regions"
  ON public.ph_regions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own regions"
  ON public.ph_regions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TYPE public.ph_project_status AS ENUM ('not_started', 'incomplete', 'semi_complete', 'complete');

CREATE TABLE public.ph_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  region_id UUID NOT NULL REFERENCES public.ph_regions(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  status public.ph_project_status NOT NULL DEFAULT 'not_started',
  status_notes TEXT NOT NULL DEFAULT '',
  airtable_project_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ph_projects_user_id_idx ON public.ph_projects(user_id);
CREATE INDEX ph_projects_region_id_idx ON public.ph_projects(region_id);

ALTER TABLE public.ph_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
  ON public.ph_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects"
  ON public.ph_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON public.ph_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON public.ph_projects FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_ph_projects_updated_at
  BEFORE UPDATE ON public.ph_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
