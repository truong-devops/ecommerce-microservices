#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_TEST_SCRIPT="$REPO_ROOT/scripts/test-analytics-service.sh"

JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"

echo "==> Test legacy analytics-service on :3018"
BASE_URL="http://localhost:3018/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "==> Test go analytics-service on :3019"
BASE_URL="http://localhost:3019/api/v1" JWT_SECRET="$JWT_SECRET" bash "$BASE_TEST_SCRIPT"

echo
echo "Both legacy and go analytics smoke tests passed"
