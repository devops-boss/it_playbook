#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Backend test suite
#
# Brings up a throwaway Postgres, applies every migration from scratch, runs
# the test suite against it, and then repeats the exercise with the demo
# content loaded, so both the empty and the populated database are covered.
#
#   ./scripts/test.sh              run the suite, then remove the container
#   ./scripts/test.sh --keep       keep the container so it can be inspected
#   ./scripts/test.sh --seed-only  only run the seeded content checks
#
# The suite is deliberately run against a FRESH database: the test file
# creates its own accounts, categories and criteria, so it expects to be
# the only writer.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/backend/migrations"
TEST_FILE="$PROJECT_ROOT/backend/tests/backend_test.sql"
VERIFY_FILE="$PROJECT_ROOT/backend/verify-seed.sql"

CONTAINER="${TEST_DB_CONTAINER:-pb-test-db}"
IMAGE="${TEST_DB_IMAGE:-postgres:15.4-alpine}"
DB_USER="postgres"
DB_NAME="postgres"
KEEP=0
SEED_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)      KEEP=1 ;;
    --seed-only) SEED_ONLY=1 ;;
    -h|--help)   sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
  MSYS_NO_PATHCONV=1 docker cp "$(docker_path "$dir")/$base" "$CONTAINER:/tmp/bosp.sql" >/dev/null
  MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f /tmp/bosp.sql
}

# Runs a SQL statement inside the container.
run_sql() {
  MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" psql \
    -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$1"
}

CREATED=0
cleanup() {
  if [[ "$CREATED" == "1" && "$KEEP" == "0" ]]; then
    MSYS_NO_PATHCONV=1 docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

ensure_container() {
  if MSYS_NO_PATHCONV=1 docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "-- reusing the running container '$CONTAINER'"
    return
  fi

  if MSYS_NO_PATHCONV=1 docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    MSYS_NO_PATHCONV=1 docker rm -f "$CONTAINER" >/dev/null
  fi

  echo "-- starting a throwaway Postgres ($IMAGE)"
  MSYS_NO_PATHCONV=1 docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_USER" \
    -e POSTGRES_DB="$DB_NAME" \
    "$IMAGE" >/dev/null
  CREATED=1

  echo -n "-- waiting for it to accept connections"
  for _ in $(seq 1 60); do
    if MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      echo " ok"
      return
    fi
    echo -n "."
    sleep 1
  done
  echo " failed" >&2
  exit 1
}

wipe_database() {
  echo "-- wiping the database"
  # The auth schema holds the demo and test users, and lives outside the
  # public schema, so it has to be reset as well.
  run_sql "DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null
}

apply_migrations() {
  echo "-- applying the migrations"
  local file
  for file in "$MIGRATIONS_DIR"/*.sql; do
    printf '   %-40s' "$(basename "$file")"
    if run_sql_file "$file" >/tmp/bosp-migrate.log 2>&1; then
      echo "ok"
    else
      echo "FAILED"
      cat /tmp/bosp-migrate.log >&2
      exit 1
    fi
  done
}

# ---------------------------------------------------------------------------
# Stage 1: the schema and the test suite
# ---------------------------------------------------------------------------
if [[ "$SEED_ONLY" == "0" ]]; then
  echo
  echo "==============================================================="
  echo " 1. schema and test suite"
  echo "==============================================================="
  ensure_container
  wipe_database
  apply_migrations

  echo
  echo "-- running backend/tests/backend_test.sql"
  if run_sql_file "$TEST_FILE"; then
    echo
    echo "=== TEST SUITE PASSED ==="
  else
    echo
    echo "=== TEST SUITE FAILED ===" >&2
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Stage 2: the demo content
# ---------------------------------------------------------------------------
echo
echo "==============================================================="
echo " 2. demo content"
echo "==============================================================="
ensure_container
wipe_database
apply_migrations

echo
echo "-- loading the demo content"
# The demo users share a password, which the seed reads from a session
# setting. It is a throwaway value for the test run.
MSYS_NO_PATHCONV=1 docker cp "$(docker_path "$PROJECT_ROOT/backend/seed")/demo_content.sql" \
  "$CONTAINER:/tmp/seed.sql" >/dev/null
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -v ON_ERROR_STOP=1 -c "SET bosp.demo_password = 'test-only-not-a-real-password';" \
  -f /tmp/seed.sql

echo
echo "-- running backend/verify-seed.sql"
if run_sql_file "$VERIFY_FILE"; then
  echo
  echo "=== SEED CHECKS PASSED ==="
else
  echo
  echo "=== SEED CHECKS FAILED ===" >&2
  exit 1
fi

echo
echo "All backend checks passed."
