-- El candado anterior solo miraba las sesiones CON academia: una sesión de categoría
-- del club pasaba libre, así que el profesor de porteros podía abrir la lista de T12
-- y hasta guardarla. Esta función decide de una sola vez qué sesiones puede tocar
-- cada quien, y la usan la lista y el guardado.
create or replace function private.can_touch_session(p_organization_id uuid, p_session_id uuid)
returns boolean
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_academy uuid; v_mias uuid[]; v_del_club boolean;
begin
  select s.academy_id into v_academy from app.sessions s
  where s.id=p_session_id and s.organization_id=p_organization_id;
  if not found then return false; end if;

  -- Quien administra academias o trabaja con la plantilla del club puede con todas:
  -- Presidencia, Operaciones y los Formadores que entrenan categorías.
  v_del_club := private.is_academy_admin(p_organization_id)
             or private.has_module_access(p_organization_id,'jugadores',false);
  if v_del_club then return true; end if;

  select coalesce(array_agg(x),'{}') into v_mias from private.my_academy_ids(p_organization_id) x;
  -- Sin academias asignadas no se acota nada: es alguien de asistencia sin relación
  -- con academias, y ese caso ya lo cubre el permiso del módulo.
  if cardinality(v_mias)=0 then return true; end if;

  -- Profesor de academia: solo sus academias. Una sesión sin academia es del club.
  return v_academy is not null and v_academy = any(v_mias);
end $function$;
revoke all on function private.can_touch_session(uuid,uuid) from public, anon, authenticated;


create or replace function private.query_attendance_roster(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid, code text, player_name text, category_name text, status text,
  arrived_at timestamp with time zone, punctuality text, uniform_status text, attitude_note text,
  injury_note text, pickup_note text, notes text, photo_path text, photo_bucket text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from app.sessions s where s.id=p_session_id and s.organization_id=p_organization_id)
    then raise exception 'Session not found'; end if;
  if not private.can_touch_session(p_organization_id,p_session_id) then raise exception 'Not authorized'; end if;

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
  if not private.can_touch_session(p_organization_id,p_session_id) then raise exception 'Not authorized'; end if;

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
revoke all on function private.command_save_attendance(uuid,uuid,jsonb) from public, anon, authenticated;;
