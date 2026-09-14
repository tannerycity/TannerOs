-- Eliminación excepcional de gafetes cerrados. El cargo financiero, si existe,
-- no se toca: Presidencia debe anularlo o reembolsarlo desde Contabilidad.
create or replace function public.v2_delete_parking_pass(
  organization_id uuid,
  pass_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app
as $$
declare
  is_presidency boolean := false;
  pass_table regclass;
  event_table regclass;
  pass_status text;
  pass_org uuid;
begin
  select coalesce(bool_or(
    (to_jsonb(context_row)->>'organization_id')::uuid = organization_id
    and (
      lower(coalesce(to_jsonb(context_row)->>'role','')) = 'presidencia'
      or coalesce((to_jsonb(context_row)->>'is_owner')::boolean,false)
    )
  ),false)
  into is_presidency
  from public.v2_my_context() context_row;

  if not is_presidency then
    raise exception 'Only Presidencia can permanently delete parking passes';
  end if;

  pass_table := coalesce(
    to_regclass('app.parking_passes'),
    to_regclass('public.parking_passes')
  );
  if pass_table is null then
    raise exception 'Parking pass table not found';
  end if;

  execute format('select organization_id, status from %s where id = $1',pass_table)
    into pass_org,pass_status using pass_id;
  if pass_org is null or pass_org <> organization_id then
    raise exception 'Parking pass not found';
  end if;
  if pass_status not in ('rejected','revoked','lost','expired') then
    raise exception 'Only closed parking passes can be permanently deleted';
  end if;

  event_table := coalesce(
    to_regclass('app.parking_pass_events'),
    to_regclass('public.parking_pass_events')
  );
  if event_table is not null then
    execute format('delete from %s where pass_id = $1',event_table) using pass_id;
  end if;
  execute format('delete from %s where id = $1 and organization_id = $2',pass_table)
    using pass_id,organization_id;

  return jsonb_build_object('deleted',true,'pass_id',pass_id);
exception
  when foreign_key_violation then
    raise exception 'Parking pass has related records and cannot be permanently deleted';
end;
$$;

revoke all on function public.v2_delete_parking_pass(uuid,uuid) from public;
grant execute on function public.v2_delete_parking_pass(uuid,uuid) to authenticated;
