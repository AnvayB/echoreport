CREATE TYPE public.ph_project_status AS ENUM ('not_started','incomplete','semi_complete','complete');

CREATE TABLE public.ph_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  manual_complete integer NOT NULL DEFAULT 0,
  manual_semi_complete integer NOT NULL DEFAULT 0,
  manual_incomplete integer NOT NULL DEFAULT 0,
  manual_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_regions TO authenticated;
GRANT ALL ON public.ph_regions TO service_role;
ALTER TABLE public.ph_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own regions" ON public.ph_regions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ph_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  region_id uuid NOT NULL REFERENCES public.ph_regions(id) ON DELETE CASCADE,
  project_name text NOT NULL,
  status public.ph_project_status NOT NULL DEFAULT 'not_started',
  status_notes text NOT NULL DEFAULT '',
  airtable_project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_projects TO authenticated;
GRANT ALL ON public.ph_projects TO service_role;
ALTER TABLE public.ph_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own projects" ON public.ph_projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX ph_projects_region_id_idx ON public.ph_projects(region_id);

CREATE TRIGGER update_ph_regions_updated_at BEFORE UPDATE ON public.ph_regions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ph_projects_updated_at BEFORE UPDATE ON public.ph_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();