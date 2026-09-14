CREATE OR REPLACE FUNCTION public.is_ph_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT lower(coalesce((auth.jwt() ->> 'email'), '')) = 'anvay.bhanap@gmail.com'
$function$;