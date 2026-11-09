#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Load the demo data
#
#   ./scripts/seed.sh
#
# Applies the demo content seed, which creates the four demo users (one
# per role) along with the accounts, scenarios, flowcharts, tickets and
# playbooks. The demo content is deliberately NOT part of the migration
# chain, so a production install never loads it by accident.
#
# The four demo users are:
#   admin@bosp.local     Super Admin
#   editor@bosp.local    IT Ops Editor
#   reviewer@bosp.local  Reviewer
#   agent@bosp.local     IT Agent
#
# They share one password, which the operator supplies through the
# DEMO_USER_PASSWORD environment variable (or a matching line in .env). The
# script never stores, echoes or hard-codes it.
#
# These accounts exist only to demonstrate the role model. Delete them before
# the system goes live.
#
# The script is safe to re-run: every insert in the migration is idempotent.
# Re-running resets the demo password to whatever was supplied.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_CONTAINER="${DB_CONTAINER:-bos-db}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-postgres}"
CONTENT_SEED="backend/seed/demo_content.sql"

if [[ -z "${DEMO_USER_PASSWORD:-}" ]]; then
  echo "ERROR: DEMO_USER_PASSWORD is not set." >&2
  echo "Set it in .env or in the environment before seeding." >&2
  echo "It is the password the four demo users will share." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  echo "ERROR: container '$DB_CONTAINER' is not running." >&2
  echo "Start it with: docker compose up -d db" >&2
  exit 1
fi

if [[ ! -f "$CONTENT_SEED" ]]; then
  echo "ERROR: $CONTENT_SEED not found." >&2
  exit 1
fi

echo "=== BOS Playbook seed ==="
echo "-- applying the demo content"

# The password is handed to the seed through a session setting, so it
# never appears in the SQL file itself.
if ! {
      printf "SET bosp.demo_password = %s;\n" "$(printf %s "$DEMO_USER_PASSWORD" | sed "s/'/''/g" | sed "s/^/'/; s/\$/'/")"
      cat "$CONTENT_SEED"
    } | docker exec -i "$DB_CONTAINER" psql \
      -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q; then
  echo "ERROR: the demo content seed failed." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
SUMMARY=$(docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tA -F'|' -c "
  SELECT
    (SELECT count(*) FROM pb_accounts),
    (SELECT count(*) FROM pb_scenarios),
    (SELECT count(*) FROM pb_flowcharts),
    (SELECT count(*) FROM pb_sample_tickets),
    (SELECT count(*) FROM pb_playbooks),
    (SELECT count(*) FROM pb_user_profiles);
")

IFS='|' read -r ACCOUNTS SCENARIOS FLOWCHARTS TICKETS PLAYBOOKS USERS <<<"$SUMMARY"

echo
echo "=== seed complete ==="
echo "  Accounts:    $ACCOUNTS"
echo "  Scenarios:   $SCENARIOS"
echo "  Flowcharts:  $FLOWCHARTS"
echo "  Tickets:     $TICKETS"
echo "  Playbooks:   $PLAYBOOKS"
echo "  Users:       $USERS"
echo
echo "Demo sign-in (all four share DEMO_USER_PASSWORD):"
echo "  admin@bosp.local     Super Admin"
echo "  editor@bosp.local    IT Ops Editor"
echo "  reviewer@bosp.local  Reviewer"
echo "  agent@bosp.local     IT Agent"
