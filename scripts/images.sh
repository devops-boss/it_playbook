#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Fetch, save and load the container images.
#
# The stack is built from pinned images, so it can be installed on a
# machine that has no route to the internet. The usual way to do that is
# to fetch the images on a machine that does have one, save them to a
# file, carry the file across, and load them there.
#
#   ./scripts/images.sh pull     fetch every image into the local cache
#   ./scripts/images.sh save     write the images to a single tar file
#   ./scripts/images.sh load     load the images from that tar file
#   ./scripts/images.sh list     show the images and whether they are here
#
# The frontend image is built from source, so it is built here rather
# than fetched. Run "make build" before "save".
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE_DIR="${IMAGE_DIR:-./images}"
FRONTEND_VERSION="${FRONTEND_VERSION:-latest}"

# The images the stack is made of, in the order they are started. Keep
# this list in step with docker-compose.yml.
IMAGES=(
  "supabase/postgres:15.19.0.006"
  "supabase/gotrue:v2.197.0"
  "postgrest/postgrest:v14.18"
  "supabase/realtime:v2.143.3"
  "supabase/storage-api:v1.81.0"
  "darthsim/imgproxy:v3.31.4"
  "supabase/postgres-meta:v0.100.0"
  "supabase/studio:2026.10.12-sha-3699278"
  "kong:3.6.1"
  "nginx:1.27-alpine"
  "bos-playbook-frontend:${FRONTEND_VERSION}"
)

cmd="${1:-list}"

case "$cmd" in
  pull)
    echo "=== fetching the images ==="
    for image in "${IMAGES[@]}"; do
      if MSYS_NO_PATHCONV=1 docker image inspect "$image" >/dev/null 2>&1; then
        echo "  - $image (already here)"
        continue
      fi
      echo "  + $image"
      MSYS_NO_PATHCONV=1 docker pull "$image"
    done
    echo
    echo "All the images are in the local cache."
    ;;

  save)
    mkdir -p "$IMAGE_DIR"
    TAR="$IMAGE_DIR/bos-playbook-images-$(date -u '+%Y%m%d').tar"
    echo "=== saving the images to $TAR ==="
    echo "   this may take a while, and needs several gigabytes of space"
    MSYS_NO_PATHCONV=1 docker save -o "$TAR" "${IMAGES[@]}"
    echo
    echo "Wrote $TAR"
    ls -lh "$TAR"
    echo
    echo "Carry that file to the server and run: ./scripts/images.sh load"
    ;;

  load)
    TAR="${2:-$(ls -1t "$IMAGE_DIR"/bos-playbook-images-*.tar 2>/dev/null | head -1)}"
    if [[ -z "$TAR" || ! -f "$TAR" ]]; then
      echo "ERROR: no image archive found. Give the path to one:" >&2
      echo "       ./scripts/images.sh load path/to/images.tar" >&2
      exit 1
    fi
    echo "=== loading $TAR ==="
    MSYS_NO_PATHCONV=1 docker load -i "$TAR"
    echo
    echo "The images are loaded. Start the stack with: make up"
    ;;

  list)
    echo "=== the images the stack is made of ==="
    for image in "${IMAGES[@]}"; do
      if MSYS_NO_PATHCONV=1 docker image inspect "$image" >/dev/null 2>&1; then
        size=$(MSYS_NO_PATHCONV=1 docker image inspect -f '{{.Size}}' "$image")
        printf '  %-45s %8.1f MB  here\n' "$image" "$(echo "$size" | awk '{print $1/1048576}')"
      else
        printf '  %-45s %8s  missing\n' "$image" "-"
      fi
    done
    ;;

  *)
    sed -n '2,22p' "$0"
    exit 1
    ;;
esac
