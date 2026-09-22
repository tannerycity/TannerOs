-- Todo lo que el profesor necesita al abrir la app, en una sola llamada: sus
-- academias, sus jugadores, el próximo entrenamiento, quién falta por evaluar,
-- los cumpleaños de la semana y los anuncios del club.
--
-- Deliberadamente NO devuelve nada de dinero: ni cuota, ni adeudo, ni cobros. Si el
-- dato no sale de aquí, no hay forma de que se filtre a la pantalla por descuido.
create or replace function private.query_coach_home(p_organization_id uuid, p_academy_id uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private','public'
as $function$
declare
  v_admin boolean; v_mias uuid[]; v_ac uuid;
  v_academias jsonb; v_jugadores jsonb; v_sesiones jsonb; v_prox jsonb;
  v_cumples jsonb; v_anuncios jsonb; v_sin_eval int; v_academia jsonb;
begin
  if not private.has_module_access(p_organization_id,'academias',false) then raise exception 'Not authorized'; end if;
  v_admin := private.is_academy_admin(p_organization_id);
  select coalesce(array_agg(x),'{}') into v_mias from private.my_academy_ids(p_organization_id) x;

  -- Las academias entre las que puede cambiar. Un admin las ve todas, para poder
  -- entrar a esta vista y ver lo mismo que ve su profesor.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'name',a.name,'slug',a.slug,'type',a.academy_type,'location',a.location,
    'axes',private.academy_evaluation_axes(p_organization_id,a.id)
  ) order by a.name),'[]'::jsonb) into v_academias
  from app.academies a
  where a.organization_id=p_organization_id and a.archived_at is null and a.status='active'
    and (v_admin or a.id=any(v_mias));

  if jsonb_array_length(v_academias)=0 then
    return jsonb_build_object('academies','[]'::jsonb,'academy',null,'players','[]'::jsonb,
      'sessions','[]'::jsonb,'nextSession',null,'birthdays','[]'::jsonb,
      'announcements','[]'::jsonb,'pendingEvaluations',0,'isAdmin',v_admin);
  end if;

  -- La academia en pantalla: la pedida si puede verla, o la primera suya.
  v_ac := coalesce(
    (select (x->>'id')::uuid from jsonb_array_elements(v_academias) x
      where (x->>'id')::uuid = p_academy_id),
    (v_academias->0->>'id')::uuid);
  select x into v_academia from jsonb_array_elements(v_academias) x where (x->>'id')::uuid=v_ac;

  -- Sus jugadores: los inscritos vivos, con lo que sirve para entrenar y nada más.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'name',trim(concat_ws(' ',p.first_name,p.last_name)),'code',p.code,
    'category',p.category,'position',p.position,'birthDate',p.birth_date,
    'dominantFoot',p.dominant_foot,'jersey',p.jersey_number,
    'photoPath',coalesce(p.photo_thumb_path,p.photo_path),'photoBucket',p.photo_bucket,
    'enrolledOn',e.starts_on,
    'lastEvaluationOn',(select max(ev.evaluated_on) from app.player_evaluations ev
                        where ev.organization_id=p_organization_id and ev.academy_id=v_ac and ev.player_id=p.id),
    'sessionsAttended',(select count(*) from app.attendance_records ar
                        join app.sessions s on s.id=ar.session_id
                        where ar.organization_id=p_organization_id and ar.player_id=p.id
                          and s.academy_id=v_ac and ar.status in ('present','late')),
    'sessionsTotal',(select count(*) from app.attendance_records ar
                     join app.sessions s on s.id=ar.session_id
                     where ar.organization_id=p_organization_id and ar.player_id=p.id and s.academy_id=v_ac)
  ) order by p.first_name,p.last_name),'[]'::jsonb) into v_jugadores
  from app.academy_enrollments e
  join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
  where e.organization_id=p_organization_id and e.academy_id=v_ac and e.status='active'
    and p.status='active' and p.archived_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'startsAt',s.starts_at,'endsAt',s.ends_at,
    'location',s.location,'status',s.status,'type',s.session_type,
    'present',(select count(*) from app.attendance_records ar
               where ar.session_id=s.id and ar.status in ('present','late')),
    'taken',exists(select 1 from app.attendance_records ar where ar.session_id=s.id)
  ) order by s.starts_at desc),'[]'::jsonb) into v_sesiones
  from app.sessions s
  where s.organization_id=p_organization_id and s.academy_id=v_ac
    and s.starts_at > now() - interval '60 days';

  select jsonb_build_object('id',s.id,'title',s.title,'startsAt',s.starts_at,
    'endsAt',s.ends_at,'location',s.location,
    'taken',exists(select 1 from app.attendance_records ar where ar.session_id=s.id))
  into v_prox
  from app.sessions s
  where s.organization_id=p_organization_id and s.academy_id=v_ac
    and s.status<>'cancelled' and s.starts_at >= date_trunc('day',now())
  order by s.starts_at limit 1;

  -- Cumpleaños de los próximos 30 días, comparando día y mes.
  select coalesce(jsonb_agg(jsonb_build_object('name',nombre,'day',dia,'turns',cumple) order by dia),'[]'::jsonb)
  into v_cumples from (
    select trim(concat_ws(' ',p.first_name,p.last_name)) nombre,
           (date_trunc('year',current_date)
             + (p.birth_date - date_trunc('year',p.birth_date)::date) * interval '1 day')::date dia,
           extract(year from age(current_date,p.birth_date))::int + 1 cumple
    from app.academy_enrollments e
    join app.players p on p.id=e.player_id and p.organization_id=e.organization_id
    where e.organization_id=p_organization_id and e.academy_id=v_ac and e.status='active'
      and p.status='active' and p.birth_date is not null
  ) t where dia between current_date and current_date + 30;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',an.id,'title',an.title,'body',an.body,'publishedAt',an.published_at
  ) order by an.published_at desc),'[]'::jsonb) into v_anuncios
  from app.announcements an
  where an.organization_id=p_organization_id and an.archived_at is null
    and (an.starts_at is null or an.starts_at<=now())
    and (an.expires_at is null or an.expires_at>=now())
    and (an.audience_type='club' or (an.audience_type='academy' and an.audience_value=v_ac::text));

  select count(*) into v_sin_eval
  from jsonb_array_elements(v_jugadores) j
  where j->>'lastEvaluationOn' is null;

  return jsonb_build_object(
    'academies',v_academias,'academy',v_academia,'players',v_jugadores,
    'sessions',v_sesiones,'nextSession',v_prox,'birthdays',v_cumples,
    'announcements',coalesce(v_anuncios,'[]'::jsonb),
    'pendingEvaluations',v_sin_eval,'isAdmin',v_admin);
end $function$;
revoke all on function private.query_coach_home(uuid,uuid) from public, anon, authenticated;

create or replace function public.v2_coach_home(organization_id uuid, academy_id uuid default null)
returns jsonb language sql security definer set search_path to 'pg_catalog','private'
as $function$ select private.query_coach_home(organization_id,academy_id) $function$;
revoke all on function public.v2_coach_home(uuid,uuid) from public, anon;
grant execute on function public.v2_coach_home(uuid,uuid) to authenticated;;
