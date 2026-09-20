create table if not exists app.legacy_source_configs (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  source_type text not null default 'apps_script' check (source_type in ('apps_script','spreadsheet_export','other')),
  endpoint_secret_name text not null,
  token_secret_name text not null,
  status text not null default 'active' check (status in ('active','paused','retired')),
  last_checked_at timestamptz,
  last_remote_server_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.legacy_source_configs enable row level security;
revoke all on app.legacy_source_configs from public,anon,authenticated;

insert into app.legacy_source_configs(organization_id,source_type,endpoint_secret_name,token_secret_name,status)
values('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'::uuid,'apps_script','tannery_legacy_v1_endpoint','tannery_legacy_v1_token','active')
on conflict (organization_id) do update set source_type=excluded.source_type,endpoint_secret_name=excluded.endpoint_secret_name,token_secret_name=excluded.token_secret_name,status=excluded.status,updated_at=now();

create or replace function private.query_cutover_source_admin(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,private,vault
as $$
declare v_cfg app.legacy_source_configs%rowtype; v_endpoint text; v_token text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_cfg from app.legacy_source_configs where organization_id=p_organization_id and status='active';
  if v_cfg.organization_id is null then raise exception 'No active legacy source'; end if;
  select decrypted_secret into v_endpoint from vault.decrypted_secrets where name=v_cfg.endpoint_secret_name limit 1;
  select decrypted_secret into v_token from vault.decrypted_secrets where name=v_cfg.token_secret_name limit 1;
  if coalesce(v_endpoint,'')='' or coalesce(v_token,'')='' then raise exception 'Legacy source secret missing'; end if;
  return jsonb_build_object('sourceType',v_cfg.source_type,'endpoint',v_endpoint,'token',v_token);
end;
$$;
revoke all on function private.query_cutover_source_admin(uuid) from public,anon,authenticated;
grant execute on function private.query_cutover_source_admin(uuid) to service_role;

create or replace function private.query_cutover_inventory_admin(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,app,private
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  return jsonb_build_object(
    'players',coalesce((select jsonb_agg(legacy_id) from app.players where organization_id=p_organization_id and legacy_id is not null),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(legacy_id) from (
      select legacy_id from app.payments where organization_id=p_organization_id and legacy_id is not null
      union
      select legacy_id from app.expenses where organization_id=p_organization_id and legacy_id is not null
    ) x),'[]'::jsonb),
    'prospects',coalesce((select jsonb_agg(legacy_id) from app.prospects where organization_id=p_organization_id and legacy_id is not null),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(legacy_id) from app.orders where organization_id=p_organization_id and legacy_id is not null),'[]'::jsonb)
  );
end;
$$;
revoke all on function private.query_cutover_inventory_admin(uuid) from public,anon,authenticated;
grant execute on function private.query_cutover_inventory_admin(uuid) to service_role;

create or replace function public.v2_cutover_source_admin(organization_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.query_cutover_source_admin(organization_id); $$;
revoke all on function public.v2_cutover_source_admin(uuid) from public,anon,authenticated;
grant execute on function public.v2_cutover_source_admin(uuid) to service_role;

create or replace function public.v2_cutover_inventory_admin(organization_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.query_cutover_inventory_admin(organization_id); $$;
revoke all on function public.v2_cutover_inventory_admin(uuid) from public,anon,authenticated;
grant execute on function public.v2_cutover_inventory_admin(uuid) to service_role;;
