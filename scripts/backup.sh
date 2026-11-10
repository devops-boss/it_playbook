#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Back up BOS Playbook - IT Operations Playbook.
#
# Produces one archive containing:
#   - a pg_dump of the database (custom format + plain SQL)
#   - the Storage volume (attachments and images)
#   - the configuration export as readable JSON (export_config)
#   - MANIFEST.txt with backup metadata
#
# Retention: BACKUP_RETENTION_DAILY daily copies and BACKUP_RETENTION_WEEKLY
# weekly copies are kept; older ones are removed.
#
# Logs success and failure with timestamps to $BACKUP_DIR/backup.log.
#
# Usage:
#   ./scripts/backup.sh                # run a backup now
#   ./scripts/backup.sh --list         # list existing backups
# ---------------------------------------------------------------------------
set -euo pipefail

# Ensure Git Bash / MSYS does not mangle Linux container paths like /var/lib/storage
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

# Load .env if it exists
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"
DAILY_KEEP="${BACKUP_RETENTION_DAILY:-7}"
WEEKLY_KEEP="${BACKUP_RETENTION_WEEKLY:-4}"
COMPOSE="docker compose"

mkdir -p "$BACKUP_DIR"

log_event() {
  local level="$1"
  local msg="$2"
  local timestamp
  timestamp="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "[$timestamp] [$level] $msg" >> "$BACKUP_LOG"
}

on_error() {
  local exit_code=$?
  local line_no="${1:-unknown}"
  echo "ERROR: Backup failed on line $line_no (exit code $exit_code)" >&2
  log_event "ERROR" "Backup FAILED on line $line_no with exit code $exit_code"
  exit "$exit_code"
}
trap 'on_error $LINENO' ERR

if [[ "${1:-}" == "--list" ]]; then
  echo "Backups in $BACKUP_DIR:"
  ls -1 "$BACKUP_DIR" | grep '\.tar\.gz$' | sort -r || echo "  (no backups found)"
  exit 0
fi

STAMP=$(date -u '+%Y%m%d-%H%M%S')
DAY_OF_WEEK=$(date -u '+%u')   # 1 = Monday ... 7 = Sunday
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

echo "=== BOS Playbook backup $STAMP ==="
log_event "INFO" "Starting backup $STAMP (daily retention: $DAILY_KEEP, weekly retention: $WEEKLY_KEEP)"

# --- 1. Database ------------------------------------------------------------
echo "-- dumping the database"
# Compressed custom-format dump
$COMPOSE exec -T db pg_dump \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges \
  > "$WORK_DIR/database.dump"

# Plain SQL dump for maximum recovery flexibility
$COMPOSE exec -T db pg_dump \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --format plain \
  --no-owner \
  --no-privileges \
  > "$WORK_DIR/database.sql"

# --- 2. Storage -------------------------------------------------------------
echo "-- archiving the storage volume"
STORAGE_FILE="$WORK_DIR/storage.tar.gz"
if $COMPOSE ps --status running storage 2>/dev/null | grep -q storage; then
  $COMPOSE exec -T storage tar -czf - -C /var/lib/storage . > "$STORAGE_FILE" 2>/dev/null \
    || $COMPOSE run --rm --no-deps -T storage tar -czf - -C /var/lib/storage . > "$STORAGE_FILE" 2>/dev/null \
    || echo "   (storage volume archive failed - using empty archive)"
else
  echo "   (storage container not running - using empty archive)"
  : > "$STORAGE_FILE"
fi

# Ensure storage file exists even if empty
if [[ ! -f "$STORAGE_FILE" ]]; then
  : > "$STORAGE_FILE"
fi

# --- 3. Configuration export ------------------------------------------------
echo "-- exporting the configuration as JSON"
$COMPOSE exec -T db psql \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  --tuples-only --no-align \
  --command "SELECT export_config()::text" \
  > "$WORK_DIR/config.json" 2>/dev/null || echo "{}" > "$WORK_DIR/config.json"

# --- 4. Metadata ------------------------------------------------------------
cat > "$WORK_DIR/MANIFEST.txt" <<EOF
BOS Playbook backup
Created:     $(date -u '+%Y-%m-%d %H:%M:%S UTC')
Host:        $(hostname)
Stamp:       $STAMP
DayOfWeek:   $DAY_OF_WEEK
Contents:    database.dump, database.sql, storage.tar.gz, config.json
EOF

# --- 5. Archive -------------------------------------------------------------
ARCHIVE="$BACKUP_DIR/backup-$STAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$WORK_DIR" .

SIZE=$(du -h "$ARCHIVE" 2>/dev/null | cut -f1 || ls -lh "$ARCHIVE" | awk '{print $5}')
echo "-- wrote $ARCHIVE ($SIZE)"

# --- 6. Retention -----------------------------------------------------------
echo "-- applying retention ($DAILY_KEEP daily, $WEEKLY_KEEP weekly)"

# Purge non-weekly backups older than DAILY_KEEP days
find "$BACKUP_DIR" -maxdepth 1 -name 'backup-*.tar.gz' -mtime +"$DAILY_KEEP" \
  -not -newermt "-$((WEEKLY_KEEP * 7)) days" -print 2>/dev/null | while read -r old_file; do
    if [[ -n "$old_file" && -f "$old_file" ]]; then
      echo "   removing expired daily backup: $(basename "$old_file")"
      log_event "RETENTION" "Purged expired daily backup: $(basename "$old_file")"
      rm -f "$old_file"
    fi
  done

# Keep the most recent Sunday backups as the weekly set up to WEEKLY_KEEP
find "$BACKUP_DIR" -maxdepth 1 -name 'backup-*.tar.gz' -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | awk '{print $2}' | while read -r file; do
      weekday=$(date -u -r "$file" '+%u' 2>/dev/null || echo 0)
      if [[ "$weekday" == "7" ]]; then
          count=$(find "$BACKUP_DIR" -maxdepth 1 -name 'backup-*.tar.gz' \
            -newermt "-$((WEEKLY_KEEP * 7)) days" 2>/dev/null | wc -l)
          if [[ "$count" -gt "$WEEKLY_KEEP" ]]; then
              echo "   removing old weekly backup: $(basename "$file")"
              log_event "RETENTION" "Purged old weekly backup: $(basename "$file")"
              rm -f "$file"
          fi
      fi
  done

log_event "SUCCESS" "Backup $STAMP created successfully: $(basename "$ARCHIVE") ($SIZE)"

echo "=== backup complete ==="
echo "Log file:     $BACKUP_LOG"
echo "Restore with: ./scripts/restore.sh $ARCHIVE"
