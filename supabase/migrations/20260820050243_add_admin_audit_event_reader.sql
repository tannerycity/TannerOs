create or replace function private.query_audit_events(
  p_organization_id uuid,
  p_event_type text default null,
  p_aggregate_type text default null,
  p_from_at timestamptz default null,
  p_to_at timestamptz default null,
  p_limit integer default 200
)
returns table(
  id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  actor_label text,
  actor_role text,
  request_id text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, app, private, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.has_module_access(p_organization_id,'admin',false)
     and not private.has_module_access(p_organization_id,'qa',false) then
    raise exception 'Not authorized';
  end if;

  return query
  select e.id,e.event_type,e.aggregate_type,e.aggregate_id,
    coalesce(nullif(e.actor,''),nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),om.role,'Sistema') as actor_label,
    om.role as actor_role,e.request_id,e.occurred_at
  from app.domain_events e
  left join auth.users u on u.id=e.actor_user_id
  left join public.organization_memberships om on om.organization_id=e.organization_id and om.user_id=e.actor_user_id
  where e.organization_id=p_organization_id
    and (p_event_type is null or e.event_type=p_event_type)
    and (p_aggregate_type is null or e.aggregate_type=p_aggregate_type)
    and (p_from_at is null or e.occurred_at>=p_from_at)
    and (p_to_at is null or e.occurred_at<=p_to_at)
  order by e.occurred_at desc
  limit greatest(1,least(coalesce(p_limit,200),500));
end;
$$;
revoke all on function private.query_audit_events(uuid,text,text,timestamptz,timestamptz,integer) from public,anon;
grant execute on function private.query_audit_events(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;

create or replace function public.v2_audit_events(
  organization_id uuid,
  event_type_filter text default null,
  aggregate_type_filter text default null,
  from_at timestamptz default null,
  to_at timestamptz default null,
  result_limit integer default 200
)
returns table(
  id uuid,event_type text,aggregate_type text,aggregate_id uuid,actor_label text,actor_role text,request_id text,occurred_at timestamptz
)
language sql
security invoker
set search_path = pg_catalog, private
as $$
  select * from private.query_audit_events(organization_id,event_type_filter,aggregate_type_filter,from_at,to_at,result_limit);
$$;
revoke all on function public.v2_audit_events(uuid,text,text,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.v2_audit_events(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;;
