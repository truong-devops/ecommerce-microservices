#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3010/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-analytics-access-secret-min-32}"
SELLER_ID="${SELLER_ID:-11111111-1111-4111-8111-111111111111}"
ADMIN_ID="${ADMIN_ID:-22222222-2222-4222-8222-222222222222}"
CUSTOMER_ID="${CUSTOMER_ID:-33333333-3333-4333-8333-333333333333}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"

RESPONSE_STATUS=""
RESPONSE_BODY=""
PYTHON_BIN=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

detect_python_bin() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi

  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi

  echo "Missing required command: python3 (or python)" >&2
  exit 1
}

print_step() {
  echo
  echo "==> $1"
}

json_field() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" "$PYTHON_BIN" - "$path" <<'PY'
import json
import os
import sys

path = [p for p in sys.argv[1].split('.') if p]
obj = json.loads(os.environ.get('JSON_INPUT', ''))
cur = obj
for key in path:
    if isinstance(cur, dict) and key in cur:
        cur = cur[key]
    else:
        sys.exit(1)

if cur is None:
    print('')
elif isinstance(cur, (dict, list)):
    print(json.dumps(cur))
else:
    print(cur)
PY
}

make_token() {
  local user_id="$1"
  local email="$2"
  local role="$3"

  "$PYTHON_BIN" - "$JWT_SECRET" "$user_id" "$email" "$role" <<'PY'
import base64
import hashlib
import hmac
import json
import sys
import time

secret, user_id, email, role = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode('utf-8'))
payload = b64(json.dumps({
    "sub": user_id,
    "email": email,
    "role": role,
    "iat": int(time.time()),
    "exp": int(time.time()) + 3600
}, separators=(',', ':')).encode('utf-8'))
signature = b64(hmac.new(secret.encode('utf-8'), f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest())
print(f"{header}.{payload}.{signature}")
PY
}

call_api() {
  local method="$1"
  local path="$2"
  local bearer="${3:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Accept: application/json")

  if [[ -n "$bearer" ]]; then
    cmd+=(-H "Authorization: Bearer $bearer")
  fi

  if ! RESPONSE_STATUS="$("${cmd[@]}")"; then
    rm -f "$tmp_file"
    echo "Request failed: $method $BASE_URL$path" >&2
    echo "Ensure analytics-service is running and reachable." >&2
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
PYTHON_BIN="$(detect_python_bin)"

SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"
CUSTOMER_TOKEN="$(make_token "$CUSTOMER_ID" "$CUSTOMER_EMAIL" "CUSTOMER")"

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
call_api GET /analytics/overview
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Forbidden role should fail"
call_api GET /analytics/overview "$CUSTOMER_TOKEN"
assert_status_in "403"
assert_error_code "FORBIDDEN"
echo "Role guard OK"

print_step "Validation failure should return 400"
call_api GET "/analytics/overview?sellerId=invalid-uuid" "$ADMIN_TOKEN"
assert_status_in "400"
assert_error_code "BAD_REQUEST"
echo "Validation handling OK"

print_step "Overview happy path"
call_api GET "/analytics/overview?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
echo "Overview API OK"

echo
echo "All analytics-service smoke tests passed"
