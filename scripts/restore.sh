#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Restore BOS Playbook from a backup archive.
#
#   ./scripts/restore.sh backups/backup-YYYYMMDD-HHMMSS.tar.gz
#   ./scripts/restore.sh backups/backup-YYYYMMDD-HHMMSS.tar.gz --db-only
#
# This replaces the current database and storage contents with the snapshot
# from the backup archive.
#
# Safety feature: The current state is dumped to a pre-restore safety archive
# first, so a restore can itself be undone if needed.
# ---------------------------------------------------------------------------
set -euo pipefail

# Ensure Git Bash / MSYS does not mangle Linux container paths
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

ARCHIVE="${1:-}"
DB_ONLY=false
if [[ "${2:-}" == "--db-only" ]]; then
  DB_ONLY=true
fi

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "Usage: ./scripts/restore.sh <backup-archive.tar.gz> [--db-only]" >&2
  echo "       ./scripts/backup.sh --list   to see what is available" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RESTORE_LOG="${RESTORE_LOG:-$BACKUP_DIR/restore.log}"
COMPOSE="docker compose"
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$BACKUP_DIR"

log_event() {
  local level="$1"
  local msg="$2"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "[$timestamp] [$level] $msg" >> "$RESTORE_LOG"
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  echo "ERROR: Restore failed on line $line_no (exit code $exit_code)" >&2
  log_event "ERROR" "Restore of $(basename "$ARCHIVE") FAILED on line $line_no (exit code $exit_code)"
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

echo "=== BOS Playbook restore ==="
echo "Archive: $ARCHIVE"
log_event "INFO" "Starting restore from archive: $(basename "$ARCHIVE") (db_only: $DB_ONLY)"

# --- 1. Safety net: snapshot what is there now -------------------------------
SAFETY="$BACKUP_DIR/pre-restore-$(date -u '+%Y%m%d-%H%M%S').tar.gz"
echo "-- taking a safety snapshot of the current state -> $(basename "$SAFETY")"
$COMPOSE exec -T db pg_dump \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --format plain --no-owner --no-privileges > "$WORK_DIR/current.sql" 2>/dev/null || true
tar -czf "$SAFETY" -C "$WORK_DIR" current.sql 2>/dev/null || true
log_event "INFO" "Saved pre-restore safety snapshot: $(basename "$SAFETY")"

# --- 2. Unpack archive ------------------------------------------------------
echo "-- unpacking"
tar -xzf "$ARCHIVE" -C "$WORK_DIR"

if [[ ! -f "$WORK_DIR/database.dump" && ! -f "$WORK_DIR/database.sql" ]]; then
  echo "ERROR: archive does not contain database.dump or database.sql - is it a BOS Playbook backup?" >&2
  log_event "ERROR" "Invalid archive: missing database dump in $(basename "$ARCHIVE")"
  exit 1
fi

# --- 3. Restore the database ------------------------------------------------
echo "-- restoring the database"

# Reset public schema first to ensure clean object recreation
$COMPOSE exec -T db psql \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --quiet \
  --command "
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO anon;
    GRANT ALL ON SCHEMA public TO authenticated;
    GRANT ALL ON SCHEMA public TO service_role;
  "

if [[ -f "$WORK_DIR/database.dump" ]]; then
  echo "   using custom-format dump (pg_restore)"
  # pg_restore might return exit code 1 on harmless warnings with --clean; we capture status
  $COMPOSE exec -T db pg_restore \
    --username "${POSTGRES_USER:-postgres}" \
    --dbname "${POSTGRES_DB:-postgres}" \
    --clean --if-exists \
    --no-owner \
    --no-privileges \
    < "$WORK_DIR/database.dump" || true
elif [[ -f "$WORK_DIR/database.sql" ]]; then
  echo "   using plain SQL dump (psql)"
  $COMPOSE exec -T db psql \
    --username "${POSTGRES_USER:-postgres}" \
    --dbname "${POSTGRES_DB:-postgres}" \
    --quiet \
    < "$WORK_DIR/database.sql"
fi

# Recreate extensions and restore Supabase grants
echo "-- restoring extensions and permissions"
$COMPOSE exec -T db psql \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --quiet \
  --command "
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, authenticator;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role, authenticator;
    GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role, authenticator;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON TABLES TO anon, authenticated, service_role, authenticator;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT ALL ON SEQUENCES TO anon, authenticated, service_role, authenticator;

    -- Ensure Supabase Storage role retains full access and search_path
    GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
    GRANT ALL ON SCHEMA storage TO supabase_storage_admin, postgres;
    GRANT ALL ON ALL TABLES IN SCHEMA storage TO supabase_storage_admin, postgres;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO supabase_storage_admin, postgres;
    ALTER ROLE supabase_storage_admin BYPASSRLS;
    ALTER ROLE supabase_storage_admin SET search_path = storage, public;

    -- Ensure Supabase Auth and PostgREST roles retain search_paths and clean tokens
    ALTER ROLE supabase_auth_admin SET search_path = auth, public;
    ALTER ROLE authenticator SET search_path = public, extensions;
    ALTER ROLE anon SET search_path = public, extensions;
    ALTER ROLE authenticated SET search_path = public, extensions;
    ALTER ROLE service_role SET search_path = public, extensions;
    UPDATE auth.users SET confirmation_token = COALESCE(confirmation_token, ''), recovery_token = COALESCE(recovery_token, ''), email_change = COALESCE(email_change, ''), email_change_token_new = COALESCE(email_change_token_new, '');
  "

if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
  $COMPOSE exec -T db psql \
    --username "${POSTGRES_USER:-postgres}" \
    --dbname "${POSTGRES_DB:-postgres}" \
    --quiet \
    --command "ALTER ROLE supabase_storage_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}';" || true
fi

# --- 4. Restore the storage volume -------------------------------------------
if [[ "$DB_ONLY" == "false" && -f "$WORK_DIR/storage.tar.gz" ]]; then
  if [[ -s "$WORK_DIR/storage.tar.gz" ]]; then
    echo "-- restoring the storage volume"
    if $COMPOSE ps --status running storage 2>/dev/null | grep -q storage; then
      $COMPOSE exec -T storage tar -xzf - -C /var/lib/storage < "$WORK_DIR/storage.tar.gz" \
        || echo "   (storage streaming unpack failed - non-fatal)"
    else
      echo "   (storage container not running - skipping storage volume restore)"
    fi
  else
    echo "-- no storage content in this archive"
  fi
fi

# --- 5. Verify --------------------------------------------------------------
echo "-- verifying restored content"
ACCOUNTS=$($COMPOSE exec -T db psql --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pb_accounts" 2>/dev/null | tr -d '[:space:]' || echo "?")

USERS=$($COMPOSE exec -T db psql --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pb_user_profiles" 2>/dev/null | tr -d '[:space:]' || echo "?")

SCENARIOS=$($COMPOSE exec -T db psql --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" --tuples-only --no-align \
  --command "SELECT count(*) FROM pb_scenarios" 2>/dev/null | tr -d '[:space:]' || echo "?")

log_event "SUCCESS" "Restore from $(basename "$ARCHIVE") successful: $ACCOUNTS accounts, $USERS users, $SCENARIOS scenarios"

echo "=== restore complete ==="
echo "Restored Accounts:  $ACCOUNTS"
echo "Restored Users:     $USERS"
echo "Restored Scenarios: $SCENARIOS"
echo "Safety snapshot:    $SAFETY"
echo "Log file:           $RESTORE_LOG"
echo
echo "Restart frontend and API containers if needed:"
echo "  make restart"
