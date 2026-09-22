-- Canonical current categories for TannerOS v2.
create unique index if not exists ux_categories_org_code on app.categories(organization_id,code);
create unique index if not exists ux_player_enrollments_active_player on app.player_enrollments(organization_id,player_id) where status='active';

insert into app.categories(organization_id,code,name,status,sort_order)
values
('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','mini_baby_tanner','Mini Baby Tanner','active',10),
('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','baby_tanner','Baby Tanner','active',20),
('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','t8','T8','active',30),
('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','t10','T10','active',40),
('3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8','t12','T12','active',50)
on conflict (organization_id,name) do update set code=excluded.code,status='active',sort_order=excluded.sort_order,updated_at=now();

insert into app.player_enrollments(organization_id,player_id,category_id,starts_on,status,notes)
select p.organization_id,p.id,c.id,current_date,'active','Normalized from current player category during TannerOS v2 attendance cutover'
from app.players p
join app.categories c on c.organization_id=p.organization_id and c.name=p.category
where p.organization_id='3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
  and p.status='active'
  and p.category is not null
  and not exists (
    select 1 from app.player_enrollments pe
    where pe.organization_id=p.organization_id and pe.player_id=p.id and pe.status='active'
  );

create or replace function private.query_attendance_categories(p_organization_id uuid)
returns table(category_id uuid,code text,name text,active_players bigint)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  return query
  select c.id,c.code,c.name,count(pe.player_id)
  from app.categories c
  left join app.player_enrollments pe on pe.organization_id=c.organization_id and pe.category_id=c.id and pe.status='active'
  left join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id and p.status='active'
  where c.organization_id=p_organization_id and c.status='active'
  group by c.id,c.code,c.name,c.sort_order
  order by c.sort_order nulls last,c.name;
end $$;

create or replace function private.query_attendance_sessions(p_organization_id uuid,p_from timestamptz default null,p_to timestamptz default null)
returns table(session_id uuid,session_type text,title text,category_id uuid,category_name text,starts_at timestamptz,ends_at timestamptz,location text,status text,responsible_user_id uuid,present_count bigint,roster_count bigint)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
begin
  if not private.has_any_module_access(p_organization_id,array['attendance','calendar'],false) then raise exception 'Not authorized'; end if;
  return query
  select s.id,s.session_type,coalesce(s.title,c.name||' · Entrenamiento'),s.category_id,c.name,s.starts_at,s.ends_at,s.location,s.status,s.responsible_user_id,
         count(ar.player_id) filter(where ar.status in ('present','late')),
         (select count(*) from app.player_enrollments pe join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id where pe.organization_id=s.organization_id and pe.category_id=s.category_id and pe.status='active' and p.status='active')
  from app.sessions s
  left join app.categories c on c.id=s.category_id and c.organization_id=s.organization_id
  left join app.attendance_records ar on ar.session_id=s.id and ar.organization_id=s.organization_id
  where s.organization_id=p_organization_id
    and s.session_type in ('training','academy','evaluation')
    and (p_from is null or s.starts_at>=p_from)
    and (p_to is null or s.starts_at<p_to)
  group by s.id,c.id,c.name
  order by s.starts_at desc;
end $$;

create or replace function private.command_create_attendance_session(
  p_organization_id uuid,p_category_id uuid,p_starts_at timestamptz,p_ends_at timestamptz default null,p_title text default null,p_location text default null
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
declare v_id uuid; v_category text;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then raise exception 'Not authorized'; end if;
  if p_starts_at is null then raise exception 'Session start required'; end if;
  if p_ends_at is not null and p_ends_at<p_starts_at then raise exception 'Invalid session range'; end if;
  select name into v_category from app.categories where id=p_category_id and organization_id=p_organization_id and status='active';
  if v_category is null then raise exception 'Category not found'; end if;
  insert into app.sessions(organization_id,session_type,category_id,starts_at,ends_at,location,responsible_user_id,title,status)
  values(p_organization_id,'training',p_category_id,p_starts_at,p_ends_at,nullif(trim(p_location),''),(select auth.uid()),coalesce(nullif(trim(p_title),''),v_category||' · Entrenamiento'),'scheduled')
  returning id into v_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AttendanceSessionCreated','session',v_id,jsonb_build_object('category_id',p_category_id,'starts_at',p_starts_at),(select auth.uid())::text);
  return v_id;
end $$;

create or replace function private.query_attendance_roster(p_organization_id uuid,p_session_id uuid)
returns table(player_id uuid,code text,player_name text,category_name text,status text,arrived_at timestamptz,punctuality text,uniform_status text,attitude_note text,injury_note text,pickup_note text,notes text)
language plpgsql stable security definer
set search_path=pg_catalog,app,private
as $$
declare v_category uuid;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  select category_id into v_category from app.sessions where id=p_session_id and organization_id=p_organization_id;
  if not found then raise exception 'Session not found'; end if;
  return query
  select p.id,p.code,trim(concat_ws(' ',p.first_name,p.last_name)),c.name,ar.status,ar.arrived_at,ar.punctuality,ar.uniform_status,ar.attitude_note,ar.injury_note,ar.pickup_note,ar.notes
  from app.player_enrollments pe
  join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
  join app.categories c on c.id=pe.category_id and c.organization_id=pe.organization_id
  left join app.attendance_records ar on ar.organization_id=pe.organization_id and ar.session_id=p_session_id and ar.player_id=p.id
  where pe.organization_id=p_organization_id and pe.category_id=v_category and pe.status='active' and p.status='active'
  order by p.first_name,p.last_name,p.id;
end $$;

create or replace function private.command_save_attendance(p_organization_id uuid,p_session_id uuid,p_records jsonb)
returns integer
language plpgsql security definer
set search_path=pg_catalog,app,private
as $$
declare r jsonb; v_count integer:=0; v_player uuid; v_status text;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_records)<>'array' then raise exception 'Attendance records must be an array'; end if;
  if not exists(select 1 from app.sessions where id=p_session_id and organization_id=p_organization_id and status<>'cancelled') then raise exception 'Session not found'; end if;
  for r in select value from jsonb_array_elements(p_records)
  loop
    v_player:=(r->>'player_id')::uuid;
    v_status:=r->>'status';
    if v_status not in ('present','absent','late','excused') then raise exception 'Invalid attendance status'; end if;
    if not exists(
      select 1 from app.sessions s
      join app.player_enrollments pe on pe.organization_id=s.organization_id and pe.category_id=s.category_id and pe.status='active'
      join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id and p.status='active'
      where s.id=p_session_id and s.organization_id=p_organization_id and p.id=v_player
    ) then raise exception 'Player is not in session roster'; end if;
    insert into app.attendance_records(organization_id,session_id,player_id,status,arrived_at,punctuality,uniform_status,attitude_note,injury_note,pickup_note,notes,recorded_by_user_id,recorded_at,updated_at)
    values(p_organization_id,p_session_id,v_player,v_status,
      case when nullif(r->>'arrived_at','') is null then null else (r->>'arrived_at')::timestamptz end,
      nullif(r->>'punctuality',''),nullif(r->>'uniform_status',''),nullif(r->>'attitude_note',''),nullif(r->>'injury_note',''),nullif(r->>'pickup_note',''),nullif(r->>'notes',''),(select auth.uid()),now(),now())
    on conflict(session_id,player_id) do update set
      status=excluded.status,arrived_at=excluded.arrived_at,punctuality=excluded.punctuality,uniform_status=excluded.uniform_status,
      attitude_note=excluded.attitude_note,injury_note=excluded.injury_note,pickup_note=excluded.pickup_note,notes=excluded.notes,
      recorded_by_user_id=excluded.recorded_by_user_id,updated_at=now();
    v_count:=v_count+1;
  end loop;
  update app.sessions set status='completed',updated_at=now() where id=p_session_id and organization_id=p_organization_id;
  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AttendanceSaved','session',p_session_id,jsonb_build_object('records',v_count),(select auth.uid())::text);
  return v_count;
end $$;

-- Public authenticated RPC surface.
create or replace function public.v2_attendance_categories(organization_id uuid)
returns table(category_id uuid,code text,name text,active_players bigint)
language sql security definer set search_path=pg_catalog,private
as $$ select * from private.query_attendance_categories(organization_id) $$;

create or replace function public.v2_attendance_sessions(organization_id uuid,from_at timestamptz default null,to_at timestamptz default null)
returns table(session_id uuid,session_type text,title text,category_id uuid,category_name text,starts_at timestamptz,ends_at timestamptz,location text,status text,responsible_user_id uuid,present_count bigint,roster_count bigint)
language sql security definer set search_path=pg_catalog,private
as $$ select * from private.query_attendance_sessions(organization_id,from_at,to_at) $$;

create or replace function public.v2_create_attendance_session(organization_id uuid,category_id uuid,starts_at timestamptz,ends_at timestamptz default null,title text default null,location text default null)
returns uuid language sql security definer set search_path=pg_catalog,private
as $$ select private.command_create_attendance_session(organization_id,category_id,starts_at,ends_at,title,location) $$;

create or replace function public.v2_attendance_roster(organization_id uuid,session_id uuid)
returns table(player_id uuid,code text,player_name text,category_name text,status text,arrived_at timestamptz,punctuality text,uniform_status text,attitude_note text,injury_note text,pickup_note text,notes text)
language sql security definer set search_path=pg_catalog,private
as $$ select * from private.query_attendance_roster(organization_id,session_id) $$;

create or replace function public.v2_save_attendance(organization_id uuid,session_id uuid,records jsonb)
returns integer language sql security definer set search_path=pg_catalog,private
as $$ select private.command_save_attendance(organization_id,session_id,records) $$;

revoke all on function public.v2_attendance_categories(uuid) from public;
revoke all on function public.v2_attendance_sessions(uuid,timestamptz,timestamptz) from public;
revoke all on function public.v2_create_attendance_session(uuid,uuid,timestamptz,timestamptz,text,text) from public;
revoke all on function public.v2_attendance_roster(uuid,uuid) from public;
revoke all on function public.v2_save_attendance(uuid,uuid,jsonb) from public;
grant execute on function public.v2_attendance_categories(uuid) to authenticated,service_role;
grant execute on function public.v2_attendance_sessions(uuid,timestamptz,timestamptz) to authenticated,service_role;
grant execute on function public.v2_create_attendance_session(uuid,uuid,timestamptz,timestamptz,text,text) to authenticated,service_role;
grant execute on function public.v2_attendance_roster(uuid,uuid) to authenticated,service_role;
grant execute on function public.v2_save_attendance(uuid,uuid,jsonb) to authenticated,service_role;
;
