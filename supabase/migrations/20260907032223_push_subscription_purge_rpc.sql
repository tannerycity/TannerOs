create or replace function private.command_purge_push_subscriptions(p_endpoints text[])
returns void
language sql
security definer
set search_path to 'pg_catalog','app','private'
as $function$
  delete from app.push_subscriptions where endpoint = any(p_endpoints)
$function$;

create or replace function public.v2_purge_push_subscriptions(endpoints text[])
returns void
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_purge_push_subscriptions(endpoints)
$function$;

revoke all on function private.command_purge_push_subscriptions(text[]) from public, anon, authenticated;
revoke all on function public.v2_purge_push_subscriptions(text[]) from public, anon, authenticated;
;
