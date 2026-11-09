-- h71 · Mi semana para cobranza: el permiso correcto (09/11/2026)
--
-- h70 pedía permiso de escribir en cobranza (billing), pero Zul cobra con
-- Taquilla y corrige con Contabilidad: se quedaba sin barra. Ahora cuenta
-- billing o accounting con escritura. Brandon (Operaciones, director
-- deportivo) sólo tiene Taquilla: sigue con su barra de director.

do $$
declare d text;
  v_a text := 'private.user_module(p_organization_id, p_user_id, ''billing'', true);';
  v_b text := '(private.user_module(p_organization_id, p_user_id, ''billing'', true) or private.user_module(p_organization_id, p_user_id, ''accounting'', true));';
begin
  d := pg_get_functiondef('private.week_status(uuid,uuid,date)'::regprocedure);
  if position('''accounting'', true)' in d) = 0 then
    if (length(d) - length(replace(d, v_a, ''))) / length(v_a) <> 1 then raise exception 'h71: no encontré la regla de cobranza en week_status'; end if;
    execute replace(d, v_a, v_b);
  end if;
end $$;
