-- Cubrir a un compañero no se pide por WhatsApp: se hace y queda anotado.
--
-- La lista de asistencia es el objeto MENOS sensible del sistema (nombres y
-- caras) y es justo el que necesita flexibilidad: si cubrir exigiera que
-- Presidencia reasigne, el resultado real no sería más seguridad, sería que esa
-- lista no se toma. Así que el profe puede tomar lista de cualquier categoría,
-- pero no es lo default y queda registrado.
--
-- El expediente y el dinero NO tienen esta válvula: para palomear asistencia no
-- hace falta abrir la ficha de nadie.

-- 'mine' se agrega AL FINAL, pero el tipo cambia, así que hay que soltar antes.
drop function if exists public.v2_attendance_categories(uuid);
drop function if exists private.query_attendance_categories(uuid);

create function private.query_attendance_categories(p_organization_id uuid)
returns table(category_id uuid, code text, name text, active_players bigint, mine boolean)
language plpgsql stable security definer
set search_path to 'pg_catalog','app','private'
as $function$
declare v_admin boolean;
begin
  if not private.has_module_access(p_organization_id,'attendance',false) then raise exception 'Not authorized'; end if;
  -- Quien administra el club no tiene "suyas" y "ajenas": todas son suyas.
  v_admin := private.is_player_admin(p_organization_id);
  return query
  select c.id,c.code,c.name,count(p.id),
         v_admin or c.id in (select private.my_category_ids(p_organization_id))
  from app.categories c
  left join app.player_enrollments pe on pe.organization_id=c.organization_id and pe.category_id=c.id and pe.status='active'
  left join app.players p on p.id=pe.player_id and p.organization_id=pe.organization_id and p.status='active' and p.archived_at is null
  where c.organization_id=p_organization_id and c.status='active'
  group by c.id,c.code,c.name,c.sort_order
  order by c.sort_order nulls last,c.name;
end $function$;
revoke all on function private.query_attendance_categories(uuid) from public, anon, authenticated;

create function public.v2_attendance_categories(organization_id uuid)
returns table(category_id uuid, code text, name text, active_players bigint, mine boolean)
language sql security definer
set search_path to 'pg_catalog','private'
as $function$ select * from private.query_attendance_categories(organization_id) $function$;
revoke all on function public.v2_attendance_categories(uuid) from public, anon;
grant execute on function public.v2_attendance_categories(uuid) to authenticated;
;
