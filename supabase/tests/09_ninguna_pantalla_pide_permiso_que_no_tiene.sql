-- Prueba 9 · PERMISOS · SÓLO LECTURA
--
-- El daño que evita: que una pantalla entera quede muerta en producción sin
-- que nadie se entere, porque a su función le faltó una palabra.
--
-- Todo el sistema funciona con el mismo patrón: la pantalla llama a
-- `public.v2_algo`, una cáscara que llama a `private.command_algo` o
-- `private.query_algo`, y es la función privada la que revisa permisos,
-- escribe y deja el evento de auditoría. Las privadas están cerradas —sólo
-- `postgres` tiene EXECUTE— y la cáscara pública es SECURITY DEFINER para
-- poder cruzar esa puerta en nombre de quien llama.
--
-- Cuando una cáscara se crea SIN SECURITY DEFINER, corre como el rol
-- `authenticated`, que no tiene EXECUTE sobre la privada, y la llamada muere
-- con `permission denied for function ...`. No truena al desplegar ni lo
-- detecta una prueba de JavaScript: truena el día que un usuario real toca el
-- botón.
--
-- Ya pasó dos veces. El 7 de septiembre de 2026 se arregló un lote
-- (`20260907184818_fix_wrappers_security_definer`) y el 28 de septiembre
-- habían vuelto a aparecer OCHO, caídos en silencio:
--
--   v2_set_product_photo       subir la foto de un producto   (Catálogo)
--   v2_portal_accept_consent   que una familia firme          (Familias)
--   v2_portal_request_benefit  que una familia pida beca      (Familias)
--   v2_portal_paperwork        la papelería del Tanner        (Familias)
--   v2_portal_progress         su avance y asistencia         (Familias)
--   v2_benefit_requests        ver solicitudes de beca        (Jugadores)
--   v2_resolve_benefit_request resolverlas                    (Jugadores)
--   v2_update_club_config      la configuración del club      (Admin)
--
-- Se descubrió porque un papá no podía subir una foto. Los otros siete nadie
-- los había reportado: una familia que no puede firmar no abre un ticket,
-- simplemente no firma.
--
-- Cómo lo prueba: busca toda cáscara `v2_*` que `authenticated` SÍ puede
-- llamar pero cuya función privada NO puede ejecutar. Esa combinación es
-- siempre un error: la pantalla llega a la cáscara y rebota en la puerta.
--
-- El control positivo importa tanto como la prueba: si mañana alguien abriera
-- las funciones privadas a `authenticated` —saltándose la cáscara y con ella
-- la revisión de permisos—, esta prueba dejaría de encontrar nada y pasaría
-- feliz. Por eso también se exige que las privadas sigan cerradas.

do $$
declare
  v_rotos text; v_n_rotos int;
  v_privadas_abiertas int; v_privadas_total int;
  v_definer int; v_total int;
begin
  -- LA PRUEBA: ninguna cáscara alcanzable debe rebotar en su función privada.
  select string_agg(distinct w.wrapper, ', ' order by w.wrapper), count(distinct w.wrapper)
    into v_rotos, v_n_rotos
  from (
    select p.oid as woid, p.proname as wrapper, p.prosecdef,
           (regexp_match(pg_get_functiondef(p.oid), 'private\.([a-z0-9_]+)\s*\('))[1] as llamada
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'v2\_%'
  ) w
  join pg_proc pp on pp.proname = w.llamada
  join pg_namespace pn on pn.oid = pp.pronamespace and pn.nspname = 'private'
  where not w.prosecdef
    and has_function_privilege('authenticated', w.woid, 'EXECUTE')
    and not has_function_privilege('authenticated', pp.oid, 'EXECUTE');

  if v_n_rotos > 0 then
    raise exception 'PRUEBA FALLÓ: % cáscara(s) v2_* piden un permiso que no tienen y su pantalla está muerta: %. Les falta SECURITY DEFINER.',
      v_n_rotos, v_rotos;
  end if;

  -- CONTROL POSITIVO 1: las privadas no se abren más de lo que ya estaban.
  --
  -- Si un día alguien abriera las privadas a `authenticated` —"para que deje
  -- de fallar"— la prueba de arriba no volvería a encontrar nada nunca, y de
  -- paso cualquiera podría saltarse la cáscara y llamar al comando directo,
  -- que es donde vive la revisión de permisos. Esa "solución" es peor que el
  -- bug, y esta prueba existe para que no se tome.
  --
  -- El tope NO es cero: al 28 de septiembre de 2026 hay 70 de 147 abiertas.
  -- Es deuda heredada, no de este cambio, y ponerlo en cero dejaría la prueba
  -- roja desde el primer día —y una prueba siempre roja se apaga—. El tope es
  -- un trinquete: la deuda puede bajar, nunca subir. Cuando se cierren, baja
  -- este número.
  select count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')),
         count(*)
    into v_privadas_abiertas, v_privadas_total
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and (p.proname like 'command\_%' or p.proname like 'portal\_%');

  if v_privadas_total = 0 then
    raise exception 'PRUEBA FALLÓ: no se encontró ninguna función privada, la prueba está midiendo el vacío';
  end if;

  if v_privadas_abiertas > 70 then
    raise exception 'PRUEBA FALLÓ: % de % funciones privadas están abiertas a authenticated (el tope es 70). Abrir la privada NO es la forma de arreglar un permission denied: la cáscara pública es la que necesita SECURITY DEFINER.',
      v_privadas_abiertas, v_privadas_total;
  end if;

  -- CONTROL POSITIVO 2: el patrón sigue siendo el patrón.
  -- Si la mayoría dejara de ser DEFINER, algo cambió de arquitectura y esta
  -- prueba ya no describe el sistema.
  select count(*) filter (where prosecdef), count(*) into v_definer, v_total
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'v2\_%';

  if v_definer * 2 < v_total then
    raise exception 'PRUEBA FALLÓ: sólo % de % cáscaras v2_* son SECURITY DEFINER; el patrón que esta prueba vigila ya no es el del sistema',
      v_definer, v_total;
  end if;

  raise notice 'PRUEBA OK · % cáscaras v2_* (% DEFINER) y ninguna rebota; % comandos privados siguen cerrados (% abiertos a authenticated)',
    v_total, v_definer, v_privadas_total, v_privadas_abiertas;
end $$;
