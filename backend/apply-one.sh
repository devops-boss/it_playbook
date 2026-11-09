#!/usr/bin/env bash
# Re-apply a single migration to the test container, bypassing the applied
# state in pb_migrations. Used while iterating on a migration file.
#
#   bash backend/apply-one.sh pb-seed-test 10_search_fixes.sql
#
# The migration is copied into the container first, then run with psql
# inside it. Both steps avoid piping SQL through the host, which Git Bash
# mangles on Windows.
set -uo pipefail

CONTAINER="${1:?container name required}"
FILE="${2:?migration filename required}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve to a Windows-style path so docker can read the file. Git Bash
# reports /c/... which docker on Windows cannot open.
WIN_DIR="$(cd "$DIR" && pwd -W)"

MSYS_NO_PATHCONV=1 docker cp "$WIN_DIR/migrations/$FILE" "$CONTAINER:/tmp/apply.sql" >/dev/null
MSYS_NO_PATHCONV=1 docker exec "$CONTAINER" bash -lc \
  "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/apply.sql"
