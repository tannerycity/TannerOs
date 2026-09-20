drop function if exists public.rls_auto_enable() cascade;
drop extension if exists citext cascade;
alter function public.tanner_touch_row() set search_path = public, pg_temp;;
