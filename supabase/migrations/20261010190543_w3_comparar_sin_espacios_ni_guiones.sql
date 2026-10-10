-- Al importar, "SUB 10", "sub-10" y "Sub10" son la misma categoría, y
-- "Pérez-Gómez" el mismo apellido que "Perez Gomez". Se compara sin acentos,
-- sin mayúsculas y sin nada que no sea letra o número.
create or replace function private.norm_texto(p text)
returns text language sql immutable set search_path to 'pg_catalog'
as $function$
  select regexp_replace(lower(translate(trim(coalesce(p, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]', '', 'g')
$function$;