-- I1 · Estadisticas de asistencia (primera aplicacion)
--
-- Este archivo es el SQL EXACTO que se aplico, copiado de
-- supabase_migrations.schema_migrations y verificado con md5.
--
-- Se pego a mano y perdio los comentarios de adentro. Veinte minutos
-- despues se reaplico con ellos en 20260923034021, que es identica en
-- comportamiento. Este archivo existe para que la carpeta sea espejo
-- exacto de la base; lo que se lee es la otra.
--
create or replace function private.query_attendance_stats(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_category_id uuid default null,
  p_session_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'app', 'private'
as $function$
declare
  v_admin boolean;
  v_out jsonb;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then
    raise exception 'Not authorized';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;

  v_admin := private.is_player_admin(p_organization_id);

  with ses as (
    select s.id, s.category_id, s.starts_at, s.starts_at::date as d, s.session_type
    from app.sessions s
    where s.organization_id = p_organization_id
      and s.status <> 'cancelled'
      and s.category_id is not null
      and s.academy_id is null
      and s.starts_at::date between p_from and p_to
      and (p_category_id is null or s.category_id = p_category_id)
      and (p_session_type is null or s.session_type = p_session_type)
      and (v_admin or s.category_id in (select private.my_category_ids(p_organization_id)))
  ),
  roster as (
    select ses.id as sid, ses.category_id, ses.d, pe.player_id
    from ses
    join app.player_enrollments pe
      on pe.organization_id = p_organization_id
     and pe.category_id = ses.category_id
     and pe.status = 'active'
    join app.players pl
      on pl.id = pe.player_id and pl.organization_id = p_organization_id
     and pl.status = 'active' and pl.archived_at is null
  ),
  becados as (
    select distinct b.player_id
    from app.player_benefits b
    where b.organization_id = p_organization_id
      and b.active
      and b.benefit_type like 'scholarship%'
      and b.starts_on <= p_to
      and (b.ends_on is null or b.ends_on >= p_from)
  ),
  marcas as (
    select r.sid, r.category_id, r.d, r.player_id,
           ar.status as st,
           (ar.status in ('present','late'))            as asistio,
           (ar.status in ('absent','excused'))          as falto,
           (ar.status = 'excused')                      as justificada,
           (ar.status = 'late')                         as retardo,
           (ar.status is null)                          as sin_marcar
    from roster r
    left join app.attendance_records ar
      on ar.session_id = r.sid and ar.player_id = r.player_id
  ),
  por_jugador as (
    select m.player_id, m.category_id,
           count(*)                                   as programadas,
           count(*) filter (where m.asistio)          as asistencias,
           count(*) filter (where m.falto)            as faltas,
           count(*) filter (where m.justificada)      as justificadas,
           count(*) filter (where m.retardo)          as retardos,
           count(*) filter (where m.sin_marcar)       as sin_marcar,
           count(*) filter (where not m.sin_marcar)   as marcadas
    from marcas m
    group by 1,2
  ),
  jugador_pct as (
    select j.*,
           (j.player_id in (select player_id from becados)) as becado,
           case when j.marcadas > 0
                then round(100.0 * j.asistencias / j.marcadas, 1)
           end as pct
    from por_jugador j
  ),
  por_semana as (
    select m.category_id, date_trunc('week', m.d)::date as periodo,
           count(*) filter (where m.asistio)::numeric as asistio,
           count(*) filter (where not m.sin_marcar)::numeric as marcadas
    from marcas m group by 1,2
  ),
  por_mes as (
    select m.category_id, date_trunc('month', m.d)::date as periodo,
           count(*) filter (where m.asistio)::numeric as asistio,
           count(*) filter (where not m.sin_marcar)::numeric as marcadas
    from marcas m group by 1,2
  ),
  cat as (
    select c.id, c.code, c.name, c.sort_order,
           count(distinct m.sid)                        as sesiones,
           count(distinct m.player_id)                  as jugadores,
           count(*) filter (where m.asistio)            as asistencias,
           count(*) filter (where m.falto)              as faltas,
           count(*) filter (where m.justificada)        as justificadas,
           count(*) filter (where m.retardo)            as retardos,
           count(*) filter (where m.sin_marcar)         as sin_marcar,
           count(*) filter (where not m.sin_marcar)     as marcadas,
           count(*)                                     as programadas
    from marcas m
    join app.categories c on c.id = m.category_id
    group by c.id, c.code, c.name, c.sort_order
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'categoryId', p_category_id,
    'sessionType', p_session_type,
    'totals', (
      select jsonb_build_object(
        'players',     coalesce(count(distinct m.player_id),0),
        'sessions',    coalesce(count(distinct m.sid),0),
        'scheduled',   coalesce(count(*),0),
        'attended',    coalesce(count(*) filter (where m.asistio),0),
        'absences',    coalesce(count(*) filter (where m.falto),0),
        'excused',     coalesce(count(*) filter (where m.justificada),0),
        'late',        coalesce(count(*) filter (where m.retardo),0),
        'unmarked',    coalesce(count(*) filter (where m.sin_marcar),0),
        'marked',      coalesce(count(*) filter (where not m.sin_marcar),0),
        'pct', (
          case when count(*) filter (where not m.sin_marcar) > 0
               then round(100.0 * count(*) filter (where m.asistio)
                          / count(*) filter (where not m.sin_marcar), 1)
          end
        ),
        'lowPlayers', (
          select count(*) from jugador_pct j
          where j.pct is not null and j.pct < (case when j.becado then 90 else 80 end)
        )
      ) from marcas m
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'categoryId', cat.id,
        'code', cat.code,
        'name', cat.name,
        'activePlayers', cat.jugadores,
        'sessions', cat.sesiones,
        'scheduled', cat.programadas,
        'attended', cat.asistencias,
        'absences', cat.faltas,
        'excused', cat.justificadas,
        'late', cat.retardos,
        'unmarked', cat.sin_marcar,
        'marked', cat.marcadas,
        'pct', case when cat.marcadas > 0
                    then round(100.0 * cat.asistencias / cat.marcadas, 1) end,
        'weeklyPct', (
          select round(avg(100.0 * w.asistio / w.marcadas), 1)
          from por_semana w where w.category_id = cat.id and w.marcadas > 0
        ),
        'monthlyPct', (
          select round(avg(100.0 * mo.asistio / mo.marcadas), 1)
          from por_mes mo where mo.category_id = cat.id and mo.marcadas > 0
        ),
        'lowest', coalesce((
          select jsonb_agg(x) from (
            select jsonb_build_object(
              'playerId', j.player_id,
              'name', trim(concat_ws(' ', pl.first_name, pl.last_name)),
              'pct', j.pct,
              'attended', j.asistencias,
              'absences', j.faltas,
              'scheduled', j.programadas,
              'unmarked', j.sin_marcar,
              'goal', case when j.becado then 90 else 80 end,
              'scholarship', j.becado
            ) as x
            from jugador_pct j
            join app.players pl on pl.id = j.player_id
            where j.category_id = cat.id and j.pct is not null
            order by j.pct asc, j.asistencias asc
            limit 5
          ) q
        ), '[]'::jsonb)
      ) order by cat.sort_order nulls last, cat.name)
      from cat
    ), '[]'::jsonb),
    'lowPlayers', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'playerId', j.player_id,
          'name', trim(concat_ws(' ', pl.first_name, pl.last_name)),
          'categoryId', j.category_id,
          'categoryName', c.name,
          'pct', j.pct,
          'attended', j.asistencias,
          'absences', j.faltas,
          'excused', j.justificadas,
          'scheduled', j.programadas,
          'unmarked', j.sin_marcar,
          'goal', case when j.becado then 90 else 80 end,
          'scholarship', j.becado
        ) as x
        from jugador_pct j
        join app.players pl on pl.id = j.player_id
        left join app.categories c on c.id = j.category_id
        where j.pct is not null
          and j.pct < (case when j.becado then 90 else 80 end)
        order by j.pct asc, j.asistencias asc
        limit 20
      ) q
    ), '[]'::jsonb)
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end
$function$;

create or replace function public.v2_attendance_stats(
  organization_id uuid,
  from_date date,
  to_date date,
  category_id uuid default null,
  session_type text default null
) returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'private'
as $function$
  select private.query_attendance_stats(organization_id, from_date, to_date, category_id, session_type)
$function$;

revoke all on function private.query_attendance_stats(uuid,date,date,uuid,text) from public, anon, authenticated;
revoke all on function public.v2_attendance_stats(uuid,date,date,uuid,text) from public, anon;
grant execute on function public.v2_attendance_stats(uuid,date,date,uuid,text) to authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='v2_attendance_stats';
  if v <> 1 then raise exception 'v2_attendance_stats quedo % veces', v; end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.proname='query_attendance_stats';
  if v <> 1 then raise exception 'query_attendance_stats quedo % veces', v; end if;
end $$;
