#!/usr/bin/env bash
# Crea una base de pruebas desde cero, aplica las migraciones y la semilla, y corre las pruebas de RLS.
# Uso, desde la raíz del repositorio: npm run test:db
# Necesita PostgreSQL 16 con PostGIS y pgTAP, y pg_prove (ver docs/DESARROLLO.md).
set -euo pipefail

cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
BASE="${BASE_PRUEBAS:-ventaja_pruebas}"
psql_base() { psql -X -q -v ON_ERROR_STOP=1 -d "$BASE" "$@"; }

echo "→ Base $BASE desde cero"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $BASE with (force)"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $BASE"
# Secretos SOLO de prueba. En Supabase van en el Vault (ver supabase/LEEME.md); nunca se suben valores reales.
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "alter database $BASE set app.clave_documento = 'clave-solo-para-pruebas-locales'"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "alter database $BASE set app.pepper_documento = 'pepper-solo-para-pruebas-locales'"

echo "→ Auth simulado de Supabase"
psql_base -f local/auth-simulado.sql
for m in migrations/*.sql; do
  echo "→ $m"
  psql_base -f "$m"
done
echo "→ Semilla"
psql_base -f seed.sql
psql_base -c "create extension if not exists pgtap"
psql_base -f local/pruebas-apoyo.sql

echo "→ Pruebas"
pg_prove -d "$BASE" --ext .sql -r tests/
