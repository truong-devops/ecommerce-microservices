#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/inventory-service-nest/docker-compose.compare.yml"
BASE_TEST_SCRIPT="$REPO_ROOT/scripts/test-inventory-service.sh"

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
  echo "==> Starting inventory compare stack"
  JWT_SECRET="$JWT_SECRET" docker compose -f "$COMPOSE_FILE" up -d --build
fi

echo "==> Test legacy inventory-service on :3027"
wait_for_health "http://localhost:3027/api/v1" "legacy inventory-service"
BASE_URL="http://localhost:3027/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "==> Test go inventory-service on :3037"
wait_for_health "http://localhost:3037/api/v1" "go inventory-service"
BASE_URL="http://localhost:3037/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "Both legacy and go inventory smoke tests passed"
