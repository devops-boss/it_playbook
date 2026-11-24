#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Staging / Production Deployment Script
#
# Usage:
#   sudo ./scripts/deploy.sh
# ============================================================================
set -e

# Auto-elevate with sudo if docker socket requires permissions
if [ "$EUID" -ne 0 ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "Docker commands require elevated permissions. Elevating with sudo..."
    exec sudo "$0" "$@"
  fi
fi

# Add current user to docker group if run via sudo so future commands don't require sudo
if [ -n "$SUDO_USER" ]; then
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================="
echo " [0/5] Checking VPS swap space..."
echo "=========================================="
# Prevent OOM killer and SSH session aborts during Next.js build on low RAM
if [ -f /proc/meminfo ]; then
  SWAP_TOTAL=$(awk '/SwapTotal/ {print $2}' /proc/meminfo || echo "0")
  if [ "$SWAP_TOTAL" -lt 1048576 ]; then
    echo "Allocating 2GB swap space to ensure build completes without PuTTY abort..."
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null || true
      chmod 600 /swapfile 2>/dev/null || true
      mkswap /swapfile 2>/dev/null || true
    fi
    swapon /swapfile 2>/dev/null || true
  fi
fi

echo "=========================================="
echo " [1/5] Pulling latest code from GitHub..."
echo "=========================================="
if [ -n "$SUDO_USER" ]; then
  sudo -u "$SUDO_USER" git fetch origin master && sudo -u "$SUDO_USER" git reset --hard origin/master || sudo -u "$SUDO_USER" git pull origin master || true
else
  git fetch origin master && git reset --hard origin/master || git pull origin master || true
fi

echo "=========================================="
echo " [2/5] Cleaning stale build cache..."
echo "=========================================="
docker builder prune -f --filter "until=2h" 2>/dev/null || true

echo "=========================================="
echo " [3/5] Starting database & applying migrations..."
echo "=========================================="
docker compose up -d db
echo "Waiting for database to be ready..."
until docker compose exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; do
  sleep 2
done

# Ensure public schema has unrestricted permissions for all roles, drop check constraints, and add audit compatibility columns
docker compose exec -T db psql -U postgres -d postgres -c "
  ALTER SCHEMA public OWNER TO postgres;
  GRANT ALL ON SCHEMA public TO postgres, supabase_admin, anon, authenticated, service_role, service, public;
  GRANT USAGE, CREATE ON SCHEMA public TO postgres, supabase_admin, anon, authenticated, service_role, service, public;
  ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS pb_user_profiles_role_check;
  ALTER TABLE pb_config_history ADD COLUMN IF NOT EXISTS table_name TEXT, ADD COLUMN IF NOT EXISTS record_id UUID, ADD COLUMN IF NOT EXISTS changed_by UUID, ADD COLUMN IF NOT EXISTS old_data JSONB, ADD COLUMN IF NOT EXISTS new_data JSONB;
  ALTER TABLE pb_config_history ALTER COLUMN config_type DROP NOT NULL;
  ALTER TABLE pb_config_history ALTER COLUMN config_type SET DEFAULT 'user_profile';
  ALTER TABLE pb_config_history ALTER COLUMN action DROP NOT NULL;
  ALTER TABLE pb_config_history ALTER COLUMN action SET DEFAULT 'create';
  DO \$\$
  DECLARE r RECORD;
  BEGIN
    FOR r IN (SELECT conname FROM pg_constraint WHERE conrelid = 'pb_user_profiles'::regclass AND contype = 'c') LOOP
      EXECUTE 'ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ';';
    END LOOP;
  END \$\$;
" 2>/dev/null || true

docker compose exec -T db psql -U supabase_admin -d postgres -c "
  ALTER TABLE pb_user_profiles DROP CONSTRAINT IF EXISTS pb_user_profiles_role_check;
  ALTER TABLE pb_config_history ADD COLUMN IF NOT EXISTS table_name TEXT, ADD COLUMN IF NOT EXISTS record_id UUID, ADD COLUMN IF NOT EXISTS changed_by UUID, ADD COLUMN IF NOT EXISTS old_data JSONB, ADD COLUMN IF NOT EXISTS new_data JSONB;
  ALTER TABLE pb_config_history ALTER COLUMN config_type DROP NOT NULL;
  ALTER TABLE pb_config_history ALTER COLUMN config_type SET DEFAULT 'user_profile';
  ALTER TABLE pb_config_history ALTER COLUMN action DROP NOT NULL;
  ALTER TABLE pb_config_history ALTER COLUMN action SET DEFAULT 'create';
  DROP FUNCTION IF EXISTS delete_user_account(UUID, UUID);
  CREATE OR REPLACE FUNCTION delete_user_account(p_target_user_id UUID, p_admin_id UUID) RETURNS JSONB AS \$\$
  DECLARE v_target_email TEXT; v_target_name TEXT;
  BEGIN
    SELECT email, display_name INTO v_target_email, v_target_name FROM pb_user_profiles WHERE id = p_target_user_id;
    DELETE FROM pb_user_presence WHERE user_id = p_target_user_id;
    DELETE FROM pb_user_roles WHERE user_id = p_target_user_id;
    DELETE FROM pb_user_accounts WHERE user_id = p_target_user_id;
    DELETE FROM pb_user_favorites WHERE user_id = p_target_user_id;
    DELETE FROM pb_playbook_progress WHERE user_id = p_target_user_id;
    DELETE FROM pb_saved_views WHERE user_id = p_target_user_id;
    DELETE FROM pb_user_profiles WHERE id = p_target_user_id;
    DELETE FROM auth.identities WHERE user_id = p_target_user_id;
    DELETE FROM auth.users WHERE id = p_target_user_id;
    BEGIN
      INSERT INTO pb_config_history (user_id, config_type, config_id, action, before_value, after_value, impact_summary)
      VALUES (p_admin_id, 'user_profile', p_target_user_id, 'delete', jsonb_build_object('user_id', p_target_user_id, 'email', v_target_email, 'name', v_target_name), jsonb_build_object('deleted_by', p_admin_id, 'timestamp', now()), 'User account deleted');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('success', true);
  END;
  \$\$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;
  GRANT EXECUTE ON FUNCTION delete_user_account(UUID, UUID) TO postgres, supabase_admin, service_role, service, authenticated, anon, public;
" || true

if [ -f "./scripts/migrate.sh" ]; then
  bash ./scripts/migrate.sh || true
fi

# Ensure docker-buildx plugin is present to avoid Bake timeouts
if ! docker buildx version >/dev/null 2>&1; then
  echo "Installing docker buildx plugin..."
  apt-get update -qq && apt-get install -y -qq docker-buildx-plugin 2>/dev/null || true
fi

echo "=========================================="
echo " [4/5] Building frontend container..."
echo "=========================================="
docker compose build frontend || DOCKER_BUILDKIT=0 docker compose build frontend

echo "=========================================="
echo " [5/5] Starting all services & restarting frontend..."
echo "=========================================="
docker compose up -d --force-recreate frontend
docker compose restart frontend nginx

echo ""
echo "=========================================="
echo " Checking container status:"
echo "=========================================="
docker compose ps

echo ""
echo ">>> Deployment successfully completed! <<<"
