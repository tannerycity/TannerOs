-- 1) Roster de asistencia: además de status, excluir archivados.
create or replace function private.query_attendance_roster(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid, code text, player_name text, category_name text, status text,
              arrived_at timestamptz, punctuality text, uniform_status text, attitude_note text,
              injury_note text, pickup_note text, notes text, photo_path text, photo_bucket text)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_category uuid;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  select category_id into v_category from app.sessions where id=p_session_id and organization_id=p_organization_id;
  if not found then raise exception 'Session not found'; end if;
  return query
  select p.id,p.code,trim(concat_ws(' ',p.first_name,p.last_name)),c.name,ar.status,ar.arrived_at,ar.punctuality,ar.uniform_status,ar.attitude_note,ar.injury_note,ar.pickup_note,ar.notes,p.photo_path,p.photo_bucket
  from app.player_enrollments pe
  join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
  join app.categories c on c.id=pe.category_id and c.organization_id=pe.organization_id
  left join app.attendance_records ar on ar.organization_id=pe.organization_id and ar.session_id=p_session_id and ar.player_id=p.id
  where pe.organization_id=p_organization_id and pe.category_id=v_category
    and pe.status='active' and p.status='active' and p.archived_at is null
  order by p.first_name,p.last_name,p.id;
end $function$;

-- 2) Tarjetas de categoría: contaba pe.player_id bajo un LEFT JOIN filtrado por p.status,
--    así que un Tanner de baja con inscripción abierta seguía sumando al conteo aunque
--    no apareciera en la lista. Se cuenta el jugador, no la inscripción.
create or replace function private.query_attendance_categories(p_organization_id uuid)
returns table(category_id uuid, code text, name text, active_players bigint)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  return query
  select c.id,c.code,c.name,count(p.id)
  from app.categories c
  left join app.player_enrollments pe on pe.organization_id=c.organization_id and pe.category_id=c.id and pe.status='active'
  left join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id and p.status='active' and p.archived_at is null
  where c.organization_id=p_organization_id and c.status='active'
  group by c.id,c.code,c.name,c.sort_order
  order by c.sort_order nulls last,c.name;
end $function$;

-- 3) Sesiones: roster_count se calculaba con la plantilla de HOY mientras present_count
--    contaba los registros guardados, incluidos Tanners que ya se dieron de baja.
--    Eso producía marcadores imposibles (p. ej. 13 presentes de 12). El roster de una
--    sesión es ahora la unión de la plantilla vigente y de quien tenga registro en ella.
create or replace function private.query_attendance_sessions(p_organization_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table(session_id uuid, session_type text, title text, category_id uuid, category_name text,
              starts_at timestamptz, ends_at timestamptz, location text, status text,
              responsible_user_id uuid, present_count bigint, roster_count bigint)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
begin
  if not private.has_any_module_access(p_organization_id,array['attendance','calendar'],false) then raise exception 'Not authorized'; end if;
  return query
  select s.id,s.session_type,coalesce(s.title,c.name||' · Entrenamiento'),s.category_id,c.name,s.starts_at,s.ends_at,s.location,s.status,s.responsible_user_id,
         count(ar.player_id) filter(where ar.status in ('present','late')),
         (select count(*) from (
            select pe.player_id
            from app.player_enrollments pe
            join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
            where pe.organization_id=s.organization_id and pe.category_id=s.category_id
              and pe.status='active' and p.status='active' and p.archived_at is null
            union
            select ar2.player_id
            from app.attendance_records ar2
            where ar2.organization_id=s.organization_id and ar2.session_id=s.id
          ) q)
  from app.sessions s
  left join app.categories c on c.id=s.category_id and c.organization_id=s.organization_id
  left join app.attendance_records ar on ar.session_id=s.id and ar.organization_id=s.organization_id
  where s.organization_id=p_organization_id
    and s.session_type in ('training','academy','evaluation')
    and (p_from is null or s.starts_at>=p_from)
    and (p_to is null or s.starts_at<p_to)
  group by s.id,c.id,c.name
  order by s.starts_at desc;
end $function$;

-- 4) Baja formal de Tanners que quedaron en 'inactive' por migración: antes la función
--    los rechazaba ("Only active players can be withdrawn"), así que no había forma de
--    cerrarlos con fecha y motivo y se quedaban visibles para siempre.
create or replace function app.withdraw_player(p_player_id uuid, p_withdrawn_at date, p_reason text, p_actor text default null)
returns void
language plpgsql security definer
set search_path to 'app','public'
as $function$
declare
  v_org uuid;
  v_status text;
  v_academy record;
begin
  if p_withdrawn_at is null then raise exception 'Withdrawal date required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Withdrawal reason required'; end if;

  select organization_id,status into v_org,v_status
  from app.players where id=p_player_id for update;

  if v_org is null then raise exception 'Player not found'; end if;
  if v_status not in ('active','inactive') then raise exception 'Only active players can be withdrawn'; end if;

  update app.players
     set status='withdrawn',
         withdrawn_at=p_withdrawn_at,
         withdrawal_reason=trim(p_reason),
         updated_at=now()
   where id=p_player_id;

  update app.billing_profiles
     set status='closed',updated_at=now()
   where player_id=p_player_id;

  update app.player_enrollments
     set status='completed',
         ends_on=greatest(starts_on,p_withdrawn_at),
         notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja del Tanner: '||trim(p_reason)),
         updated_at=now()
   where organization_id=v_org
     and player_id=p_player_id
     and status='active';

  for v_academy in
    select id,academy_id,starts_on
    from app.academy_enrollments
    where organization_id=v_org and player_id=p_player_id and status='active'
    for update
  loop
    update app.academy_enrollments
       set status='cancelled',
           ends_on=greatest(v_academy.starts_on,p_withdrawn_at),
           notes=concat_ws(E'\n',nullif(trim(notes),''),'Baja del Tanner: '||trim(p_reason)),
           updated_at=now()
     where id=v_academy.id;

    insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
    values(v_org,'AcademyEnrollmentWithdrawn','academy_enrollment',v_academy.id,
      jsonb_build_object('academyId',v_academy.academy_id,'playerId',p_player_id,'endsOn',greatest(v_academy.starts_on,p_withdrawn_at),'reason',trim(p_reason),'source','player_withdrawal'),p_actor);
  end loop;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(v_org,'PlayerWithdrawn','player',p_player_id,
         jsonb_build_object('withdrawn_at',p_withdrawn_at,'reason',trim(p_reason),'previousStatus',v_status,'activeEnrollmentsClosed',true),p_actor);
end
$function$;;
