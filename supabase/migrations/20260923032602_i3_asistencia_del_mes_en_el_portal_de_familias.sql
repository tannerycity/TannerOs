-- I3 · La asistencia del mes en el portal de Familias
--
-- v2_portal_progress ya existia y ya mostraba asistencia, pero es un
-- acumulado de por vida que solo cuenta present y absent: ignora las
-- justificadas y los retardos, y no se puede ver "como vamos este mes".
--
-- Esto AGREGA la ventana mensual sin tocar portal_progress: lo que la
-- pantalla de Familias ya consume sigue devolviendo exactamente lo mismo.
--
-- Probado en produccion: un tutor ve a su hijo; el mismo tutor pidiendo un
-- Tanner de otra familia recibe 'Not authorized'.

-- La familia ya veia un acumulado de por vida en v2_portal_progress, que solo
-- cuenta present y absent. Esto agrega la ventana del mes, con justificadas y
-- retardos, SIN tocar portal_progress: lo que la pantalla ya consume sigue
-- devolviendo exactamente lo mismo.
--
-- QUE NO SE LE MANDA A LA FAMILIA, A PROPOSITO
--   · nada de otros Tanners: ni promedios de la categoria ni comparaciones
--   · ni quien capturo la asistencia
--   · ni los entrenamientos que el profe dejo sin marcar
-- Ese ultimo es una decision: decirle a un papa "de 8 entrenamientos, en 3
-- nadie marco nada" es echarle a la cara un problema interno del club. El
-- porcentaje se calcula sobre lo que SI tiene registro y se dice cuantos son,
-- que es honesto sin exponer la cocina.
create or replace function private.portal_attendance(
  p_player_id uuid, p_from date, p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare
  v_goal int;
  v_out jsonb;
begin
  if not private.portal_owns_player(p_player_id) then
    raise exception 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;

  select case when exists (
    select 1 from app.player_benefits b
    where b.player_id = p_player_id and b.active
      and b.benefit_type like 'scholarship%'
      and b.starts_on <= p_to and (b.ends_on is null or b.ends_on >= p_from)
  ) then 90 else 80 end into v_goal;

  with mias as (
    select s.id, s.starts_at, s.starts_at::date as d,
           coalesce(nullif(s.title,''),'Entrenamiento') as title,
           ar.status as st
    from app.sessions s
    join app.player_enrollments pe
      on pe.organization_id = s.organization_id
     and pe.category_id = s.category_id
     and pe.player_id = p_player_id
     and pe.status = 'active'
    left join app.attendance_records ar
      on ar.session_id = s.id and ar.player_id = p_player_id
    where s.status <> 'cancelled'
      and s.category_id is not null
      and s.academy_id is null
      and s.starts_at::date between p_from and p_to
  ),
  t as (
    select count(*) filter (where st in ('present','late'))   as attended,
           count(*) filter (where st in ('absent','excused')) as absences,
           count(*) filter (where st = 'excused')             as excused,
           count(*) filter (where st = 'late')                as late,
           count(*) filter (where st is not null)             as marked
    from mias
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'goal', v_goal,
    'attended', t.attended,
    'absences', t.absences,
    'excused', t.excused,
    'late', t.late,
    'recorded', t.marked,
    'pct', case when t.marked > 0 then round(100.0 * t.attended / t.marked, 1) end,
    'belowGoal', (t.marked > 0 and round(100.0 * t.attended / t.marked, 1) < v_goal),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', m.d, 'startsAt', m.starts_at, 'title', m.title, 'status', m.st
      ) order by m.starts_at desc)
      from mias m where m.st is not null
    ), '[]'::jsonb)
  ) into v_out
  from t;

  return coalesce(v_out, '{}'::jsonb);
end
$function$;

create or replace function public.v2_portal_attendance(
  player_id uuid, from_date date, to_date date
) returns jsonb
language sql
security definer
set search_path to 'pg_catalog','private'
as $function$
  select private.portal_attendance(player_id, from_date, to_date)
$function$;

revoke all on function private.portal_attendance(uuid,date,date) from public, anon, authenticated;
revoke all on function public.v2_portal_attendance(uuid,date,date) from public, anon;
grant execute on function public.v2_portal_attendance(uuid,date,date) to authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_portal_attendance';
  if v <> 1 then raise exception 'v2_portal_attendance quedo % veces', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='portal_attendance';
  if v <> 1 then raise exception 'portal_attendance quedo % veces', v; end if;
end $$;
