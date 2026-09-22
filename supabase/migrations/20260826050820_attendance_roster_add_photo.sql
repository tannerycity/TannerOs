
drop function if exists public.v2_attendance_roster(uuid,uuid);
drop function if exists private.query_attendance_roster(uuid,uuid);

create function private.query_attendance_roster(p_organization_id uuid, p_session_id uuid)
returns table(player_id uuid, code text, player_name text, category_name text, status text, arrived_at timestamptz, punctuality text, uniform_status text, attitude_note text, injury_note text, pickup_note text, notes text, photo_path text, photo_bucket text)
language plpgsql stable security definer set search_path to 'pg_catalog','app','private'
as $$
declare v_category uuid;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  select category_id into v_category from app.sessions where id=p_session_id and organization_id=p_organization_id;
  if not found then raise exception 'Session not found'; end if;
  return query
  select p.id,p.code,trim(concat_ws(' ',p.first_name,p.last_name)),c.name,ar.status,ar.arrived_at,ar.punctuality,ar.uniform_status,ar.attitude_note,ar.injury_note,ar.pickup_note,ar.notes,p.photo_path,p.photo_bucket
  from app.player_enrollments pe
  join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id
  join app.categories c on c.id=pe.category_id and c.organization_id=pe.organization_id
  left join app.attendance_records ar on ar.organization_id=pe.organization_id and ar.session_id=p_session_id and ar.player_id=p.id
  where pe.organization_id=p_organization_id and pe.category_id=v_category and pe.status='active' and p.status='active'
  order by p.first_name,p.last_name,p.id;
end $$;

create function public.v2_attendance_roster(organization_id uuid, session_id uuid)
returns table(player_id uuid, code text, player_name text, category_name text, status text, arrived_at timestamptz, punctuality text, uniform_status text, attitude_note text, injury_note text, pickup_note text, notes text, photo_path text, photo_bucket text)
language sql security definer set search_path to 'pg_catalog','private'
as $$ select * from private.query_attendance_roster(organization_id,session_id) $$;

revoke all on function public.v2_attendance_roster(uuid,uuid) from public, anon;
grant execute on function public.v2_attendance_roster(uuid,uuid) to authenticated;
;
