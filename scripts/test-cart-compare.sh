#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/cart-service-nest/docker-compose.compare.yml"
BASE_TEST_SCRIPT="$REPO_ROOT/scripts/test-cart-service-api.sh"

JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
AUTO_UP="${AUTO_UP:-1}"

wait_for_health() {
  local base_url="$1"
  local label="$2"
  local timeout_sec="${3:-90}"
  local start_epoch
  start_epoch="$(date +%s)"
  while true; do
    if curl -fsS "$base_url/health" >/dev/null 2>&1; then
      return 0
    fi
    if (( "$(date +%s)" - start_epoch >= timeout_sec )); then
      echo "$label is not healthy within ${timeout_sec}s: $base_url/health" >&2
      return 1
    fi
    sleep 1
  done
}

if [[ "$AUTO_UP" == "1" ]]; then
  echo "==> Starting cart compare stack"
  JWT_SECRET="$JWT_SECRET" docker compose -f "$COMPOSE_FILE" up -d --build
fi

echo "==> Test legacy cart-service on :3024"
wait_for_health "http://localhost:3024/api/v1" "legacy cart-service"
BASE_URL="http://localhost:3024/api/v1" LEGACY_BASE_URL="http://localhost:3024/api" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "==> Test go cart-service on :3034"
wait_for_health "http://localhost:3034/api/v1" "go cart-service"
BASE_URL="http://localhost:3034/api/v1" LEGACY_BASE_URL="http://localhost:3034/api" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "Both legacy and go cart smoke tests passed"
