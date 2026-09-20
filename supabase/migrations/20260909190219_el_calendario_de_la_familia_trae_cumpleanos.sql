-- El calendario del portal salia vacio: no hay ninguna sesion futura (las 40 que
-- existen van del 18 jun al 8 sep). Ademas de arreglar eso programando sesiones,
-- la pantalla ahora trae los cumpleanos de los companeros de su hijo.
--
-- PRIVACIDAD: solo nombre y dia/mes de los companeros de SU categoria. Ni el
-- ano ni la edad: son menores y el padron completo del club no es informacion
-- que una familia necesite para felicitar a un companero de equipo.
create or replace function private.portal_calendar(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians; v_sesiones jsonb; v_cumples jsonb;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', coalesce(nullif(s.title,''), initcap(replace(s.session_type,'_',' '))),
      'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location,
      'type', s.session_type, 'category', coalesce(c.name, a.name),
      'kind', 'session')
      order by s.starts_at), '[]'::jsonb)
    into v_sesiones
  from app.sessions s
  left join app.categories c on c.id = s.category_id
  left join app.academies a on a.id = s.academy_id
  where s.organization_id = g.organization_id
    and coalesce(s.status,'') <> 'cancelled'
    and s.starts_at >= p_from and s.starts_at <= p_to
    and (
      (s.category_id is null and s.academy_id is null)
      or s.category_id in (
          select pe.category_id from app.player_enrollments pe
          where pe.player_id in (select player_id from private.portal_player_ids()))
      or exists (
          select 1 from app.academy_enrollments ae
          where ae.organization_id = s.organization_id
            and ae.academy_id = s.academy_id
            and ae.player_id in (select player_id from private.portal_player_ids())
            and ae.starts_on <= s.starts_at::date
            and (ae.ends_on is null or ae.ends_on >= s.starts_at::date))
    );

  -- El cumpleanos se repite cada ano: se proyecta en cada ano que toque el rango
  -- y se queda el que caiga dentro. El 29 de febrero cae al 28 en anos comunes.
  with companeros as (
    select distinct pl.id, pl.first_name, pl.last_name, pl.birth_date, c.name as categoria
    from app.players pl
    join app.player_enrollments pe on pe.player_id = pl.id
    join app.categories c on c.id = pe.category_id
    where pl.organization_id = g.organization_id
      and pl.status = 'active' and pl.archived_at is null
      and pl.birth_date is not null
      and pe.category_id in (
        select pe2.category_id from app.player_enrollments pe2
        where pe2.player_id in (select player_id from private.portal_player_ids()))
  ), anos as (
    select generate_series(
      extract(year from p_from)::int,
      extract(year from p_to)::int) as ano
  ), fechas as (
    select k.first_name, k.last_name, k.categoria, k.id,
      make_date(a.ano,
        extract(month from k.birth_date)::int,
        least(extract(day from k.birth_date)::int,
              extract(day from (date_trunc('month',
                make_date(a.ano, extract(month from k.birth_date)::int, 1))
                + interval '1 month - 1 day'))::int)) as dia
    from companeros k cross join anos a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', 'bday-'||f.id::text||'-'||f.dia::text,
      'title', 'Cumple ' || f.first_name,
      'starts_at', (f.dia + time '09:00') at time zone 'America/Mexico_City',
      'ends_at', null, 'location', null,
      'type', 'birthday', 'category', f.categoria,
      'kind', 'birthday')
      order by f.dia), '[]'::jsonb)
    into v_cumples
  from fechas f
  where (f.dia + time '09:00') at time zone 'America/Mexico_City' between p_from and p_to;

  return v_sesiones || v_cumples;
end $function$;

revoke all on function private.portal_calendar(timestamptz,timestamptz) from public, anon, authenticated;;
