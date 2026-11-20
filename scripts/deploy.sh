#!/usr/bin/env bash
# ============================================================================
# BOS Playbook - Staging / Production Deployment Script
#
# Usage:
#   chmod +x ./scripts/deploy.sh
#   ./scripts/deploy.sh
# ============================================================================
set -e

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
      sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null || true
      sudo chmod 600 /swapfile 2>/dev/null || true
      sudo mkswap /swapfile 2>/dev/null || true
    fi
    sudo swapon /swapfile 2>/dev/null || true
  fi
fi

echo "=========================================="
echo " [1/5] Pulling latest code from GitHub..."
echo "=========================================="
git pull origin master || git pull origin main

echo "=========================================="
echo " [2/5] Cleaning stale build cache..."
echo "=========================================="
docker builder prune -f --filter "until=2h" 2>/dev/null || true

echo "=========================================="
echo " [3/5] Applying database migrations..."
echo "=========================================="
if [ -f "./scripts/migrate.sh" ]; then
  bash ./scripts/migrate.sh || true
fi

echo "=========================================="
echo " [4/5] Building frontend container..."
echo "=========================================="
DOCKER_BUILDKIT=1 COMPOSE_BAKE=false docker compose build frontend

echo "=========================================="
echo " [5/5] Starting all services..."
echo "=========================================="
docker compose up -d

echo ""
echo "=========================================="
echo " Checking container status:"
echo "=========================================="
docker compose ps

echo ""
echo ">>> Deployment successfully completed! <<<"
