-- El estado de cuenta de un Tanner sólo lo ve quien maneja dinero
--
-- MEDIDO (06/10/2026): query_player_account_statement dejaba pasar a
-- cualquiera con permiso de Jugadores. Los profes (Formadores) lo tienen, así
-- que podían leer por la API cuánto ha pagado y cuánto debe cada familia,
-- aunque la app no les enseñara el botón. Presidencia lo pidió cerrar.
--
-- QUÉ HACE: el permiso pasa de billing|players|accounting a
-- billing|accounting (Cobranza o Contabilidad). Se parcha la definición
-- vigente; si cambió, la migración se detiene.
--
-- REVERSIBLE: volver a poner 'players' en el arreglo.

do $patch$
declare d text; n text;
begin
  d := pg_get_functiondef('private.query_player_account_statement'::regproc);
  n := replace(d, 'array[''billing'',''players'',''accounting'']', 'array[''billing'',''accounting'']');
  if n = d then raise exception 'query_player_account_statement cambió: no encontré el permiso a cerrar'; end if;
  execute n;
end $patch$;
