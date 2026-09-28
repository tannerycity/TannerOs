create or replace function public.v2_set_product_photo(
  organization_id uuid, product_id uuid,
  photo_path text default null, photo_thumb_path text default null, photo_bucket text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$
  select private.command_set_product_photo(organization_id,product_id,photo_path,photo_thumb_path,photo_bucket);
$$;

create or replace function public.v2_portal_accept_consent(player_id uuid, code text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.portal_accept_consent(player_id, code); $$;

create or replace function public.v2_portal_request_benefit(player_id uuid, reason text)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.portal_request_benefit(player_id, reason); $$;

create or replace function public.v2_portal_paperwork(player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.portal_paperwork(player_id); $$;

create or replace function public.v2_portal_progress(player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$
  select private.portal_progress(player_id);
$$;

create or replace function public.v2_benefit_requests(organization_id uuid, player_id uuid)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.query_benefit_requests(organization_id, player_id); $$;

create or replace function public.v2_resolve_benefit_request(
  organization_id uuid, request_id uuid, status text, note text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$ select private.command_resolve_benefit_request(organization_id, request_id, status, note); $$;

create or replace function public.v2_update_club_config(
  organization_id uuid, whatsapp text default null,
  password_prefix text default null, store_url text default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $$
  select private.command_update_club_config(organization_id,whatsapp,password_prefix,store_url);
$$;

do $$
declare v_rotos text;
begin
  select string_agg(w.wrapper, ', ' order by w.wrapper) into v_rotos
  from (
    select p.oid as woid, p.proname as wrapper, p.prosecdef,
           (regexp_match(pg_get_functiondef(p.oid), 'private\.([a-z0-9_]+)\s*\('))[1] as llamada
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'v2\_%'
  ) w
  join pg_proc pp on pp.proname = w.llamada
  join pg_namespace pn on pn.oid = pp.pronamespace and pn.nspname = 'private'
  where not w.prosecdef
    and has_function_privilege('authenticated', w.woid, 'EXECUTE')
    and not has_function_privilege('authenticated', pp.oid, 'EXECUTE');

  if v_rotos is not null then
    raise exception 'Siguen rotos estos wrappers: %', v_rotos;
  end if;
end $$;;
