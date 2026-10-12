-- Solo lectura (demo o pago pendiente): v2_my_modules ya no da can_write.
-- staff-access (edge) se guía por este permiso antes de crear, invitar o
-- resetear cuentas en Auth, que vive fuera del candado de la base. Así una
-- sesión de demo no puede mandar invitaciones ni crear usuarios.
create or replace function private.query_my_modules(p_organization_id uuid)
returns table(module_code text, can_read boolean, can_write boolean, enabled boolean)
language plpgsql stable security definer set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare v_bloqueado boolean;
begin
  if not private.is_active_member(p_organization_id) then raise exception 'Not authorized'; end if;
  v_bloqueado := private.club_write_hold(p_organization_id) is not null and not private.is_platform_admin();
  return query
  with canonical(code) as (values
    ('players'),('billing'),('accounting'),('academies'),('attendance'),('callups'),('programs'),('commerce'),('prospects'),('scouting'),('sponsors'),('equipment'),('calendar'),('users'),('admin'),('qa'),
    ('commerce_finance'),('catalogo'),('jugadores_familia'),('jugadores_estado')
  )
  select c.code, private.has_module_access(p_organization_id,c.code,false),
         not v_bloqueado and private.has_module_access(p_organization_id,c.code,true),
         private.module_enabled(p_organization_id,c.code)
  from canonical c;
end $function$;
