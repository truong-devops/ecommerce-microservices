#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_TEST_SCRIPT="$REPO_ROOT/scripts/test-notification-service.sh"

JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"

echo "==> Test legacy notification-service on :3029"
BASE_URL="http://localhost:3029/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "==> Test go notification-service on :3039"
BASE_URL="http://localhost:3039/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "Both legacy and go notification smoke tests passed"
