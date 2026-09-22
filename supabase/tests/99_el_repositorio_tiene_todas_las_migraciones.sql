-- Prueba 99 · SÓLO LECTURA · necesita comparar contra el repositorio
--
-- El hallazgo que la motivó: el 20 de septiembre de 2026 la base tenía 378
-- migraciones aplicadas y el repositorio guardaba 11. Las otras 367 vivían sólo
-- dentro de Supabase: sin revisión de código, sin historia en git, y sin forma
-- de reconstruir la base desde el repositorio.
--
-- Esta consulta saca la huella del historial REAL. `scripts/qa-migraciones-vs-base.sh`
-- la compara contra `supabase/migrations/MANIFIESTO.json`. Si no coinciden,
-- producción se adelantó al repositorio otra vez.
--
-- OJO con el encoding: la base cuenta caracteres y el sistema de archivos
-- cuenta bytes, así que los totales difieren si hay acentos. La que manda es la
-- huella, no el tamaño.

select
  count(*)                                                                   as migraciones,
  md5(string_agg(array_to_string(statements, E';\n\n') || E';\n', '' order by version)) as huella,
  min(version)                                                               as primera,
  max(version)                                                               as ultima
from supabase_migrations.schema_migrations;
