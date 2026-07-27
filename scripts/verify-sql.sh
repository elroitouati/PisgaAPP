#!/usr/bin/env bash
# Applies the migrations to a throwaway Postgres and runs supabase/tests/rls.sql
# against them. Catches schema, constraint and RLS mistakes before they reach a
# real project.
#
# Usage: PGHOST=/path/to/socket PGPORT=5433 ./scripts/verify-sql.sh
set -euo pipefail

cd "$(dirname "$0")/.."

DB="pisga_verify_$$"
PSQL=(psql -v ON_ERROR_STOP=1 -U "${PGUSER:-postgres}" -q)

cleanup() { "${PSQL[@]}" -d postgres -c "drop database if exists $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -d postgres -c "create database $DB"

"${PSQL[@]}" -d "$DB" -f supabase/tests/harness.sql
for migration in supabase/migrations/*.sql; do
  echo "applying $migration"
  "${PSQL[@]}" -d "$DB" -f "$migration"
done

echo "running supabase/tests/rls.sql"
"${PSQL[@]}" -d "$DB" -f supabase/tests/rls.sql

echo "OK"
