-- h3 · Becados que faltan y escribir a la familia (09/10/2026).
--
-- Presidencia: "si el niño está becado, que me diga: este niño está becado y
-- está faltando". Y en la racha de faltas, un botón para escribirle a la
-- familia con el mensaje listo, firmado por Tannery City.
--
-- Rehace query_attendance_dashboard (g3) agregando:
--   · streaks[].scholarship, y el tutor principal (nombre y teléfono);
--   · scholars: becados del alcance con su % del periodo (meta 90%) y su
--     racha; scholarsTotal, cuántos becados hay en ese alcance.
-- El teléfono del tutor sólo sale para quien administra jugadores: el profe
-- ve la racha y la beca, pero no los datos de contacto.
create or replace function private.query_attendance_dashboard(
  p_organization_id uuid, p_from date, p_to date, p_category_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'app', 'public', 'private'
as $$
declare
  v_admin boolean;
  v_dias int;
  v_prev_from date;
  v_prev_to date;
  v_sem_ini date;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_corte date;
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
  -- Las rachas y las semanas se miden hasta hoy, no hasta el fin del mes.
  v_corte := least(p_to, v_hoy);
  -- Diez semanas que terminan en la del corte, sin importar el periodo elegido.
  v_sem_ini := date_trunc('week', v_corte)::date - 63;

  with ses as (
    select s.id, s.category_id, s.starts_at, s.starts_at::date as d, s.responsible_user_id
    from app.sessions s
    where s.organization_id = p_organization_id
      and s.status <> 'cancelled'
      and s.category_id is not null
      and s.academy_id is null
      and s.starts_at::date between least(v_prev_from, v_sem_ini, v_corte - 60) and p_to
      and (p_category_id is null or s.category_id = p_category_id)
      and (v_admin or s.category_id in (select private.my_category_ids(p_organization_id)))
  ),
  marcadas as (
    select distinct ar.session_id from app.attendance_records ar
    where ar.organization_id = p_organization_id and ar.session_id in (select id from ses)
  ),
  roster as (
    select ses.id as sid, ses.category_id, ses.d, ses.starts_at, pe.player_id
    from ses
    join app.player_enrollments pe
      on pe.organization_id = p_organization_id and pe.category_id = ses.category_id and pe.status = 'active'
    join app.players pl
      on pl.id = pe.player_id and pl.organization_id = p_organization_id
     and pl.status = 'active' and pl.archived_at is null
  ),
  marcas as (
    select r.*, ar.status as st
    from roster r
    left join app.attendance_records ar on ar.session_id = r.sid and ar.player_id = r.player_id
  ),
  periodo as (
    select (m.d between p_from and p_to) as actual,
           count(*) filter (where m.st in ('present','late'))::numeric as asistio,
           count(*) filter (where m.st is not null)::numeric as marcadas
    from marcas m
    where m.d between v_prev_from and p_to
    group by 1
  ),
  semanas as (
    select g::date as semana from generate_series(v_sem_ini, date_trunc('week', v_corte)::date, interval '7 days') g
  ),
  sem_marcas as (
    select date_trunc('week', m.d)::date as semana,
           count(*) filter (where m.st in ('present','late'))::numeric as asistio,
           count(*) filter (where m.st is not null)::numeric as marcadas
    from marcas m where m.d between v_sem_ini and v_corte group by 1
  ),
  sem_ses as (
    select date_trunc('week', s.d)::date as semana, count(*) as sesiones,
           count(*) filter (where s.id in (select session_id from marcadas)) as pasadas
    from ses s where s.d between v_sem_ini and v_corte group by 1
  ),
  -- Racha: de la lista más reciente hacia atrás, cuántas faltas seguidas lleva
  -- cada Tanner. Las listas sin marcar no cortan ni suman.
  ult as (
    select m.player_id, m.category_id, m.starts_at, m.st,
           row_number() over (partition by m.player_id order by m.starts_at desc) as rn
    from marcas m
    where m.st is not null and m.d between v_corte - 60 and v_corte
  ),
  racha as (
    select u.player_id,
           coalesce(min(u.rn) filter (where u.st in ('present','late')), max(u.rn) + 1) - 1 as seguidas,
           max(u.starts_at) filter (where u.st in ('present','late')) as ultima_vez,
           (array_agg(u.category_id order by u.rn))[1] as category_id
    from ult u group by u.player_id
  ),
  cats as (
    select c.id, c.name, c.sort_order,
           count(*) filter (where m.d between p_from and p_to and m.st in ('present','late'))::numeric as asistio,
           count(*) filter (where m.d between p_from and p_to and m.st is not null)::numeric as marcadas,
           count(*) filter (where m.d between v_prev_from and v_prev_to and m.st in ('present','late'))::numeric as asistio_ant,
           count(*) filter (where m.d between v_prev_from and v_prev_to and m.st is not null)::numeric as marcadas_ant
    from marcas m join app.categories c on c.id = m.category_id
    group by c.id, c.name, c.sort_order
  ),
  cat_ses as (
    select s.category_id, count(*) as sesiones,
           count(*) filter (where s.id in (select session_id from marcadas)) as pasadas
    from ses s where s.d between p_from and p_to and s.starts_at < now()
    group by 1
  ),
  -- Quién es responsable de cada categoría hoy (no se guarda el histórico).
  staff as (
    select cs.category_id, cs.user_id, coalesce(nullif(pr.display_name,''), 'Sin nombre') as nombre
    from app.category_staff_assignments cs
    left join public.profiles pr on pr.user_id = cs.user_id
    where cs.organization_id = p_organization_id
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
  -- El tutor principal de cada Tanner, sólo para quien administra.
  tutor as (
    select distinct on (pg.player_id) pg.player_id,
           nullif(trim(g.first_name), '') as nombre,
           nullif(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), '') as tel
    from app.player_guardians pg
    join app.guardians g on g.id = pg.guardian_id and g.organization_id = p_organization_id
    where v_admin and pg.organization_id = p_organization_id
      and nullif(regexp_replace(coalesce(g.phone, ''), '\D', '', 'g'), '') is not null
    order by pg.player_id, pg.is_primary desc, pg.receives_billing desc, pg.created_at
  ),
  beca_pct as (
    select m.player_id,
           (array_agg(m.category_id order by m.starts_at desc))[1] as category_id,
           count(*) filter (where m.d between p_from and p_to and m.st in ('present','late')) as asistio,
           count(*) filter (where m.d between p_from and p_to and m.st is not null) as marcadas
    from marcas m
    where m.player_id in (select player_id from becados)
      and m.d between p_from and p_to
    group by m.player_id
  ),
  pendientes as (
    select s.id, s.starts_at, s.category_id, s.responsible_user_id
    from ses s
    where s.d between p_from and p_to and s.starts_at < now()
      and s.id not in (select session_id from marcadas)
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'previousFrom', v_prev_from, 'previousTo', v_prev_to,
    'pct', (select case when marcadas > 0 then round(100 * asistio / marcadas, 1) end from periodo where actual),
    'previousPct', (select case when marcadas > 0 then round(100 * asistio / marcadas, 1) end from periodo where not actual),
    'sessions', (select count(*) from ses s where s.d between p_from and p_to and s.starts_at < now()),
    'sessionsTaken', (select count(*) from ses s where s.d between p_from and p_to and s.starts_at < now()
                        and s.id in (select session_id from marcadas)),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', w.semana,
        'pct', case when sm.marcadas > 0 then round(100 * sm.asistio / sm.marcadas, 1) end,
        'sessions', coalesce(ss.sesiones, 0),
        'taken', coalesce(ss.pasadas, 0)
      ) order by w.semana)
      from semanas w
      left join sem_marcas sm on sm.semana = w.semana
      left join sem_ses ss on ss.semana = w.semana
    ), '[]'::jsonb),
    'streaks', coalesce((
      select jsonb_agg(x order by (x->>'streak')::int desc, x->>'name') from (
        select jsonb_build_object(
          'playerId', r.player_id,
          'name', trim(concat_ws(' ', pl.first_name, pl.last_name)),
          'code', pl.code,
          'categoryName', c.name,
          'streak', r.seguidas,
          'lastSeen', r.ultima_vez,
          'thumb', pl.photo_thumb_path,
          'bucket', coalesce(pl.photo_bucket, 'tanneros-private'),
          'scholarship', r.player_id in (select player_id from becados),
          'guardianName', t.nombre,
          'phone', t.tel
        ) as x
        from racha r
        join app.players pl on pl.id = r.player_id
        left join app.categories c on c.id = r.category_id
        left join tutor t on t.player_id = r.player_id
        where r.seguidas >= 3
        order by r.seguidas desc
        limit 30
      ) q
    ), '[]'::jsonb),
    -- Becados que están faltando: debajo de su meta (90%) o con 2 o más
    -- faltas seguidas. Los becados al corriente no salen; se cuentan aparte.
    'scholarsTotal', (select count(*) from beca_pct),
    'scholars', coalesce((
      select jsonb_agg(x order by (x->>'pct')::numeric nulls first, x->>'name') from (
        select jsonb_build_object(
          'playerId', bp.player_id,
          'name', trim(concat_ws(' ', pl.first_name, pl.last_name)),
          'code', pl.code,
          'categoryName', c.name,
          'pct', case when bp.marcadas > 0 then round(100.0 * bp.asistio / bp.marcadas, 1) end,
          'attended', bp.asistio,
          'marked', bp.marcadas,
          'goal', 90,
          'streak', coalesce(r.seguidas, 0),
          'lastSeen', r.ultima_vez,
          'thumb', pl.photo_thumb_path,
          'bucket', coalesce(pl.photo_bucket, 'tanneros-private'),
          'guardianName', t.nombre,
          'phone', t.tel
        ) as x
        from beca_pct bp
        join app.players pl on pl.id = bp.player_id
        left join app.categories c on c.id = bp.category_id
        left join racha r on r.player_id = bp.player_id
        left join tutor t on t.player_id = bp.player_id
        where (bp.marcadas > 0 and 100.0 * bp.asistio / bp.marcadas < 90)
           or coalesce(r.seguidas, 0) >= 2
      ) q
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'categoryId', k.id,
        'name', k.name,
        'pct', case when k.marcadas > 0 then round(100 * k.asistio / k.marcadas, 1) end,
        'previousPct', case when k.marcadas_ant > 0 then round(100 * k.asistio_ant / k.marcadas_ant, 1) end,
        'sessions', coalesce(cs.sesiones, 0),
        'taken', coalesce(cs.pasadas, 0)
      ) order by k.sort_order nulls last, k.name)
      from cats k left join cat_ses cs on cs.category_id = k.id
      where k.marcadas > 0 or coalesce(cs.sesiones, 0) > 0
    ), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sessionId', pe.id,
        'startsAt', pe.starts_at,
        'categoryName', c.name,
        'coach', coalesce(
          (select nullif(pr.display_name,'') from public.profiles pr where pr.user_id = pe.responsible_user_id),
          (select string_agg(distinct st.nombre, ', ') from staff st where st.category_id = pe.category_id))
      ) order by pe.starts_at desc)
      from pendientes pe left join app.categories c on c.id = pe.category_id
    ), '[]'::jsonb),
    -- La tabla de profes sólo la ve quien administra: a un profe no se le
    -- muestra cómo van sus compañeros.
    'coaches', case when v_admin then coalesce((
      select jsonb_agg(x order by (x->>'pending')::int desc, x->>'name') from (
        select jsonb_build_object(
          'userId', st.user_id,
          'name', min(st.nombre),
          'categories', string_agg(distinct c.name, ', '),
          'sessions', coalesce(sum(cs.sesiones), 0),
          'taken', coalesce(sum(cs.pasadas), 0),
          'pending', coalesce(sum(cs.sesiones - cs.pasadas), 0)
        ) as x
        from staff st
        join cat_ses cs on cs.category_id = st.category_id
        left join app.categories c on c.id = st.category_id
        group by st.user_id
      ) q
    ), '[]'::jsonb) end
  ) into v_out;

  return coalesce(v_out, '{}'::jsonb);
end
$$;

create or replace function public.v2_attendance_dashboard(
  organization_id uuid, from_date date, to_date date, category_id uuid default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select private.query_attendance_dashboard(organization_id, from_date, to_date, category_id) $$;

revoke all on function public.v2_attendance_dashboard(uuid, date, date, uuid) from public, anon;
grant execute on function public.v2_attendance_dashboard(uuid, date, date, uuid) to authenticated;
revoke all on function private.query_attendance_dashboard(uuid, date, date, uuid) from public, anon;
