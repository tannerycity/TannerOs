create table if not exists app.user_player_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references app.players(id) on delete cascade,
  access_kind text not null default 'family' check (access_kind in ('family','player')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  unique (organization_id,user_id,player_id)
);

create index if not exists user_player_access_user_idx
  on app.user_player_access (organization_id,user_id)
  where access_kind='family';

create index if not exists user_player_access_player_idx
  on app.user_player_access (organization_id,player_id);

alter table app.user_player_access enable row level security;
revoke all on table app.user_player_access from public,anon,authenticated;
grant all on table app.user_player_access to service_role;

drop policy if exists user_player_access_read_own on app.user_player_access;
create policy user_player_access_read_own
on app.user_player_access
for select
to authenticated
using (
  user_id=(select auth.uid())
  and private.is_active_member(organization_id)
);

-- El rol Tanner se convierte en la puerta segura para Familias/Tanners.
-- Su calendario vive en Inicio y queda filtrado a los jugadores vinculados.
update public.role_module_permissions
set can_read=false,can_write=false,updated_at=now()
where role='Tanner' and module_code='calendario';

-- Un cambio de perfil debe aplicar una llave limpia. Las excepciones del perfil
-- anterior no se heredan y los vínculos familiares se conservan sólo en Familia.
create or replace function private.command_update_membership_admin(
  p_organization_id uuid,
  p_membership_id uuid,
  p_role_code text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','app','private'
as $$
declare
  v_role text;
  v_previous_role text;
  v_owner boolean;
  v_user uuid;
begin
  if not private.can_manage_users(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  select role,is_owner,user_id
  into v_previous_role,v_owner,v_user
  from public.organization_memberships
  where id=p_membership_id and organization_id=p_organization_id
  for update;

  if v_user is null then raise exception 'Membership not found'; end if;
  if v_owner then raise exception 'Owner membership is protected'; end if;

  v_role:=private.role_code_to_legacy(p_role_code);
  if v_role is null then raise exception 'Invalid role'; end if;

  update public.organization_memberships
  set role=v_role,active=coalesce(p_active,true),updated_at=now()
  where id=p_membership_id;

  if v_role is distinct from v_previous_role then
    delete from private.membership_module_overrides
    where organization_id=p_organization_id and membership_id=p_membership_id;
  end if;

  if v_role<>'Tanner' then
    delete from app.user_player_access
    where organization_id=p_organization_id and user_id=v_user;
  end if;

  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id
  ) values (
    p_organization_id,
    'OrganizationMembershipUpdated',
    'membership',
    p_membership_id,
    jsonb_build_object(
      'roleCode',p_role_code,
      'active',coalesce(p_active,true),
      'previousRole',v_previous_role,
      'permissionsReset',v_role is distinct from v_previous_role
    ),
    (select auth.uid())
  );
end
$$;

create or replace function private.command_set_user_player_access(
  p_organization_id uuid,
  p_target_user_id uuid,
  p_player_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','app','private','auth'
as $$
declare
  v_player_ids uuid[];
  v_membership_id uuid;
begin
  if not private.can_manage_users(p_organization_id) then
    raise exception 'Not authorized';
  end if;

  if not exists(select 1 from auth.users where id=p_target_user_id) then
    raise exception 'User not found';
  end if;

  if not exists(
    select 1
    from public.organization_memberships m
    where m.organization_id=p_organization_id and m.user_id=p_target_user_id
  ) and not exists(
    select 1
    from app.organization_invitations i
    join auth.users u on lower(u.email)=lower(i.email)
    where i.organization_id=p_organization_id
      and i.status='pending'
      and i.expires_at>=now()
      and u.id=p_target_user_id
  ) then
    raise exception 'User is not linked to this organization';
  end if;

  select coalesce(array_agg(distinct player_id),'{}'::uuid[])
  into v_player_ids
  from unnest(coalesce(p_player_ids,'{}'::uuid[])) as player_id;

  if exists(
    select 1
    from unnest(v_player_ids) player_id
    where not exists(
      select 1 from app.players p
      where p.id=player_id
        and p.organization_id=p_organization_id
        and p.archived_at is null
    )
  ) then
    raise exception 'Player not found';
  end if;

  delete from app.user_player_access
  where organization_id=p_organization_id
    and user_id=p_target_user_id
    and access_kind='family';

  insert into app.user_player_access(
    organization_id,user_id,player_id,access_kind,created_by_user_id
  )
  select p_organization_id,p_target_user_id,player_id,'family',(select auth.uid())
  from unnest(v_player_ids) player_id;

  select id into v_membership_id
  from public.organization_memberships
  where organization_id=p_organization_id and user_id=p_target_user_id
  limit 1;

  insert into app.domain_events(
    organization_id,event_type,aggregate_type,aggregate_id,payload,actor_user_id
  ) values (
    p_organization_id,
    'UserPlayerAccessChanged',
    'user_access',
    coalesce(v_membership_id,p_target_user_id),
    jsonb_build_object('targetUserId',p_target_user_id,'playerIds',to_jsonb(v_player_ids)),
    (select auth.uid())
  );
end
$$;

create or replace function public.v2_set_user_player_access(
  organization_id uuid,
  target_user_id uuid,
  player_ids uuid[]
)
returns void
language sql
security definer
set search_path='pg_catalog','private'
as $$
  select private.command_set_user_player_access(organization_id,target_user_id,player_ids)
$$;

revoke all on function public.v2_set_user_player_access(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.v2_set_user_player_access(uuid,uuid,uuid[]) to authenticated,service_role;

create or replace function private.query_users_admin(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','app','private','auth'
as $$
declare
  v_members jsonb;
  v_invites jsonb;
  v_players jsonb;
begin
  if not private.has_module_access(p_organization_id,'users',false) then
    raise exception 'Not authorized';
  end if;

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
    'linkedPlayers',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',pl.id,
        'name',trim(concat_ws(' ',pl.first_name,pl.last_name)),
        'category',pl.category,
        'status',pl.status
      ) order by pl.first_name,pl.last_name),'[]'::jsonb)
      from app.user_player_access upa
      join app.players pl
        on pl.id=upa.player_id
       and pl.organization_id=upa.organization_id
       and pl.archived_at is null
      where upa.organization_id=m.organization_id
        and upa.user_id=m.user_id
        and upa.access_kind='family'
    ),
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
  from app.organization_invitations i
  where i.organization_id=p_organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',pl.id,
    'name',trim(concat_ws(' ',pl.first_name,pl.last_name)),
    'category',pl.category,
    'status',pl.status
  ) order by pl.status='active' desc,pl.first_name,pl.last_name),'[]'::jsonb)
  into v_players
  from app.players pl
  where pl.organization_id=p_organization_id and pl.archived_at is null;

  return jsonb_build_object('members',v_members,'invitations',v_invites,'players',v_players);
end
$$;

create or replace function private.query_family_home(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','app','private'
as $$
declare
  v_user_id uuid:=(select auth.uid());
  v_timezone text;
  v_players jsonb;
  v_payments jsonb;
  v_calendar jsonb;
  v_total_paid numeric:=0;
  v_balance numeric:=0;
begin
  if v_user_id is null or not exists(
    select 1
    from public.organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=v_user_id
      and m.active=true
      and m.role='Tanner'
  ) then
    raise exception 'Not authorized';
  end if;

  select timezone into v_timezone
  from public.organizations where id=p_organization_id;
  v_timezone:=coalesce(v_timezone,'America/Mexico_City');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'code',p.code,'firstName',p.first_name,'lastName',p.last_name,
    'birthDate',p.birth_date,'status',p.status,'category',p.category,'position',p.position,
    'dominantFoot',p.dominant_foot,'jerseyNumber',p.jersey_number,'school',p.school,
    'photoBucket',p.photo_bucket,'photoPath',p.photo_path,'joinedAt',p.joined_at
  ) order by p.first_name,p.last_name),'[]'::jsonb)
  into v_players
  from app.user_player_access upa
  join app.players p
    on p.id=upa.player_id
   and p.organization_id=upa.organization_id
   and p.archived_at is null
  where upa.organization_id=p_organization_id
    and upa.user_id=v_user_id
    and upa.access_kind='family';

  select coalesce(jsonb_agg(payment order by payment_date desc,created_at desc),'[]'::jsonb)
  into v_payments
  from (
    select jsonb_build_object(
      'id',pay.id,'playerId',pay.player_id,
      'playerName',trim(concat_ws(' ',p.first_name,p.last_name)),
      'amount',pay.amount,'paymentDate',pay.payment_date,'method',pay.method,
      'concept',coalesce(pay.concept,pay.category,'Pago'),'status',pay.status
    ) payment,pay.payment_date,pay.created_at
    from app.payments pay
    join app.user_player_access upa
      on upa.organization_id=pay.organization_id
     and upa.player_id=pay.player_id
     and upa.user_id=v_user_id
     and upa.access_kind='family'
    join app.players p on p.id=pay.player_id and p.organization_id=pay.organization_id
    where pay.organization_id=p_organization_id
    order by pay.payment_date desc,pay.created_at desc
    limit 100
  ) recent_payments;

  select coalesce(sum(pay.amount),0)
  into v_total_paid
  from app.payments pay
  join app.user_player_access upa
    on upa.organization_id=pay.organization_id
   and upa.player_id=pay.player_id
   and upa.user_id=v_user_id
   and upa.access_kind='family'
  where pay.organization_id=p_organization_id
    and pay.status='posted'
    and pay.payment_date>=date_trunc('year',current_date)::date;

  select coalesce(sum(greatest(coalesce(cb.balance_due,0),0)),0)
  into v_balance
  from app.charge_balances cb
  join app.user_player_access upa
    on upa.organization_id=cb.organization_id
   and upa.player_id=cb.player_id
   and upa.user_id=v_user_id
   and upa.access_kind='family'
  where cb.organization_id=p_organization_id;

  with linked_players as (
    select p.*
    from app.user_player_access upa
    join app.players p
      on p.id=upa.player_id
     and p.organization_id=upa.organization_id
     and p.archived_at is null
    where upa.organization_id=p_organization_id
      and upa.user_id=v_user_id
      and upa.access_kind='family'
  ), items as (
    select s.starts_at sort_at,jsonb_build_object(
      'source','session','title',coalesce(s.title,'Entrenamiento'),'startsAt',s.starts_at,
      'endsAt',s.ends_at,'allDay',false,'kind',s.session_type,'location',s.location,
      'detail',coalesce(c.name,a.name)
    ) item
    from app.sessions s
    left join app.categories c on c.id=s.category_id and c.organization_id=s.organization_id
    left join app.academies a on a.id=s.academy_id and a.organization_id=s.organization_id
    where s.organization_id=p_organization_id
      and s.status='scheduled'
      and s.starts_at>=now()
      and s.starts_at<now()+interval '45 days'
      and (
        s.category_id is null
        or exists(select 1 from linked_players lp where nullif(lp.category,'')=c.name)
      )
    union all
    select make_timestamptz(extract(year from m.match_date)::int,extract(month from m.match_date)::int,extract(day from m.match_date)::int,12,0,0,v_timezone),
      jsonb_build_object(
        'source','match','title',concat_ws(' · ',nullif(m.category,''),case when nullif(m.opponent,'') is not null then 'vs '||m.opponent end),
        'startsAt',make_timestamptz(extract(year from m.match_date)::int,extract(month from m.match_date)::int,extract(day from m.match_date)::int,12,0,0,v_timezone),
        'endsAt',null,'allDay',true,'kind','match','location',m.location,
        'detail',concat_ws(' · ',m.tournament,m.phase)
      )
    from app.matches m
    where m.organization_id=p_organization_id
      and m.archived_at is null
      and m.status='scheduled'
      and m.match_date>=current_date
      and m.match_date<current_date+45
      and exists(select 1 from linked_players lp where nullif(lp.category,'')=nullif(m.category,''))
    union all
    select make_timestamptz(extract(year from p.starts_on)::int,extract(month from p.starts_on)::int,extract(day from p.starts_on)::int,12,0,0,v_timezone),
      jsonb_build_object(
        'source','program','title',p.name,
        'startsAt',make_timestamptz(extract(year from p.starts_on)::int,extract(month from p.starts_on)::int,extract(day from p.starts_on)::int,12,0,0,v_timezone),
        'endsAt',null,'allDay',true,'kind',p.program_type,'location',p.location,'detail',p.category_label
      )
    from app.programs p
    where p.organization_id=p_organization_id
      and p.archived_at is null
      and p.public_registration_enabled=true
      and p.status in ('published','active')
      and p.starts_on>=current_date
      and p.starts_on<current_date+45
    union all
    select e.starts_at,jsonb_build_object(
      'source','event','title',e.title,'startsAt',e.starts_at,'endsAt',null,'allDay',false,
      'kind',coalesce(e.event_type,'event'),'location',e.location,'detail',concat_ws(' · ',e.rival,e.jersey)
    )
    from app.club_events e
    where e.organization_id=p_organization_id
      and e.archived_at is null
      and e.starts_at>=now()
      and e.starts_at<now()+interval '45 days'
      and coalesce(e.status,'scheduled')='scheduled'
    union all
    select b.bday,jsonb_build_object(
      'source','birthday','title',trim(concat_ws(' ',lp.first_name,lp.last_name)),
      'startsAt',b.bday,'endsAt',null,'allDay',true,'kind','birthday','location',null,'detail','Cumpleaños Tanner'
    )
    from linked_players lp
    cross join lateral (
      select make_timestamptz(
        birthday_year,
        extract(month from lp.birth_date)::int,
        least(
          extract(day from lp.birth_date)::int,
          extract(day from (make_date(birthday_year,extract(month from lp.birth_date)::int,1)+interval '1 month - 1 day'))::int
        ),
        12,0,0,v_timezone
      ) bday
      from generate_series(
        extract(year from current_date)::int,
        extract(year from current_date)::int+1
      ) birthday_year
    ) b
    where lp.birth_date is not null and b.bday>=now() and b.bday<now()+interval '45 days'
  )
  select coalesce(jsonb_agg(item order by sort_at),'[]'::jsonb)
  into v_calendar
  from (select item,sort_at from items order by sort_at limit 24) upcoming;

  return jsonb_build_object(
    'players',v_players,
    'payments',v_payments,
    'calendar',v_calendar,
    'summary',jsonb_build_object(
      'totalPaidYear',v_total_paid,
      'balanceDue',v_balance,
      'playerCount',jsonb_array_length(v_players),
      'paymentCount',jsonb_array_length(v_payments),
      'upcomingCount',jsonb_array_length(v_calendar)
    )
  );
end
$$;

create or replace function public.v2_family_home(organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path='pg_catalog','private'
as $$
  select private.query_family_home(organization_id)
$$;

revoke all on function public.v2_family_home(uuid) from public,anon;
grant execute on function public.v2_family_home(uuid) to authenticated,service_role;
;
