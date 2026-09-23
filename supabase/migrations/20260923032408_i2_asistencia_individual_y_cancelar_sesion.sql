-- I2 · Reporte individual de asistencia y cancelar una sesion
--
-- Dos cosas que I1 dejo pendientes:
--
-- 1. query_attendance_player: el historial de UN Tanner, con las mismas tres
--    cubetas de I1 y la tendencia contra el periodo anterior del mismo largo.
--    Lleva su propio candado: un profe solo puede abrir el expediente de un
--    Tanner de SUS categorias. Sin esa linea, el candado de la vista general
--    se brincaria pidiendo jugador por jugador.
--
-- 2. command_cancel_attendance_session: la tabla ya admitia el estado
--    'cancelled' (CHECK (status = ANY (ARRAY['scheduled','completed',
--    'cancelled']))) pero NO habia forma de llegar a el desde la aplicacion.
--    Sin esto, la regla "las sesiones canceladas no deben contar como falta"
--    no se podia cumplir: no habia manera de cancelar nada.
--    No borra registros: solo saca la sesion del calculo.
--
-- Verificado en produccion tras aplicarla:
--   Presidencia  ve los 5 grupos
--   Formador     ve solo su categoria, y al pedir un Tanner de otra: rechazado
--   Taquilla     rechazado

-- Reporte individual: mismas tres cubetas que I1, mas la tendencia contra el
-- periodo anterior del mismo largo.
create or replace function private.query_attendance_player(
  p_organization_id uuid,
  p_player_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_admin boolean;
  v_dias int;
  v_prev_from date;
  v_prev_to date;
  v_out jsonb;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then
    raise exception 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;

  v_admin := private.is_player_admin(p_organization_id);
  v_dias := (p_to - p_from) + 1;
  v_prev_to := p_from - 1;
  v_prev_from := v_prev_to - (v_dias - 1);

  -- Un profe solo puede abrir el expediente de asistencia de un Tanner de sus
  -- categorias. Sin esto, el candado de la vista general se brincaria
  -- pidiendo jugador por jugador.
  if not v_admin then
    if not exists (
      select 1 from app.player_enrollments pe
      where pe.organization_id = p_organization_id
        and pe.player_id = p_player_id
        and pe.status = 'active'
        and pe.category_id in (select private.my_category_ids(p_organization_id))
    ) then
      raise exception 'Not authorized';
    end if;
  end if;

  with ses as (
    select s.id, s.category_id, s.starts_at, s.starts_at::date as d, s.title, s.session_type
    from app.sessions s
    where s.organization_id = p_organization_id
      and s.status <> 'cancelled'
      and s.category_id is not null
      and s.academy_id is null
      and s.starts_at::date between v_prev_from and p_to
  ),
  mias as (
    select ses.*, ar.status as st
    from ses
    join app.player_enrollments pe
      on pe.organization_id = p_organization_id
     and pe.category_id = ses.category_id
     and pe.player_id = p_player_id
     and pe.status = 'active'
    left join app.attendance_records ar
      on ar.session_id = ses.id and ar.player_id = p_player_id
  ),
  agg as (
    select (d between p_from and p_to) as es_actual,
           count(*) as scheduled,
           count(*) filter (where st in ('present','late'))   as attended,
           count(*) filter (where st in ('absent','excused')) as absences,
           count(*) filter (where st = 'excused')             as excused,
           count(*) filter (where st = 'late')                as late,
           count(*) filter (where st is null)                 as unmarked,
           count(*) filter (where st is not null)             as marked
    from mias group by 1
  ),
  becado as (
    select exists (
      select 1 from app.player_benefits b
      where b.organization_id = p_organization_id
        and b.player_id = p_player_id
        and b.active
        and b.benefit_type like 'scholarship%'
        and b.starts_on <= p_to
        and (b.ends_on is null or b.ends_on >= p_from)
    ) as si
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'previousFrom', v_prev_from,
    'previousTo', v_prev_to,
    'player', (
      select jsonb_build_object(
        'playerId', pl.id,
        'name', trim(concat_ws(' ', pl.first_name, pl.last_name)),
        'code', pl.code,
        'categoryName', (
          select c.name from app.player_enrollments pe
          join app.categories c on c.id = pe.category_id
          where pe.organization_id = p_organization_id and pe.player_id = pl.id
            and pe.status = 'active'
          order by pe.starts_on desc limit 1
        ),
        'scholarship', (select si from becado),
        'goal', case when (select si from becado) then 90 else 80 end
      )
      from app.players pl
      where pl.id = p_player_id and pl.organization_id = p_organization_id
    ),
    'current', coalesce((
      select jsonb_build_object(
        'scheduled', a.scheduled, 'attended', a.attended, 'absences', a.absences,
        'excused', a.excused, 'late', a.late, 'unmarked', a.unmarked, 'marked', a.marked,
        'pct', case when a.marked > 0 then round(100.0 * a.attended / a.marked, 1) end
      ) from agg a where a.es_actual
    ), jsonb_build_object('scheduled',0,'attended',0,'absences',0,'excused',0,'late',0,
                          'unmarked',0,'marked',0,'pct',null)),
    'previous', coalesce((
      select jsonb_build_object(
        'scheduled', a.scheduled, 'attended', a.attended, 'absences', a.absences,
        'excused', a.excused, 'late', a.late, 'unmarked', a.unmarked, 'marked', a.marked,
        'pct', case when a.marked > 0 then round(100.0 * a.attended / a.marked, 1) end
      ) from agg a where not a.es_actual
    ), jsonb_build_object('scheduled',0,'attended',0,'absences',0,'excused',0,'late',0,
                          'unmarked',0,'marked',0,'pct',null)),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sessionId', m.id,
        'date', m.d,
        'startsAt', m.starts_at,
        'title', coalesce(nullif(m.title,''), 'Entrenamiento'),
        'categoryName', c.name,
        'status', m.st
      ) order by m.starts_at desc)
      from mias m
      left join app.categories c on c.id = m.category_id
      where m.d between p_from and p_to
    ), '[]'::jsonb)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end
$function$;

create or replace function public.v2_attendance_player(
  organization_id uuid, player_id uuid, from_date date, to_date date
) returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.query_attendance_player(organization_id, player_id, from_date, to_date)
$function$;

-- Cancelar una sesion. No borra nada: solo la saca del calculo, que es lo que
-- pide la regla "las sesiones canceladas no deben contar como falta". Los
-- registros ya capturados se quedan donde estan.
create or replace function private.command_cancel_attendance_session(
  p_organization_id uuid, p_session_id uuid, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare v_status text;
begin
  if not private.has_module_access(p_organization_id,'attendance',true) then
    raise exception 'Not authorized';
  end if;
  if not private.can_touch_session(p_organization_id, p_session_id) then
    raise exception 'Not authorized';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Cancellation reason required';
  end if;

  select s.status into v_status from app.sessions s
  where s.id = p_session_id and s.organization_id = p_organization_id;
  if not found then raise exception 'Session not found'; end if;
  if v_status = 'cancelled' then return true; end if;

  update app.sessions
     set status = 'cancelled',
         notes = trim(both E'\n' from coalesce(notes,'') || E'\n' || 'Cancelada: ' || trim(p_reason)),
         metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
           'cancelledAt', now(),
           'cancelledBy', (select auth.uid()),
           'cancelReason', trim(p_reason)),
         updated_at = now()
   where id = p_session_id and organization_id = p_organization_id;

  insert into app.domain_events(organization_id,event_type,aggregate_type,aggregate_id,payload,actor)
  values(p_organization_id,'AttendanceSessionCancelled','session',p_session_id,
         jsonb_build_object('reason',trim(p_reason)),(select auth.uid())::text);
  return true;
end
$function$;

create or replace function public.v2_cancel_attendance_session(
  organization_id uuid, session_id uuid, reason text
) returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.command_cancel_attendance_session(organization_id, session_id, reason)
$function$;

revoke all on function private.query_attendance_player(uuid,uuid,date,date) from public, anon, authenticated;
revoke all on function private.command_cancel_attendance_session(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.v2_attendance_player(uuid,uuid,date,date) from public, anon;
revoke all on function public.v2_cancel_attendance_session(uuid,uuid,text) from public, anon;
grant execute on function public.v2_attendance_player(uuid,uuid,date,date) to authenticated;
grant execute on function public.v2_cancel_attendance_session(uuid,uuid,text) to authenticated;

do $$
declare v int; f text;
begin
  foreach f in array array['v2_attendance_player','v2_cancel_attendance_session'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
  foreach f in array array['query_attendance_player','command_cancel_attendance_session'] loop
    select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname=f;
    if v <> 1 then raise exception '% quedo % veces', f, v; end if;
  end loop;
end $$;
