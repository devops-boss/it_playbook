#!/usr/bin/env bash
# Apply every migration, in order, to the database in $1 (a container name).
# Used by the local test harness; the production path is scripts/migrate.sh.
set -uo pipefail

CONTAINER="${1:?container name required}"
MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/migrations"

status=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  out=$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f" 2>&1)
  if [ -n "$out" ]; then
    echo "=== $(basename "$f")"
    echo "$out" | head -20
    status=1
  fi
done
echo "migration sweep finished (status=$status)"
exit $status
