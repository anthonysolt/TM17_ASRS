#!/usr/bin/env bash
# Upgrade a database whose forms were created with the pre-versioning schema
# (form_questions with display_order, no form_version / form_version_questions /
# root_field_id) so its forms, questions and answers work with this version.
# Goals are upgraded too: their weights are rescaled to percentages.
#
# Usage:
#   scripts/upgrade-legacy-forms.sh              # back up, migrate, verify
#   scripts/upgrade-legacy-forms.sh --no-backup  # skip the pg_dump backup
#
# DATABASE_URL is read from the environment, or from .env.local if present.
# Safe to run more than once: migrations already applied are skipped.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# Prefer system client tools over npm packages in node_modules/.bin.
PSQL_BIN="$(which -a psql 2>/dev/null | grep -v '/node_modules/' | head -n 1 || true)"
PG_DUMP_BIN="$(which -a pg_dump 2>/dev/null | grep -v '/node_modules/' | head -n 1 || true)"
if [ -z "$PSQL_BIN" ]; then
  echo "psql was not found. Install the PostgreSQL client tools." >&2
  exit 1
fi

psql_value() {
  "$PSQL_BIN" "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"
}

if [ "$(psql_value "SELECT to_regclass('form') IS NOT NULL")" != "t" ]; then
  echo "No form table found. Is DATABASE_URL pointing at the ASRS database?" >&2
  exit 1
fi

# 1. Backup. Two of the migrations are not reversible.
if [ "${1:-}" != "--no-backup" ]; then
  if [ -z "$PG_DUMP_BIN" ]; then
    echo "pg_dump was not found. Install it or re-run with --no-backup." >&2
    exit 1
  fi
  backup="$ROOT_DIR/backup_before_form_upgrade_$(date +%Y%m%d_%H%M%S).dump"
  echo "Backing up to $backup"
  "$PG_DUMP_BIN" "$DATABASE_URL" -Fc -f "$backup"
fi

# 2. Schema and data migrations: adds form_version, moves questions into
#    form_version_questions, links submissions to version 1, adds root_field_id.
bash "$ROOT_DIR/scripts/db-migrate.sh"

# 3. Old databases default is_core_question to 1; new ones default it to 0.
"$PSQL_BIN" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "ALTER TABLE field ALTER COLUMN is_core_question SET DEFAULT 0;"

# 4. Goal weights are percentages that add up to 100 within an initiative.
#    Older goals use relative weights such as 1 or 5. Rescale each initiative
#    that is not at 100, keeping the proportions between its goals.
"$PSQL_BIN" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;

CREATE TEMP TABLE goal_weight_rescale ON COMMIT DROP AS
SELECT g.goal_id,
       g.initiative_id,
       CASE
         WHEN t.total > 0 THEN ROUND((100.0 * GREATEST(g.weight, 0) / t.total)::numeric, 2)
         ELSE ROUND((100.0 / t.goal_count)::numeric, 2)
       END AS new_weight
FROM initiative_goal g
JOIN (
  SELECT initiative_id,
         SUM(GREATEST(weight, 0)) AS total,
         COUNT(*) AS goal_count
  FROM initiative_goal
  GROUP BY initiative_id
  HAVING ABS(SUM(GREATEST(weight, 0)) - 100) > 0.01
) t ON t.initiative_id = g.initiative_id;

-- Rounding can leave the total a few hundredths off 100; give the difference
-- to the heaviest goal (lowest goal_id on ties).
UPDATE goal_weight_rescale r
SET new_weight = r.new_weight + (100 - s.total)
FROM (
  SELECT initiative_id, SUM(new_weight) AS total,
         (ARRAY_AGG(goal_id ORDER BY new_weight DESC, goal_id ASC))[1] AS heaviest_goal_id
  FROM goal_weight_rescale
  GROUP BY initiative_id
) s
WHERE r.initiative_id = s.initiative_id
  AND r.goal_id = s.heaviest_goal_id;

UPDATE initiative_goal g
SET weight = r.new_weight,
    updated_at = CURRENT_TIMESTAMP
FROM goal_weight_rescale r
WHERE g.goal_id = r.goal_id;

COMMIT;
SQL

# 5. Verify every form is usable.
echo
echo "Verifying forms..."
problems="$(psql_value "
  SELECT 'form ' || f.form_id || ' (' || f.form_name || ') has no version'
  FROM form f
  WHERE NOT EXISTS (SELECT 1 FROM form_version fv WHERE fv.form_id = f.form_id)
  UNION ALL
  SELECT 'form ' || fv.form_id || ' version ' || fv.version_number || ' has no questions'
  FROM form_version fv
  WHERE NOT EXISTS (SELECT 1 FROM form_version_questions q WHERE q.form_version_id = fv.form_version_id)
  UNION ALL
  SELECT 'submission ' || s.submission_id || ' has no form version'
  FROM submission s WHERE s.form_version_id IS NULL
  UNION ALL
  SELECT 'answer ' || sv.submission_value_id || ' points at a question not on its version'
  FROM submission_value sv
  JOIN submission s ON s.submission_id = sv.submission_id
  WHERE NOT EXISTS (
    SELECT 1 FROM form_version_questions q
    WHERE q.form_version_id = s.form_version_id AND q.form_question_id = sv.form_question_id)
")"

"$PSQL_BIN" "$DATABASE_URL" -q -c "
  SELECT f.form_id, f.form_name, fv.version_number AS version, fv.status,
         (SELECT COUNT(*) FROM form_version_questions q WHERE q.form_version_id = fv.form_version_id) AS questions,
         (SELECT COUNT(*) FROM submission s WHERE s.form_version_id = fv.form_version_id) AS submissions
  FROM form f JOIN form_version fv ON fv.form_id = f.form_id
  ORDER BY f.form_id, fv.version_number;"

if [ -n "$problems" ]; then
  echo "Upgrade finished with problems:" >&2
  echo "$problems" >&2
  exit 1
fi
echo "All forms upgraded."
