create table if not exists private.membership_module_overrides (
  organization_id uuid not null,
  membership_id uuid not null,
  module_code text not null,
  can_read boolean,
  can_write boolean,
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid,
  primary key (organization_id, membership_id, module_code),
  constraint membership_module_overrides_membership_fk
    foreign key (membership_id) references public.organization_memberships(id) on delete cascade,
  constraint membership_module_overrides_module_fk
    foreign key (module_code) references public.modules(code) on delete cascade,
  constraint membership_module_overrides_write_requires_read
    check (can_read is distinct from false or can_write is distinct from true)
);

create index if not exists membership_module_overrides_membership_idx
  on private.membership_module_overrides (membership_id, module_code);

revoke all on private.membership_module_overrides from public, anon, authenticated;

create or replace function private.has_module_access(
  p_organization_id uuid,
  p_module text,
  p_write boolean default false
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
  select private.is_active_member(p_organization_id)
    and private.module_enabled(p_organization_id,p_module)
    and exists (
      select 1
      from public.organization_memberships m
      left join public.role_module_permissions rp
        on rp.organization_id=m.organization_id
       and rp.role=m.role
       and rp.module_code=private.legacy_module_code(p_module)
      left join private.membership_module_overrides mo
        on mo.organization_id=m.organization_id
       and mo.membership_id=m.id
       and mo.module_code=private.legacy_module_code(p_module)
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.active=true
        and coalesce(mo.can_read,rp.can_read,false)=true
        and (
          not p_write
          or (
            coalesce(mo.can_read,rp.can_read,false)=true
            and coalesce(mo.can_write,rp.can_write,false)=true
          )
        )
    )
$function$;

create or replace function private.query_my_navigation(p_organization_id uuid)
returns table(
  module_code text,
  module_name text,
  can_read boolean,
  can_write boolean,
  enabled boolean,
  customized boolean,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','private'
as $function$
begin
  if not private.is_active_member(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    md.code,
    md.name,
    private.has_module_access(p_organization_id,md.code,false),
    private.has_module_access(p_organization_id,md.code,true),
    private.module_enabled(p_organization_id,md.code),
    exists (
      select 1
      from public.organization_memberships m
      join private.membership_module_overrides mo
        on mo.organization_id=m.organization_id
       and mo.membership_id=m.id
       and mo.module_code=md.code
      where m.organization_id=p_organization_id
        and m.user_id=(select auth.uid())
        and m.active=true
    ),
    md.sort_order
  from public.modules md
  where md.active=true
  order by md.sort_order,md.code;
end
$function$;

create or replace function private.command_set_membership_module_access(
  p_organization_id uuid,
  p_membership_id uuid,
  p_module_code text,
  p_can_read boolean,
  p_can_write boolean
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog','public','app','private'
as $function$
declare
  v_target public.organization_memberships%rowtype;
  v_module text;
  v_read boolean;
  v_write boolean;
begin
  if not private.can_manage_users(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  select * into v_target
  from public.organization_memberships
  where id=p_membership_id and organization_id=p_organization_id
  for update;

  if not found then raise exception 'Membership not found'; end if;
  if v_target.is_owner then raise exception 'Owner membership is protected'; end if;

  v_module:=private.legacy_module_code(trim(p_module_code));
  if not exists(select 1 from public.modules where code=v_module and active=true) then
    raise exception 'Invalid module';
  end if;

  if p_can_read is null and p_can_write is null then
    delete from private.membership_module_overrides
    where organization_id=p_organization_id
      and membership_id=p_membership_id
      and module_code=v_module;
  else
    v_read:=coalesce(p_can_read,false);
    v_write:=case when v_read then coalesce(p_can_write,false) else false end;

    insert into private.membership_module_overrides(
      organization_id,membership_id,module_code,can_read,can_write,updated_at,updated_by_user_id
    ) values(
      p_organization_id,p_membership_id,v_module,v_read,v_write,now(),(select auth.uid())
    )
    on conflict (organization_id,membership_id,module_code)
    do update set
      can_read=excluded.can_read,
      can_write=excluded.can_write,
      updated_at=now(),
      updated_by_user_id=(select auth.uid());
  end if;

  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id
  ) values(
    p_organization_id,
    'MembershipModuleAccessChanged',
    'membership',
    p_membership_id,
    jsonb_build_object(
      'moduleCode',v_module,
      'canRead',p_can_read,
      'canWrite',p_can_write,
      'inheritRole',p_can_read is null and p_can_write is null
    ),
    (select auth.uid())
  );
end
$function$;

create or replace function private.query_users_admin(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','public','app','private','auth'
as $function$
declare v_members jsonb; v_invites jsonb;
begin
  if not private.has_module_access(p_organization_id,'users',false) then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membershipId',m.id,
    'userId',m.user_id,
    'displayName',p.display_name,
    'email',u.email,
    'role',m.role,
    'roleCode',private.legacy_role_to_code(m.role),
    'active',m.active,
    'isOwner',m.is_owner,
    'profileActive',coalesce(p.active,true),
    'createdAt',m.created_at,
    'updatedAt',m.updated_at,
    'modules',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'moduleCode',md.code,
        'moduleName',md.name,
        'enabled',private.module_enabled(p_organization_id,md.code),
        'baseCanRead',coalesce(rp.can_read,false),
        'baseCanWrite',coalesce(rp.can_write,false),
        'overrideCanRead',mo.can_read,
        'overrideCanWrite',mo.can_write,
        'effectiveCanRead',private.module_enabled(p_organization_id,md.code) and coalesce(mo.can_read,rp.can_read,false),
        'effectiveCanWrite',private.module_enabled(p_organization_id,md.code) and coalesce(mo.can_read,rp.can_read,false) and coalesce(mo.can_write,rp.can_write,false),
        'customized',mo.membership_id is not null,
        'sortOrder',md.sort_order
      ) order by md.sort_order,md.code),'[]'::jsonb)
      from public.modules md
      left join public.role_module_permissions rp
        on rp.organization_id=m.organization_id
       and rp.role=m.role
       and rp.module_code=md.code
      left join private.membership_module_overrides mo
        on mo.organization_id=m.organization_id
       and mo.membership_id=m.id
       and mo.module_code=md.code
      where md.active=true
    )
  ) order by m.is_owner desc,coalesce(p.display_name,u.email,m.user_id::text)),'[]'::jsonb)
  into v_members
  from public.organization_memberships m
  left join public.profiles p on p.user_id=m.user_id
  left join auth.users u on u.id=m.user_id
  where m.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'email',i.email,'roleCode',i.role_code,'status',i.status,'expiresAt',i.expires_at,
    'acceptedAt',i.accepted_at,'createdAt',i.created_at,'updatedAt',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_invites
  from app.organization_invitations i where i.organization_id=p_organization_id;

  return jsonb_build_object('members',v_members,'invitations',v_invites);
end
$function$;

create or replace function public.v2_my_navigation(organization_id uuid)
returns table(
  module_code text,
  module_name text,
  can_read boolean,
  can_write boolean,
  enabled boolean,
  customized boolean,
  sort_order integer
)
language sql
stable
security definer
set search_path to 'pg_catalog','private'
as $function$
  select * from private.query_my_navigation(organization_id)
$function$;

create or replace function public.v2_set_membership_module_access(
  organization_id uuid,
  membership_id uuid,
  module_code text,
  can_read boolean,
  can_write boolean
)
returns void
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.command_set_membership_module_access(organization_id,membership_id,module_code,can_read,can_write)
$function$;

revoke all on function public.v2_my_navigation(uuid) from public,anon;
grant execute on function public.v2_my_navigation(uuid) to authenticated;

revoke all on function public.v2_set_membership_module_access(uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.v2_set_membership_module_access(uuid,uuid,text,boolean,boolean) to authenticated;;
