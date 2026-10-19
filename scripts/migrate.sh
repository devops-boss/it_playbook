#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Apply SQL migrations
#
# Usage:
#   ./scripts/migrate.sh                 # apply to running db container
#   ./scripts/migrate.sh --local-test    # apply to a throwaway local Postgres
#
# Migrations are applied in filename order and are idempotent-safe only
# against a fresh database. Track applied state in the pb_migrations table.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/backend/migrations"

DB_CONTAINER="${DB_CONTAINER:-bos-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-postgres}"

if [[ "${1:-}" == "--local-test" ]]; then
  DB_CONTAINER="${TEST_DB_CONTAINER:-pb-test-db}"
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "ERROR: container '$DB_CONTAINER' is not running." >&2
  echo "Start it with: docker compose up -d db" >&2
  exit 1
fi

echo "Applying migrations from $MIGRATIONS_DIR to container '$DB_CONTAINER'..."

# Track migration state
docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q <<'SQL'
CREATE TABLE IF NOT EXISTS pb_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  applied="$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT 1 FROM pb_migrations WHERE name = '$name'")"

  if [[ "$applied" == "1" ]]; then
    echo "  - $name (already applied, skipping)"
    continue
  fi

  echo "  + $name"
  if ! docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q < "$file"; then
    echo "ERROR: migration '$name' failed." >&2
    exit 1
  fi

  docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
    "INSERT INTO pb_migrations (name) VALUES ('$name') ON CONFLICT DO NOTHING"
done

echo "All migrations applied."
