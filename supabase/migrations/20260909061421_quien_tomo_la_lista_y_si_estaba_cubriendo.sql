-- Quién tomó cada lista, y si esa persona estaba cubriendo una categoría que no
-- es suya. Las columnas de auditoría ya existían (attendance_records
-- .recorded_by_user_id / recorded_at) y nadie las sacaba a la superficie: la
-- trazabilidad de la cobertura no hubo que construirla, solo mostrarla.
--
-- Las dos columnas nuevas van AL FINAL para no mover las que ya consume el
-- frontend.
drop function if exists public.v2_attendance_sessions(uuid,timestamptz,timestamptz);
drop function if exists private.query_attendance_sessions(uuid,timestamptz,timestamptz);

create function private.query_attendance_sessions(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null)
returns table(id uuid, session_type text, title text, category_id uuid, category_name text,
  starts_at timestamptz, ends_at timestamptz, location text, status text,
  responsible_user_id uuid, present_count bigint, roster_count bigint,
  academy_id uuid, academy_name text, taken_by text, covered boolean)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','public','private'
as $function$
declare v_admin boolean; v_mias uuid[]; v_solo_academia boolean;
begin
  if not private.has_any_module_access(p_organization_id,array['attendance','calendar'],false) then
    raise exception 'Not authorized';
  end if;
  v_admin := private.is_academy_admin(p_organization_id)
          or private.has_module_access(p_organization_id,'jugadores',false);
  select coalesce(array_agg(x),'{}') into v_mias from private.my_academy_ids(p_organization_id) x;
  -- Solo se acota a quien es exclusivamente profesor de academia: si además entrena
  -- al club, sigue viendo los entrenamientos de sus categorías como siempre.
  v_solo_academia := (not v_admin) and cardinality(v_mias)>0;

  return query
  with autor as (
    -- Quien marcó la última asistencia de cada sesión.
    select distinct on (ar.session_id) ar.session_id, ar.recorded_by_user_id
    from app.attendance_records ar
    where ar.organization_id=p_organization_id and ar.recorded_by_user_id is not null
    order by ar.session_id, ar.recorded_at desc nulls last
  )
  select s.id,s.session_type,
         coalesce(s.title, a.name||' · Entrenamiento', c.name||' · Entrenamiento'),
         s.category_id,c.name,s.starts_at,s.ends_at,s.location,s.status,s.responsible_user_id,
         (select count(*) from app.attendance_records ar
           where ar.organization_id=s.organization_id and ar.session_id=s.id
             and ar.status in ('present','late')),
         (select count(*) from private.session_roster_ids(s.organization_id,s.id)),
         s.academy_id, a.name,
         pr.display_name,
         -- Cubrió: tomó la lista de una categoría que no tiene asignada. Se
         -- calcula contra la asignación de HOY, que es lo único que se puede
         -- saber: no se guarda un histórico de asignaciones.
         (au.recorded_by_user_id is not null and s.category_id is not null
          and not exists(select 1 from app.category_staff_assignments cs
                         where cs.organization_id=s.organization_id
                           and cs.category_id=s.category_id
                           and cs.user_id=au.recorded_by_user_id)
          and exists(select 1 from app.category_staff_assignments cs
                     where cs.organization_id=s.organization_id
                       and cs.user_id=au.recorded_by_user_id))
  from app.sessions s
  left join app.categories c on c.id=s.category_id and c.organization_id=s.organization_id
  left join app.academies a on a.id=s.academy_id and a.organization_id=s.organization_id
  left join autor au on au.session_id=s.id
  left join public.profiles pr on pr.user_id=au.recorded_by_user_id
  where s.organization_id=p_organization_id
    and s.session_type in ('training','academy','evaluation')
    and (p_from is null or s.starts_at>=p_from)
    and (p_to is null or s.starts_at<p_to)
    and (not v_solo_academia or s.academy_id = any(v_mias))
  order by s.starts_at desc;
end $function$;
revoke all on function private.query_attendance_sessions(uuid,timestamptz,timestamptz) from public, anon, authenticated;

create function public.v2_attendance_sessions(
  organization_id uuid, from_at timestamptz default null, to_at timestamptz default null)
returns table(id uuid, session_type text, title text, category_id uuid, category_name text,
  starts_at timestamptz, ends_at timestamptz, location text, status text,
  responsible_user_id uuid, present_count bigint, roster_count bigint,
  academy_id uuid, academy_name text, taken_by text, covered boolean)
language sql security definer
set search_path to 'pg_catalog','private'
as $function$ select * from private.query_attendance_sessions(organization_id,from_at,to_at) $function$;
revoke all on function public.v2_attendance_sessions(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.v2_attendance_sessions(uuid,timestamptz,timestamptz) to authenticated;
;
