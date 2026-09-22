-- Los wrappers públicos que funcionan en este proyecto (v2_calendar,
-- v2_open_receivables) son SECURITY DEFINER: sin eso, el rol authenticated
-- corre el wrapper como sí mismo y choca contra el revoke de la función
-- private. v2_player_account_statement se publicó sin definer, así que el
-- estado de cuenta fallaba con "permission denied" en producción.
-- El control de acceso no se debilita: cada función private sigue exigiendo
-- su permiso de módulo, y las del portal siguen resolviendo por auth.uid().
create or replace function public.v2_player_account_statement(organization_id uuid, player_id uuid)
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.query_player_account_statement(organization_id, player_id) $$;

create or replace function public.v2_portal_home()
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.portal_home() $$;

create or replace function public.v2_portal_statement(player_id uuid)
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.portal_statement(player_id) $$;

create or replace function public.v2_portal_calendar(from_at timestamptz, to_at timestamptz)
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.portal_calendar(from_at, to_at) $$;

create or replace function public.v2_portal_catalog()
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.portal_catalog() $$;

create or replace function public.v2_portal_place_order(player_id uuid, items jsonb, notes text default null)
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','private'
as $$ begin return private.portal_place_order(player_id, items, notes); end $$;

create or replace function public.v2_guardian_access(organization_id uuid)
returns jsonb language sql security definer
set search_path to 'pg_catalog','private'
as $$ select private.query_guardian_access(organization_id) $$;

do $$
declare f text;
begin
  foreach f in array array['public.v2_player_account_statement(uuid,uuid)','public.v2_portal_home()',
    'public.v2_portal_statement(uuid)','public.v2_portal_calendar(timestamptz,timestamptz)',
    'public.v2_portal_catalog()','public.v2_portal_place_order(uuid,jsonb,text)',
    'public.v2_guardian_access(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;;
