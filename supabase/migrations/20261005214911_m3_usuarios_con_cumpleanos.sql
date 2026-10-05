-- Usuarios muestra el cumpleaños de cada integrante del staff
--
-- Complemento de m2: quien administra Usuarios puede ver y capturar la fecha
-- de nacimiento de alguien que no la ha puesto. Se parcha la definición
-- vigente de query_users_admin en vez de copiarla completa; si cambió, la
-- migración se detiene.

do $patch$
declare d text; n text;
begin
  d := pg_get_functiondef('private.query_users_admin'::regproc);
  n := replace(d, '''displayName'',p.display_name,', '''displayName'',p.display_name,''birthDate'',p.birth_date,');
  if n = d then raise exception 'query_users_admin cambió: no encontré displayName para agregar birthDate'; end if;
  execute n;
end $patch$;
