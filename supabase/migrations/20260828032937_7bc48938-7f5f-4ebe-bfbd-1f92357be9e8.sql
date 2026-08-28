CREATE OR REPLACE FUNCTION public.is_ph_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce((auth.jwt() ->> 'email'), '')) = 'anvay.bhanap@gmail.com'
$$;

REVOKE ALL ON FUNCTION public.is_ph_owner() FROM public;
GRANT EXECUTE ON FUNCTION public.is_ph_owner() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users manage their own regions" ON public.ph_regions;
DROP POLICY IF EXISTS "Users manage their own projects" ON public.ph_projects;

REVOKE ALL ON public.ph_regions FROM anon;
REVOKE ALL ON public.ph_projects FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_projects TO authenticated;
GRANT ALL ON public.ph_regions TO service_role;
GRANT ALL ON public.ph_projects TO service_role;

ALTER TABLE public.ph_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ph_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only the Project Hub owner manages regions"
ON public.ph_regions FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_ph_owner())
WITH CHECK (auth.uid() = user_id AND public.is_ph_owner());

CREATE POLICY "Only the Project Hub owner manages projects"
ON public.ph_projects FOR ALL TO authenticated
USING (auth.uid() = user_id AND public.is_ph_owner())
WITH CHECK (auth.uid() = user_id AND public.is_ph_owner());

DELETE FROM public.ph_projects
WHERE user_id NOT IN (SELECT id FROM auth.users WHERE lower(email) = 'anvay.bhanap@gmail.com');

DELETE FROM public.ph_regions
WHERE user_id NOT IN (SELECT id FROM auth.users WHERE lower(email) = 'anvay.bhanap@gmail.com');