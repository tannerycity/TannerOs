-- h89 · Mi semana le recuerda al profe a quién le falta evaluar
--
-- Presidencia (11/11/2026): "tenemos que evaluar a los jugadores cada tres
-- meses". En Jugadores > Evaluación ya está el semáforo; faltaba que el profe
-- lo viera sin ir a buscarlo. Ahora "Mi semana" trae un renglón más:
--   Evaluaciones al día · 6/18   (y los primeros cinco que le faltan)
-- que lleva a /jugadores/?ver=evaluacion.
--
-- Lo que NO cambia, a propósito:
--   · private.week_status no se toca: el % de la semana, la racha, el bono y
--     los recordatorios por push siguen saliendo de las mismas secciones. Las
--     evaluaciones son trimestrales; meterlas al % semanal lo tumbaría para
--     todos los profes de un día para otro.
--   · Los nombres de los Tanners sólo viajan dentro de la app, al profe de esa
--     categoría (v2_my_week). Los avisos push no usan esta función.
--   · Si el profe no tiene categoría asignada o su semana no trae ninguna otra
--     sección, no se agrega nada (la barra no aparece sólo por esto).
--
-- "Al día" = evaluado en los últimos 3 meses, igual que en Jugadores.

create or replace function private.week_evaluaciones(p_organization_id uuid, p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_cats uuid[]; v_total integer; v_al_dia integer; v_items jsonb;
  v_corte date := ((now() at time zone 'America/Mexico_City')::date - interval '3 months')::date;
begin
  select coalesce(array_agg(a.category_id), '{}') into v_cats
    from app.category_staff_assignments a
    where a.organization_id = p_organization_id and a.user_id = p_user_id;
  if cardinality(v_cats) = 0 then return null; end if;

  select count(*)::int, count(*) filter (where u.ultima >= v_corte)::int,
    coalesce((select jsonb_agg(jsonb_build_object('text', 'Evalúa a ' || z.nombre, 'href', '/jugadores/?ver=evaluacion'))
      from (select y.nombre from (
              select trim(concat_ws(' ', pl.first_name, pl.last_name)) as nombre,
                     (select max(e.evaluated_on) from app.player_evaluations e
                       where e.player_id = pl.id and e.archived_at is null) as ultima
              from app.players pl
              join app.player_enrollments pe
                on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status = 'active'
              where pl.organization_id = p_organization_id and pe.category_id = any(v_cats)
                and pl.status = 'active' and pl.archived_at is null) y
            where y.ultima is null or y.ultima < v_corte
            order by y.ultima nulls first, y.nombre limit 5) z), '[]'::jsonb)
    into v_total, v_al_dia, v_items
  from (select pl.id,
               (select max(e.evaluated_on) from app.player_evaluations e
                 where e.player_id = pl.id and e.archived_at is null) as ultima
        from app.players pl
        join app.player_enrollments pe
          on pe.player_id = pl.id and pe.organization_id = pl.organization_id and pe.status = 'active'
        where pl.organization_id = p_organization_id and pe.category_id = any(v_cats)
          and pl.status = 'active' and pl.archived_at is null) u;

  if coalesce(v_total, 0) = 0 then return null; end if;
  return jsonb_build_object('key', 'evaluaciones', 'title', 'Evaluaciones al día (cada 3 meses)',
    'done', v_al_dia, 'total', v_total, 'href', '/jugadores/?ver=evaluacion',
    'informativa', true, 'items', v_items);
end $$;

revoke all on function private.week_evaluaciones(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_my_week(organization_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_uid uuid := (select auth.uid()); v_hoy date := (now() at time zone 'America/Mexico_City')::date; v jsonb; v_ev jsonb;
begin
  if v_uid is null or not private.is_active_member(organization_id) then raise exception 'Not authorized'; end if;
  v := private.week_status(organization_id, v_uid, v_hoy);
  if v is null or jsonb_array_length(v->'sections') = 0 then return v; end if;
  -- h89: un renglón más, informativo: no entra al % ni a la racha.
  v_ev := private.week_evaluaciones(organization_id, v_uid);
  if v_ev is not null then v := jsonb_set(v, '{sections}', (v->'sections') || v_ev); end if;
  return v || jsonb_build_object('streak', private.week_streak(organization_id, v_uid));
end $$;
