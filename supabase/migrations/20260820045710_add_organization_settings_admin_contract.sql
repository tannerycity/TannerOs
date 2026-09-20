create or replace function private.query_organization_settings(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'admin',false) then raise exception 'Not authorized'; end if;

  select jsonb_build_object(
    'id',o.id,'slug',o.slug,'name',o.name,'legalName',o.legal_name,'status',o.status,
    'timezone',o.timezone,'locale',o.locale,'currency',o.currency,'settings',o.settings,
    'plan',coalesce((select jsonb_build_object('code',p.code,'name',p.name,'status',s.status,'periodEnd',s.current_period_end,'provider',s.provider)
      from public.subscriptions s join public.plans p on p.id=s.plan_id
      where s.organization_id=o.id order by s.created_at desc limit 1),'{}'::jsonb)
  ) into v_result
  from public.organizations o where o.id=p_organization_id;
  if v_result is null then raise exception 'Organization not found'; end if;
  return v_result;
end;
$$;

revoke all on function private.query_organization_settings(uuid) from public,anon;
grant execute on function private.query_organization_settings(uuid) to authenticated;

create or replace function private.command_update_organization_settings(
  p_organization_id uuid,
  p_name text,
  p_legal_name text,
  p_timezone text,
  p_locale text,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app, private
as $$
declare v_actor uuid:=(select auth.uid()); v_before jsonb; v_after jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'admin',true) then raise exception 'Not authorized'; end if;
  if coalesce(length(trim(p_name)),0)<2 then raise exception 'Organization name required'; end if;
  if not exists(select 1 from pg_timezone_names where name=trim(p_timezone)) then raise exception 'Invalid timezone'; end if;
  if trim(p_locale) !~ '^[a-z]{2}(-[A-Z]{2})?$' then raise exception 'Invalid locale'; end if;
  if trim(p_currency) !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;

  select jsonb_build_object('name',name,'legalName',legal_name,'timezone',timezone,'locale',locale,'currency',currency)
    into v_before from public.organizations where id=p_organization_id for update;
  if v_before is null then raise exception 'Organization not found'; end if;

  update public.organizations set
    name=trim(p_name),legal_name=nullif(trim(coalesce(p_legal_name,'')),''),timezone=trim(p_timezone),
    locale=trim(p_locale),currency=upper(trim(p_currency)),updated_at=now()
  where id=p_organization_id;

  select jsonb_build_object('name',name,'legalName',legal_name,'timezone',timezone,'locale',locale,'currency',currency)
    into v_after from public.organizations where id=p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id)
  values(p_organization_id,'OrganizationSettingsUpdated','organization',p_organization_id,jsonb_build_object('before',v_before,'after',v_after),v_actor);
  return v_after;
end;
$$;

revoke all on function private.command_update_organization_settings(uuid,text,text,text,text,text) from public,anon;
grant execute on function private.command_update_organization_settings(uuid,text,text,text,text,text) to authenticated;

create or replace function public.v2_organization_settings(organization_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.query_organization_settings(organization_id); $$;
revoke all on function public.v2_organization_settings(uuid) from public,anon;
grant execute on function public.v2_organization_settings(uuid) to authenticated;

create or replace function public.v2_update_organization_settings(organization_id uuid,name text,legal_name text,timezone text,locale text,currency text)
returns jsonb language sql security invoker set search_path=pg_catalog,private
as $$ select private.command_update_organization_settings(organization_id,name,legal_name,timezone,locale,currency); $$;
revoke all on function public.v2_update_organization_settings(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.v2_update_organization_settings(uuid,text,text,text,text,text) to authenticated;;
