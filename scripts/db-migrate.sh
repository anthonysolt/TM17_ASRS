#!/usr/bin/env bash
# Apply every SQL file in database/migrations that has not been applied yet.
#
# Usage:
#   scripts/db-migrate.sh            # apply pending migrations
#   scripts/db-migrate.sh --status   # list applied / pending migrations
#
# DATABASE_URL is read from the environment, or from .env.local if present.
# Applied migrations are recorded in the schema_migrations table, so the
# script is safe to run repeatedly. Each migration runs in its own psql call
# with ON_ERROR_STOP; the script stops at the first failure.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/database/migrations"

if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env.local"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (export it or add it to .env.local)." >&2
  exit 1
fi

# Prefer a system psql over the npm "psql" package in node_modules/.bin.
PSQL_BIN="$(which -a psql 2>/dev/null | grep -v '/node_modules/' | head -n 1 || true)"
if [ -z "$PSQL_BIN" ]; then
  echo "psql was not found. Install the PostgreSQL client tools." >&2
  exit 1
fi

psql_run() {
  PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning" "$PSQL_BIN" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"
}

psql_value() {
  "$PSQL_BIN" "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"
}

psql_run -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );"

is_applied() {
  [ "$(psql_value "SELECT 1 FROM schema_migrations WHERE filename = '$1'")" = "1" ]
}

record() {
  psql_run -c "INSERT INTO schema_migrations (filename) VALUES ('$1') ON CONFLICT DO NOTHING;"
}

# Some migrations only upgrade databases built with an older layout. On a
# database created from the current schema.sql there is nothing for them to
# convert, so they are recorded as applied without running.
not_needed() {
  case "$1" in
    20260820_form_questions.sql)
      [ "$(psql_value "SELECT to_regclass('form_field') IS NULL")" = "t" ] ;;
    20261008_shared_form_questions.sql)
      [ "$(psql_value "SELECT NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'form_questions' AND column_name = 'display_order')")" = "t" ] ;;
    *) return 1 ;;
  esac
}

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
if [ ${#files[@]} -eq 0 ]; then
  echo "No migrations found in $MIGRATIONS_DIR."
  exit 0
fi

if [ "${1:-}" = "--status" ]; then
  for path in "${files[@]}"; do
    name="$(basename "$path")"
    if is_applied "$name"; then echo "applied  $name"; else echo "pending  $name"; fi
  done
  exit 0
fi

applied=0
for path in "${files[@]}"; do
  name="$(basename "$path")"
  if is_applied "$name"; then
    continue
  fi
  if not_needed "$name"; then
    echo "skip     $name (database already has the newer layout)"
    record "$name"
    continue
  fi
  echo "apply    $name"
  psql_run -f "$path"
  record "$name"
  applied=$((applied + 1))
done

echo "Done. $applied migration(s) applied."
