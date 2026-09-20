-- Dos cosas, y una es una fuga:
--
-- 1. La condición "s.category_id is null" mostraba a TODOS los tutores del club
--    cualquier sesión sin categoría. Las sesiones de academia no tienen categoría
--    (pertenecen a la academia), así que el papá de un niño de T12 acabaría viendo
--    los entrenamientos de la academia de porteros.
-- 2. Al revés: el tutor de un niño SÍ inscrito en la academia los veía por ese mismo
--    accidente, no porque el sistema supiera que le tocan.
--
-- Ahora una sesión se muestra si es de una categoría donde está inscrito su hijo, o
-- de una academia donde está inscrito. Las que no tienen ninguna de las dos son del
-- club entero y se siguen mostrando.
create or replace function private.portal_calendar(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare g app.guardians;
begin
  select * into g from private.portal_guardian();
  if g.id is null then raise exception 'Portal access required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', coalesce(nullif(s.title,''), initcap(replace(s.session_type,'_',' '))),
      'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location,
      'type', s.session_type, 'category', coalesce(c.name, a.name))
      order by s.starts_at)
    from app.sessions s
    left join app.categories c on c.id = s.category_id
    left join app.academies a on a.id = s.academy_id
    where s.organization_id = g.organization_id
      and coalesce(s.status,'') <> 'cancelled'
      and s.starts_at >= p_from and s.starts_at <= p_to
      and (
        -- Del club entero: ni categoría ni academia.
        (s.category_id is null and s.academy_id is null)
        -- De la categoría de su hijo.
        or s.category_id in (
            select pe.category_id from app.player_enrollments pe
            where pe.player_id in (select player_id from private.portal_player_ids()))
        -- De una academia donde su hijo está inscrito, y solo mientras lo estuvo.
        or exists (
            select 1 from app.academy_enrollments ae
            where ae.organization_id = s.organization_id
              and ae.academy_id = s.academy_id
              and ae.player_id in (select player_id from private.portal_player_ids())
              and ae.starts_on <= s.starts_at::date
              and (ae.ends_on is null or ae.ends_on >= s.starts_at::date))
      )
  ), '[]'::jsonb);
end $function$;
revoke all on function private.portal_calendar(timestamptz,timestamptz) from public, anon, authenticated;;
