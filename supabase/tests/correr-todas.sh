#!/usr/bin/env bash
# Corre las pruebas de base de datos en orden y se detiene en la primera que falle.
#
#   DATABASE_URL="postgresql://..." ./supabase/tests/correr-todas.sh
#
# Todas son de sólo lectura: no insertan, no actualizan y no borran.
set -euo pipefail
: "${DATABASE_URL:?falta DATABASE_URL}"
cd "$(dirname "$0")"
fallos=0
for f in [0-9]*.sql; do
  printf '%-48s ' "$f"
  if salida=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
    echo "OK"
    echo "$salida" | grep -o 'PRUEBA OK.*' | sed 's/^/    /' || true
  else
    echo "FALLÓ"
    echo "$salida" | grep -o 'PRUEBA FALLÓ.*' | sed 's/^/    /' || echo "$salida" | tail -3 | sed 's/^/    /'
    fallos=$((fallos+1))
  fi
done
echo
if [ "$fallos" -gt 0 ]; then echo "$fallos prueba(s) fallaron"; exit 1; fi
echo "Todas las pruebas de base de datos pasaron"
