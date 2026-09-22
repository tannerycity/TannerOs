create or replace function public.gateway_legacy_user_by_username(p_org uuid, p_username text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(u)
  from migration.legacy_users u
  where u.organization_id = p_org
    and lower(u.username) = lower(trim(p_username))
    and u.deleted = false
  limit 1;
$$;

create or replace function public.gateway_legacy_user_by_hash(p_org uuid, p_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(u)
  from migration.legacy_users u
  where u.organization_id = p_org
    and u.password_hash = p_hash
    and u.deleted = false
    and u.active = true
  limit 1;
$$;

create or replace function public.gateway_legacy_users_list(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(u) order by lower(u.username)), '[]'::jsonb)
  from migration.legacy_users u
  where u.organization_id = p_org;
$$;

create or replace function public.gateway_legacy_users_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from migration.legacy_users u
  where u.organization_id = p_org
    and u.deleted = false
    and u.active = true;
$$;

create or replace function public.gateway_legacy_user_upsert(p_org uuid, p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(p_record->>'id','');
  v_old jsonb := '{}'::jsonb;
  v_merged jsonb;
  v_row migration.legacy_users;
begin
  if v_id is null then
    raise exception 'id requerido';
  end if;

  select to_jsonb(u) into v_old
  from migration.legacy_users u
  where u.organization_id = p_org and u.id = v_id
  limit 1;

  v_merged := jsonb_build_object(
    'id', v_id,
    'organization_id', p_org,
    'created_at', now(),
    'updated_at', now(),
    'server_received_at', now(),
    'legacy_updated_at', now(),
    'row_version', 1,
    'deleted', false,
    'active', true
  ) || coalesce(v_old,'{}'::jsonb) || p_record || jsonb_build_object(
    'organization_id', p_org,
    'updated_at', now(),
    'server_received_at', now(),
    'legacy_updated_at', now(),
    'row_version', coalesce((v_old->>'row_version')::integer,0)+1
  );

  v_row := jsonb_populate_record(null::migration.legacy_users, v_merged);
  delete from migration.legacy_users where organization_id = p_org and id = v_id;
  insert into migration.legacy_users select v_row.*;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.gateway_legacy_user_by_username(uuid,text) from public, anon, authenticated;
revoke all on function public.gateway_legacy_user_by_hash(uuid,text) from public, anon, authenticated;
revoke all on function public.gateway_legacy_users_list(uuid) from public, anon, authenticated;
revoke all on function public.gateway_legacy_users_count(uuid) from public, anon, authenticated;
revoke all on function public.gateway_legacy_user_upsert(uuid,jsonb) from public, anon, authenticated;

grant execute on function public.gateway_legacy_user_by_username(uuid,text) to service_role;
grant execute on function public.gateway_legacy_user_by_hash(uuid,text) to service_role;
grant execute on function public.gateway_legacy_users_list(uuid) to service_role;
grant execute on function public.gateway_legacy_users_count(uuid) to service_role;
grant execute on function public.gateway_legacy_user_upsert(uuid,jsonb) to service_role;;
