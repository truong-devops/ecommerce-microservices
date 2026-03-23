#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3002/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-order-access-secret-min-32-chars}"
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

json_field() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" python3 - "$path" <<'PY'
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

  python3 - "$JWT_SECRET" "$user_id" "$email" "$role" <<'PY'
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
    "jti": "test-jti-" + str(int(time.time() * 1000)),
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
  local data="${3:-}"
  local bearer="${4:-}"
  local idempotency_key="${5:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Accept: application/json")

  if [[ -n "$bearer" ]]; then
    cmd+=(-H "Authorization: Bearer $bearer")
  fi

  if [[ -n "$idempotency_key" ]]; then
    cmd+=(-H "Idempotency-Key: $idempotency_key")
  fi

  if [[ -n "$data" ]]; then
    cmd+=(-H "Content-Type: application/json" -d "$data")
  fi

  if ! RESPONSE_STATUS="$("${cmd[@]}")"; then
    rm -f "$tmp_file"
    echo "Request failed: $method $BASE_URL$path" >&2
    echo "Ensure order-service is running and reachable." >&2
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
require_cmd python3

CUSTOMER_TOKEN="$(make_token "$CUSTOMER_ID" "$CUSTOMER_EMAIL" "CUSTOMER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"

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
call_api GET /orders
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Create order"
IDEMPOTENCY_KEY="order-test-$(date +%s)-$$"
CREATE_PAYLOAD='{"currency":"USD","shippingAmount":5.5,"discountAmount":1.0,"note":"first order","items":[{"productId":"product-seed-333333333333333333333333","sku":"SKU-001","productName":"Laptop Stand","quantity":2,"unitPrice":10.25}]}'
call_api POST /orders "$CREATE_PAYLOAD" "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "200 201"
assert_success_true
ORDER_ID="$(json_field "$RESPONSE_BODY" "data.id")"
ORDER_NUMBER="$(json_field "$RESPONSE_BODY" "data.orderNumber")"
if [[ -z "$ORDER_ID" ]]; then
  echo "Missing order id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Order created: $ORDER_NUMBER"

print_step "Idempotency replay"
call_api POST /orders "$CREATE_PAYLOAD" "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "200 201"
assert_success_true
ORDER_ID_REPLAY="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ "$ORDER_ID_REPLAY" != "$ORDER_ID" ]]; then
  echo "Replay must return same order id" >&2
  exit 1
fi
echo "Idempotency replay OK"

print_step "Idempotency payload mismatch"
call_api POST /orders '{"currency":"USD","items":[{"productId":"product-seed-444444444444444444444444","sku":"SKU-002","productName":"Mouse","quantity":1,"unitPrice":20}]}' "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "409"
assert_error_code "IDEMPOTENCY_CONFLICT"
echo "Idempotency mismatch OK"

print_step "List my orders"
call_api GET /orders "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "List orders OK"

print_step "Get order detail"
call_api GET "/orders/$ORDER_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "Get order OK"

print_step "Progress status by admin"
call_api PATCH "/orders/$ORDER_ID/status" '{"status":"CONFIRMED"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

call_api PATCH "/orders/$ORDER_ID/status" '{"status":"PROCESSING"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

call_api PATCH "/orders/$ORDER_ID/status" '{"status":"SHIPPED"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true
echo "Status update OK"

print_step "Customer confirm received"
call_api PATCH "/orders/$ORDER_ID/confirm-received" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
STATUS="$(json_field "$RESPONSE_BODY" "data.status")"
if [[ "$STATUS" != "DELIVERED" ]]; then
  echo "Expected DELIVERED status, got $STATUS" >&2
  exit 1
fi
echo "Confirm received OK"

print_step "Invalid transition should fail"
call_api PATCH "/orders/$ORDER_ID/cancel" '{}' "$CUSTOMER_TOKEN"
assert_status_in "422"
assert_error_code "INVALID_ORDER_STATUS_TRANSITION"
echo "Invalid transition guard OK"

print_step "Order history"
call_api GET "/orders/$ORDER_ID/history" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "History endpoint OK"

echo
echo "All order-service smoke tests passed."
