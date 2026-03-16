#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/user-service/docker-compose.dev.yml"
BASE_URL="${BASE_URL:-http://localhost:3100/api/v1}"
KEEP_UP="${KEEP_UP:-0}"
RUN_E2E="${RUN_E2E:-1}"

RESPONSE_STATUS=""
RESPONSE_BODY=""

print_step() {
  echo
  echo "==> $1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_get() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" node - "$path" <<'NODE'
const path = process.argv[2].split('.').filter(Boolean);
const raw = process.env.JSON_INPUT || '';
const obj = JSON.parse(raw);

let cur = obj;
for (const key of path) {
  if (cur && typeof cur === 'object' && key in cur) {
    cur = cur[key];
  } else {
    process.exit(1);
  }
}

if (cur === null || cur === undefined) {
  process.stdout.write('');
} else if (typeof cur === 'object') {
  process.stdout.write(JSON.stringify(cur));
} else {
  process.stdout.write(String(cur));
}
NODE
}

call_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Accept: application/json")
  if [[ -n "$data" ]]; then
    cmd+=(-H "Content-Type: application/json" -d "$data")
  fi

  if ! RESPONSE_STATUS="$("${cmd[@]}")"; then
    rm -f "$tmp_file"
    echo "Request failed: $method $BASE_URL$path" >&2
    exit 1
  fi

  RESPONSE_BODY="$(cat "$tmp_file")"
  rm -f "$tmp_file"
}

assert_status() {
  local expected="$1"
  if [[ "$RESPONSE_STATUS" != "$expected" ]]; then
    echo "Expected HTTP $expected, got $RESPONSE_STATUS" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_success_true() {
  local success
  success="$(json_get "$RESPONSE_BODY" "success" || true)"
  if [[ "$success" != "true" && "$success" != "True" ]]; then
    echo "Expected success=true" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_error_code() {
  local expected="$1"
  local actual
  actual="$(json_get "$RESPONSE_BODY" "error.code" || true)"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected error.code=$expected, got $actual" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

teardown() {
  if [[ "$KEEP_UP" == "1" ]]; then
    echo
    echo "Keeping Docker services up (KEEP_UP=1)."
    return
  fi

  echo
  echo "Stopping Docker services..."
  docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
}

trap teardown EXIT

require_cmd docker
require_cmd curl
require_cmd node

if command -v npm >/dev/null 2>&1; then
  NPM_BIN="npm"
elif command -v npm.cmd >/dev/null 2>&1; then
  NPM_BIN="npm.cmd"
else
  echo "Missing npm executable (npm or npm.cmd)." >&2
  exit 1
fi

print_step "Starting user-service + PostgreSQL with Docker Compose"
docker compose -f "$COMPOSE_FILE" up --build -d user-service-db user-service
docker compose -f "$COMPOSE_FILE" ps

print_step "Waiting for user-service health endpoint"
for i in $(seq 1 60); do
  status="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)"
  if [[ "$status" == "200" ]]; then
    echo "Health check OK"
    break
  fi

  if [[ "$i" -eq 60 ]]; then
    echo "Health check timeout. Last status=$status" >&2
    docker compose -f "$COMPOSE_FILE" logs user-service --tail=200 >&2 || true
    docker compose -f "$COMPOSE_FILE" logs user-service-db --tail=200 >&2 || true
    exit 1
  fi
  sleep 2
done

TIMESTAMP="$(date +%s)"
EMAIL="docker.user.${TIMESTAMP}@example.com"

print_step "GET /health"
call_api GET /health
assert_status 200
assert_success_true
echo "Health endpoint OK"

print_step "POST /users (create user)"
CREATE_PAYLOAD="{\"email\":\"$EMAIL\",\"firstName\":\"Docker\",\"lastName\":\"User\",\"phone\":\"+84901234567\",\"role\":\"buyer\"}"
call_api POST /users "$CREATE_PAYLOAD"
assert_status 201
assert_success_true
USER_ID="$(json_get "$RESPONSE_BODY" "data.id")"
if [[ -z "$USER_ID" ]]; then
  echo "Create user returned empty id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Created user id=$USER_ID"

print_step "POST /users duplicate email -> 409"
call_api POST /users "$CREATE_PAYLOAD"
assert_status 409
assert_error_code USER_EMAIL_EXISTS
echo "Duplicate email validation OK"

print_step "POST /users invalid payload -> 400"
call_api POST /users '{"email":"invalid-email","firstName":"","lastName":"User"}'
assert_status 400
assert_error_code USER_SERVICE_VALIDATION_ERROR
echo "Payload validation OK"

print_step "GET /users (pagination + search)"
call_api GET "/users?page=1&pageSize=10&search=${EMAIL}"
assert_status 200
assert_success_true
TOTAL_ITEMS="$(json_get "$RESPONSE_BODY" "meta.pagination.totalItems" || true)"
if [[ -z "$TOTAL_ITEMS" || "$TOTAL_ITEMS" == "0" ]]; then
  echo "Expected at least 1 item in list query" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "List endpoint OK"

print_step "GET /users/:id"
call_api GET "/users/$USER_ID"
assert_status 200
assert_success_true
echo "Get by id OK"

print_step "PATCH /users/:id"
call_api PATCH "/users/$USER_ID" '{"firstName":"Updated","lastName":"User"}'
assert_status 200
assert_success_true
UPDATED_FIRST_NAME="$(json_get "$RESPONSE_BODY" "data.firstName" || true)"
if [[ "$UPDATED_FIRST_NAME" != "Updated" ]]; then
  echo "Expected firstName=Updated, got $UPDATED_FIRST_NAME" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Update user OK"

print_step "PATCH /users/:id/status"
call_api PATCH "/users/$USER_ID/status" '{"status":"active"}'
assert_status 200
assert_success_true
UPDATED_STATUS="$(json_get "$RESPONSE_BODY" "data.status" || true)"
if [[ "$UPDATED_STATUS" != "active" ]]; then
  echo "Expected status=active, got $UPDATED_STATUS" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Update status OK"

print_step "DELETE /users/:id (soft delete)"
call_api DELETE "/users/$USER_ID"
assert_status 200
assert_success_true
DELETED_STATUS="$(json_get "$RESPONSE_BODY" "data.status" || true)"
if [[ "$DELETED_STATUS" != "deleted" ]]; then
  echo "Expected status=deleted after remove, got $DELETED_STATUS" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Soft delete OK"

print_step "GET /users/:id after delete -> 404"
call_api GET "/users/$USER_ID"
assert_status 404
assert_error_code USER_NOT_FOUND
echo "Not-found after soft delete OK"

if [[ "$RUN_E2E" == "1" ]]; then
  print_step "Running user-service e2e suite"
  cd "$REPO_ROOT"
  "$NPM_BIN" run test:e2e --workspace services/user-service
fi

echo
echo "All user-service Docker smoke tests passed."
