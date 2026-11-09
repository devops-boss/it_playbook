#!/usr/bin/env bash
# ============================================================================
# Section 14 Acceptance Test: Automated Backup, Retention & Disaster Recovery
# Big Outsource IT Operations Playbook
# ============================================================================
set -euo pipefail

export MSYS_NO_PATHCONV=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==============================================================="
echo " SECTION 14: BACKUP, RESTORE & DISASTER RECOVERY TESTS"
echo "==============================================================="

# 1. Run Backup Script
echo
echo "[1/6] Running scripts/backup.sh..."
./scripts/backup.sh

# 2. Verify Backup Archive
echo
echo "[2/6] Verifying generated backup archive..."
LATEST_BACKUP=$(ls -1t backups/backup-*.tar.gz 2>/dev/null | head -1)
if [[ -z "$LATEST_BACKUP" || ! -f "$LATEST_BACKUP" ]]; then
  echo "ERROR: No backup archive found in backups/" >&2
  exit 1
fi
echo "Found archive: $LATEST_BACKUP"
tar -ztvf "$LATEST_BACKUP"

for item in "database.dump" "database.sql" "storage.tar.gz" "config.json" "MANIFEST.txt"; do
  if ! tar -ztf "$LATEST_BACKUP" | grep -q "$item"; then
    echo "ERROR: Archive is missing $item" >&2
    exit 1
  fi
done
echo "All required components verified inside archive."

# 3. Verify Backup Log
echo
echo "[3/6] Verifying backups/backup.log..."
if [[ ! -f "backups/backup.log" ]]; then
  echo "ERROR: backups/backup.log was not created" >&2
  exit 1
fi
tail -n 5 backups/backup.log
if ! grep -q "\[SUCCESS\] Backup" backups/backup.log; then
  echo "ERROR: No [SUCCESS] line found in backup.log" >&2
  exit 1
fi

# 4. Retention test
echo
echo "[4/6] Testing retention purge logic..."
MOCK_OLD="backups/backup-20200101-000000.tar.gz"
cp "$LATEST_BACKUP" "$MOCK_OLD"
touch -d "40 days ago" "$MOCK_OLD" 2>/dev/null || touch -t 202001010000 "$MOCK_OLD" 2>/dev/null || true

./scripts/backup.sh
if [[ -f "$MOCK_OLD" ]]; then
  rm -f "$MOCK_OLD"
  echo "ERROR: Expired backup was not pruned by retention" >&2
  exit 1
fi
echo "Retention confirmed: Expired backup file pruned."

# 5. Restore test
echo
echo "[5/6] Testing restore from archive: $LATEST_BACKUP..."
./scripts/restore.sh "$LATEST_BACKUP"

if ! grep -q "\[SUCCESS\] Restore from .* successful: 26 accounts, 8 users" backups/restore.log; then
  echo "ERROR: restore.log does not indicate successful restore" >&2
  exit 1
fi

# 6. Database Health
echo
echo "[6/6] Running Section 14 SQL verification test..."
docker compose exec -T db psql -U supabase_admin -d postgres -f - < backend/tests/section14_test.sql

echo
echo "==============================================================="
echo " SECTION 14 ACCEPTANCE TESTS PASSED 100% SUCCESSFULLY"
echo "==============================================================="
