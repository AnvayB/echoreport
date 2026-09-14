GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_regions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ph_projects TO authenticated;
GRANT ALL ON public.ph_regions TO service_role;
GRANT ALL ON public.ph_projects TO service_role;
GRANT EXECUTE ON FUNCTION public.is_ph_owner() TO authenticated;