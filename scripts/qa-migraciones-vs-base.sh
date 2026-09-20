#!/usr/bin/env bash
# ¿El repositorio tiene todas las migraciones que la base tiene aplicadas?
#
#   DATABASE_URL="postgresql://..." ./scripts/qa-migraciones-vs-base.sh
#
# Sólo lee. Corre esto después de cada migración nueva: si falla, exporta el
# historial otra vez y actualiza el manifiesto.
set -euo pipefail
: "${DATABASE_URL:?falta DATABASE_URL}"
cd "$(dirname "$0")/.."

lectura=$(psql "$DATABASE_URL" -t -A -F'|' -v ON_ERROR_STOP=1 \
  -c "select count(*), md5(string_agg(array_to_string(statements, E';\n\n') || E';\n', '' order by version)) from supabase_migrations.schema_migrations;")
base_n="${lectura%%|*}"; base_h="${lectura##*|}"

repo_n=$(node -e "import('./scripts/manifiesto-migraciones.mjs').then(m=>console.log(m.huellaDelHistorial().migraciones))")
repo_h=$(node -e "import('./scripts/manifiesto-migraciones.mjs').then(m=>console.log(m.huellaDelHistorial().huella))")

printf 'base de datos : %s migraciones · %s\n' "$base_n" "$base_h"
printf 'repositorio   : %s migraciones · %s\n' "$repo_n" "$repo_h"

if [ "$base_h" = "$repo_h" ]; then
  echo "OK · el repositorio puede reconstruir la base"
  exit 0
fi
echo
echo "FALLÓ · el repositorio y la base no tienen el mismo historial."
echo "Exporta las migraciones que falten y corre: node scripts/manifiesto-migraciones.mjs --escribir"
exit 1
