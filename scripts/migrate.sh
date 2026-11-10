#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Apply the SQL migrations
#
# Usage:
#   ./scripts/migrate.sh                 # apply to the running db container
#   ./scripts/migrate.sh --local-test    # apply to a throwaway local Postgres
#   ./scripts/migrate.sh --status        # show what has and has not been applied
#
# Migrations are applied in filename order and are recorded in the
# pb_migrations table, so running this twice does nothing the second time.
#
# One file is deliberately skipped: 00_auth_stub.sql. That file creates a
# small stand-in for the Supabase auth schema, so that the migrations can
# be tested against a plain Postgres. In the Docker stack the real auth
# schema is provided by the Supabase image, and replacing its functions
# would break the way the API resolves the signed in user.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/backend/migrations"

DB_CONTAINER="${DB_CONTAINER:-bos-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-postgres}"
SKIP_FILES=("00_auth_stub.sql")

STATUS_ONLY=false
if [[ "${1:-}" == "--status" ]]; then
  STATUS_ONLY=true
fi

if [[ "${1:-}" == "--local-test" ]]; then
  DB_CONTAINER="${TEST_DB_CONTAINER:-pb-test-db}"
fi

if ! MSYS_NO_PATHCONV=1 docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "ERROR: container '$DB_CONTAINER' is not running." >&2
  echo "Start it with: make up" >&2
  exit 1
fi

# Git Bash reports Windows paths as /c/Users/... which the Windows Docker
# client cannot open. pwd -W gives the same directory as C:/Users/...
docker_path() {
  local dir="$1"
  local win
  win="$(cd "$dir" 2>/dev/null && pwd -W 2>/dev/null || true)"
  if [[ -n "$win" ]]; then
    printf '%s' "$win"
  else
    printf '%s' "$dir"
  fi
}

# Runs a SQL file inside the container. The file is copied in rather than
# piped, because a pipe through the host shell mangles the content.
run_sql_file() {
  local file="$1"
  local dir base
  dir="$(dirname "$file")"
  base="$(basename "$file")"
  MSYS_NO_PATHCONV=1 docker cp "$(docker_path "$dir")/$base" "$DB_CONTAINER:/tmp/bosp-migrate.sql" >/dev/null
  MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f /tmp/bosp-migrate.sql
}

run_sql() {
  MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$1"
}

# --- The record of what has been applied ------------------------------------
MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
  -U "$DB_USER" -d "$DB_NAME" -q -c "
    CREATE TABLE IF NOT EXISTS pb_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );" >/dev/null

is_skipped() {
  local name="$1"
  local skip
  for skip in "${SKIP_FILES[@]}"; do
    [[ "$name" == "$skip" ]] && return 0
  done
  return 1
}

applied_count() {
  MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT count(*) FROM pb_migrations" 2>/dev/null || echo 0
}

if [[ "$STATUS_ONLY" == "true" ]]; then
  echo "Applied migrations ($(applied_count)):"
  MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT name, applied_at FROM pb_migrations ORDER BY name"
  echo
  echo "Not applied yet:"
  for file in "$MIGRATIONS_DIR"/*.sql; do
    name="$(basename "$file")"
    is_skipped "$name" && continue
    found=$(MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
      -U "$DB_USER" -d "$DB_NAME" -tAc \
      "SELECT 1 FROM pb_migrations WHERE name = '$name'")
    if [[ "$found" != "1" ]]; then
      echo "  - $name"
    fi
  done
  exit 0
fi

echo "Applying the migrations from $MIGRATIONS_DIR to '$DB_CONTAINER'..."

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"

  if is_skipped "$name"; then
    echo "  - $name (skipped: the Supabase image provides the auth schema)"
    continue
  fi

  found=$(MSYS_NO_PATHCONV=1 docker exec "$DB_CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT 1 FROM pb_migrations WHERE name = '$name'")

  if [[ "$found" == "1" ]]; then
    echo "  - $name (already applied, skipping)"
    continue
  fi

  echo "  + $name"
  if ! run_sql_file "$file" >/tmp/bosp-migrate.log 2>&1; then
    echo "ERROR: the migration '$name' failed." >&2
    cat /tmp/bosp-migrate.log >&2
    exit 1
  fi

  run_sql "INSERT INTO pb_migrations (name) VALUES ('$name') ON CONFLICT DO NOTHING" >/dev/null
done

echo "All migrations applied."
