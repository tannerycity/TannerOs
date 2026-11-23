#!/usr/bin/env bash
# Prueba la migracion del SaaS comercial en una base LOCAL desechable.
# Nunca toca Supabase: crea mcfc_saas_local, la llena con datos sinteticos,
# aplica supabase/pendientes/saas_comercial_v1.sql y corre las pruebas.
#
#   ./supabase/tests/saas/correr-local.sh      (necesita psql y un Postgres local)
set -euo pipefail
cd "$(dirname "$0")/../../.."
DB=mcfc_saas_local
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { PGOPTIONS="-c client_min_messages=warning" psql -q -X -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }
run supabase/tests/saas/00_base_local.sql
run supabase/tests/saas/05_datos_local.sql
run supabase/pendientes/saas_comercial_v1.sql
# Idempotencia: aplicarla dos veces no debe fallar ni duplicar semillas.
run supabase/pendientes/saas_comercial_v1.sql
psql -q -X -At -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/saas/10_pruebas_local.sql 2>&1 | grep -E "PRUEBA|TODAS|psql:" | sed "s/^.*\(NOTICE\|WARNING\|ERROR\):  //"
node supabase/tests/saas/paridad.mjs "$DB"
