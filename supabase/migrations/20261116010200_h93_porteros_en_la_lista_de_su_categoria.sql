-- h93 · Porteros en la lista de su categoría (13/11/2026)
--
-- Presidencia: los porteros son "portero + T10": siguen en su categoría y
-- además entrenan con Alexis en la Academia de porteros. "El día que va con
-- Alexis, el profe de T10 lo ve como 'con porteros' en vez de falta... que en
-- su ficha diga eso".
--
-- La Academia de porteros ya existe (academy_type = 'goalkeeper', con su
-- horario en schedule.days). Esta función sólo LEE: para una sesión de
-- categoría, dice cuáles de sus Tanners están en la academia de porteros y si
-- ese día les toca con ella. La pantalla de asistencia los marca "Con
-- porteros" (justificada) en lugar de falta.
--
-- Mismo permiso que la lista de asistencia: módulo de asistencia y poder tocar
-- esa sesión. No cambia ningún dato.
begin;

create or replace function private.query_attendance_roster_goalkeepers(p_organization_id uuid, p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_dia text; v_fecha date;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  select (s.starts_at at time zone 'America/Mexico_City')::date into v_fecha
    from app.sessions s where s.id = p_session_id and s.organization_id = p_organization_id and s.academy_id is null;
  if v_fecha is null then return '[]'::jsonb; end if;  -- sesión de academia o inexistente: nada que avisar
  if not private.can_touch_session(p_organization_id,p_session_id) then raise exception 'Not authorized'; end if;
  v_dia := (array['domingo','lunes','martes','miercoles','jueves','viernes','sabado'])[extract(dow from v_fecha)::int + 1];

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'playerId', r.player_id,
      'academy', a.name,
      'days', nullif(btrim(a.schedule->>'days'), ''),
      'time', nullif(btrim(a.schedule->>'time'), ''),
      -- ¿Ese día le toca con la academia? Se compara sin acentos ni mayúsculas.
      'today', translate(lower(coalesce(a.schedule->>'days','')), 'áéíóú', 'aeiou') like '%' || v_dia || '%'
    ) order by r.player_id)
    from private.session_roster_ids(p_organization_id, p_session_id) r
    join app.academy_enrollments e on e.player_id = r.player_id and e.organization_id = p_organization_id
     and e.status = 'active' and e.starts_on <= v_fecha and (e.ends_on is null or e.ends_on >= v_fecha)
    join app.academies a on a.id = e.academy_id and a.organization_id = p_organization_id
     and a.academy_type = 'goalkeeper' and a.status = 'active' and a.archived_at is null
  ), '[]'::jsonb);
end $$;
revoke all on function private.query_attendance_roster_goalkeepers(uuid, uuid) from public, anon, authenticated;

create or replace function public.v2_attendance_roster_goalkeepers(organization_id uuid, session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  return private.query_attendance_roster_goalkeepers(v2_attendance_roster_goalkeepers.organization_id, v2_attendance_roster_goalkeepers.session_id);
end $$;
revoke all on function public.v2_attendance_roster_goalkeepers(uuid, uuid) from public, anon;
grant execute on function public.v2_attendance_roster_goalkeepers(uuid, uuid) to authenticated;

commit;
