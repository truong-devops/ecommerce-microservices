#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-notification-access-secret-min-32}"
CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
ADMIN_ID="${ADMIN_ID:-22222222-2222-4222-8222-222222222222}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

RESPONSE_STATUS=""
RESPONSE_BODY=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

print_step() {
  echo
  echo "==> $1"
}

wait_for_service() {
  local max_attempts="${1:-30}"
  local delay_seconds="${2:-2}"
  local attempt=1

  while (( attempt <= max_attempts )); do
    local status
    status="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)"
    if [[ "$status" == "200" ]]; then
      return 0
    fi

    echo "Waiting for service... attempt $attempt/$max_attempts (health status: ${status:-n/a})"
    sleep "$delay_seconds"
    ((attempt++))
  done

  echo "Service is not ready at $BASE_URL after $max_attempts attempts." >&2
  return 1
}

json_field() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" node - "$path" <<'NODE'
const path = process.argv[2].split('.').filter(Boolean);
const obj = JSON.parse(process.env.JSON_INPUT ?? '');

let cur = obj;
for (const key of path) {
  if (Array.isArray(cur) && /^\d+$/.test(key)) {
    const index = Number(key);
    if (index >= cur.length) {
      process.exit(1);
    }
    cur = cur[index];
    continue;
  }

  if (cur && typeof cur === 'object' && key in cur) {
    cur = cur[key];
    continue;
  }

  process.exit(1);
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

make_token() {
  local user_id="$1"
  local email="$2"
  local role="$3"

  node - "$JWT_SECRET" "$user_id" "$email" "$role" <<'NODE'
const crypto = require('crypto');

const [, , secret, userId, email, role] = process.argv;

const b64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64url(
  JSON.stringify({
    sub: userId,
    email,
    role,
    jti: `notification-test-jti-${Date.now()}`,
    iat: now,
    exp: now + 3600
  })
);

const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64');
const signatureB64Url = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
process.stdout.write(`${header}.${payload}.${signatureB64Url}`);
NODE
}

call_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local bearer="${4:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Accept: application/json")

  if [[ -n "$bearer" ]]; then
    cmd+=(-H "Authorization: Bearer $bearer")
  fi

  if [[ -n "$data" ]]; then
    cmd+=(-H "Content-Type: application/json" -d "$data")
  fi

  if ! RESPONSE_STATUS="$("${cmd[@]}")"; then
    rm -f "$tmp_file"
    echo "Request failed: $method $BASE_URL$path" >&2
    echo "Ensure notification-service is running and reachable." >&2
    exit 1
  fi

  RESPONSE_BODY="$(cat "$tmp_file")"
  rm -f "$tmp_file"
}

assert_status_in() {
  local expected="$1"
  for status in $expected; do
    if [[ "$RESPONSE_STATUS" == "$status" ]]; then
      return
    fi
  done

  echo "Expected status in [$expected], got $RESPONSE_STATUS" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
}

assert_success_true() {
  local success
  success="$(json_field "$RESPONSE_BODY" "success" || true)"
  if [[ "$success" != "True" && "$success" != "true" ]]; then
    echo "Expected success=true" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_error_code() {
  local expected_code="$1"
  local actual_code
  actual_code="$(json_field "$RESPONSE_BODY" "error.code" || true)"
  if [[ "$actual_code" != "$expected_code" ]]; then
    echo "Expected error.code=$expected_code, got $actual_code" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd node

CUSTOMER_TOKEN="$(make_token "$CUSTOMER_ID" "$CUSTOMER_EMAIL" "CUSTOMER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"

print_step "Wait for service readiness"
wait_for_service 30 2

print_step "Health checks"
call_api GET /health
assert_status_in "200"
assert_success_true

call_api GET /ready
assert_status_in "200"
assert_success_true

call_api GET /live
assert_status_in "200"
assert_success_true
echo "Health endpoints OK"

print_step "Unauthorized should fail"
call_api GET /notifications
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Validation should fail"
call_api POST /notifications '{"recipientIds":["not-a-uuid"],"content":""}' "$ADMIN_TOKEN"
assert_status_in "400"
assert_error_code "BAD_REQUEST"
echo "Validation failure OK"

print_step "Create manual notification"
call_api POST /notifications "{\"recipientIds\":[\"$CUSTOMER_ID\"],\"subject\":\"Promo\",\"content\":\"Campaign message\"}" "$ADMIN_TOKEN"
assert_status_in "200 201"
assert_success_true
NOTIFICATION_ID="$(json_field "$RESPONSE_BODY" "data.items.0.id")"
if [[ -z "$NOTIFICATION_ID" ]]; then
  echo "Missing notification id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Manual creation OK"

print_step "Conflict for duplicate recipients"
call_api POST /notifications "{\"recipientIds\":[\"$CUSTOMER_ID\",\"$CUSTOMER_ID\"],\"content\":\"Duplicate\"}" "$ADMIN_TOKEN"
assert_status_in "409"
assert_error_code "CONFLICT"
echo "Conflict handling OK"

print_step "Customer list own notifications"
call_api GET /notifications "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "List notifications OK"

print_step "Not found handling"
call_api GET "/notifications/00000000-0000-4000-8000-000000000000" "" "$ADMIN_TOKEN"
assert_status_in "404"
assert_error_code "NOTIFICATION_NOT_FOUND"
echo "Not found handling OK"

print_step "Mark notification as read"
call_api PATCH "/notifications/$NOTIFICATION_ID/read" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "Mark read OK"

echo
echo "All notification-service smoke tests passed"
