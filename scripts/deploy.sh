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
  sudo -u "$SUDO_USER" git pull origin master || sudo -u "$SUDO_USER" git pull origin main || true
else
  git pull origin master || git pull origin main || true
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
echo " [5/5] Starting all services..."
echo "=========================================="
docker compose up -d
docker compose restart nginx

echo ""
echo "=========================================="
echo " Checking container status:"
echo "=========================================="
docker compose ps

echo ""
echo ">>> Deployment successfully completed! <<<"
