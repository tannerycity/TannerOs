-- La asistencia siempre armó el roster por CATEGORÍA. sessions.academy_id existía
-- desde antes pero nadie lo usaba: una sesión de academia daba lista vacía y al
-- guardar rebotaba con "Player is not in session roster".
--
-- Una sola función decide quién pertenece a una sesión, y las tres consultas de
-- asistencia la usan: si difirieran, la lista mostraría a alguien que al guardar
-- sería rechazado.
create or replace function private.session_roster_ids(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid)
language sql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
  -- Por categoría: los inscritos activos de esa categoría.
  select pe.player_id
  from app.sessions s
  join app.player_enrollments pe on pe.organization_id=s.organization_id
   and pe.category_id=s.category_id and pe.status='active'
  join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
   and p.status='active' and p.archived_at is null
  where s.id=p_session_id and s.organization_id=p_organization_id and s.academy_id is null
  union
  -- Por academia: los inscritos cuya inscripción cubre el día de la sesión, para que
  -- quien se dio de baja la semana pasada no siga apareciendo en la lista.
  select e.player_id
  from app.sessions s
  join app.academy_enrollments e on e.organization_id=s.organization_id
   and e.academy_id=s.academy_id
   and e.starts_on<=s.starts_at::date
   and (e.ends_on is null or e.ends_on>=s.starts_at::date)
   and e.status='active'
  join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
   and p.status='active' and p.archived_at is null
  where s.id=p_session_id and s.organization_id=p_organization_id and s.academy_id is not null
$function$;
revoke all on function private.session_roster_ids(uuid,uuid) from public, anon, authenticated;


create or replace function private.query_attendance_roster(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid, code text, player_name text, category_name text, status text,
  arrived_at timestamp with time zone, punctuality text, uniform_status text, attitude_note text,
  injury_note text, pickup_note text, notes text, photo_path text, photo_bucket text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_academy uuid;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  select s.academy_id into v_academy from app.sessions s
  where s.id=p_session_id and s.organization_id=p_organization_id;
  if not found then raise exception 'Session not found'; end if;
  -- Un profesor no puede abrir la lista de una academia que no es suya, ni aunque
  -- escriba el id de la sesión a mano.
  if v_academy is not null and not private.can_see_academy(p_organization_id,v_academy) then
    raise exception 'Not authorized';
  end if;

  return query
  select p.id,p.code,trim(concat_ws(' ',p.first_name,p.last_name)),p.category,
         ar.status,ar.arrived_at,ar.punctuality,ar.uniform_status,ar.attitude_note,
         ar.injury_note,ar.pickup_note,ar.notes,p.photo_path,p.photo_bucket
  from private.session_roster_ids(p_organization_id,p_session_id) r
  join app.players p on p.id=r.player_id
  left join app.attendance_records ar on ar.organization_id=p_organization_id
   and ar.session_id=p_session_id and ar.player_id=p.id
  order by p.first_name,p.last_name,p.id;
end $function$;
revoke all on function private.query_attendance_roster(uuid,uuid) from public, anon, authenticated;


create or replace function private.command_save_attendance(p_organization_id uuid, p_session_id uuid, p_records jsonb)
returns integer
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare r jsonb; v_count integer:=0; v_player uuid; v_status text; v_academy uuid;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_records)<>'array' then raise exception 'Attendance records must be an array'; end if;
  select s.academy_id into v_academy from app.sessions s
  where s.id=p_session_id and s.organization_id=p_organization_id and s.status<>'cancelled';
  if not found then raise exception 'Session not found'; end if;
  if v_academy is not null and not private.can_see_academy(p_organization_id,v_academy) then
    raise exception 'Not authorized';
  end if;

  for r in select value from jsonb_array_elements(p_records)
  loop
    v_player:=(r->>'player_id')::uuid;
    v_status:=r->>'status';
    if v_status not in ('present','absent','late','excused') then raise exception 'Invalid attendance status'; end if;
    if not exists(select 1 from private.session_roster_ids(p_organization_id,p_session_id) q where q.player_id=v_player)
    then raise exception 'Player is not in session roster'; end if;
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
  values(p_organization_id,'AttendanceSaved','session',p_session_id,jsonb_build_object('records',v_count,'academyId',v_academy),(select auth.uid())::text);
  return v_count;
end $function$;
revoke all on function private.command_save_attendance(uuid,uuid,jsonb) from public, anon, authenticated;


-- Crear el entrenamiento de una academia. Es lo que el profesor necesita para poder
-- tomar lista: sin sesión no hay a qué pasarle asistencia.
create or replace function private.command_create_academy_session(
  p_organization_id uuid, p_academy_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz default null,
  p_title text default null, p_location text default null,
  p_session_type text default 'training'
) returns uuid
language plpgsql security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_id uuid; v_nombre text; v_tipo text;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then raise exception 'Not authorized'; end if;
  if not private.can_see_academy(p_organization_id,p_academy_id) then raise exception 'Not authorized'; end if;
  if p_starts_at is null then raise exception 'Escribe cuándo empieza el entrenamiento'; end if;
  if p_ends_at is not null and p_ends_at<p_starts_at then raise exception 'La hora de fin no puede ser antes de la de inicio'; end if;
  v_tipo := case when p_session_type in ('training','academy','evaluation') then p_session_type else 'training' end;

  select name into v_nombre from app.academies
  where id=p_academy_id and organization_id=p_organization_id and archived_at is null;
  if v_nombre is null then raise exception 'Esa academia no existe en el club'; end if;

  insert into app.sessions(organization_id,session_type,academy_id,starts_at,ends_at,location,responsible_user_id,title,status)
  values(p_organization_id,v_tipo,p_academy_id,p_starts_at,p_ends_at,
    nullif(trim(p_location),''),(select auth.uid()),
    coalesce(nullif(trim(p_title),''), v_nombre||' · '||case v_tipo when 'evaluation' then 'Evaluación' else 'Entrenamiento' end),
    'scheduled')
  returning id into v_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AcademySessionCreated','session',v_id,
    jsonb_build_object('academyId',p_academy_id,'academy',v_nombre,'startsAt',p_starts_at,'type',v_tipo),
    (select auth.uid())::text);
  return v_id;
end $function$;
revoke all on function private.command_create_academy_session(uuid,uuid,timestamptz,timestamptz,text,text,text) from public, anon, authenticated;

create or replace function public.v2_create_academy_session(
  organization_id uuid, academy_id uuid, starts_at timestamptz,
  ends_at timestamptz default null, title text default null,
  location text default null, session_type text default 'training'
) returns uuid language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.command_create_academy_session(organization_id,academy_id,starts_at,ends_at,title,location,session_type) $function$;
revoke all on function public.v2_create_academy_session(uuid,uuid,timestamptz,timestamptz,text,text,text) from public, anon;
grant execute on function public.v2_create_academy_session(uuid,uuid,timestamptz,timestamptz,text,text,text) to authenticated;;
