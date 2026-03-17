#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3007/api/v1}"
LEGACY_BASE_URL="${LEGACY_BASE_URL:-${BASE_URL%/v1}}"
JWT_SECRET="${JWT_SECRET:-change-me-inventory-access-secret-min-32}"
SELLER_ID="${SELLER_ID:-11111111-1111-4111-8111-111111111111}"
ADMIN_ID="${ADMIN_ID:-22222222-2222-4222-8222-222222222222}"
WAREHOUSE_ID="${WAREHOUSE_ID:-33333333-3333-4333-8333-333333333333}"
BUYER_ID="${BUYER_ID:-44444444-4444-4444-8444-444444444444}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
WAREHOUSE_EMAIL="${WAREHOUSE_EMAIL:-warehouse@example.com}"
BUYER_EMAIL="${BUYER_EMAIL:-buyer@example.com}"

RESPONSE_STATUS=""
RESPONSE_BODY=""
PYTHON_CMD=()

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

detect_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD=(python3)
    return
  fi

  if command -v python >/dev/null 2>&1; then
    PYTHON_CMD=(python)
    return
  fi

  if command -v py >/dev/null 2>&1; then
    PYTHON_CMD=(py -3)
    return
  fi

  echo "Missing required command: python3, python, or py" >&2
  exit 1
}

json_field() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" "${PYTHON_CMD[@]}" - "$path" <<'PY'
import json
import os
import sys

path = [p for p in sys.argv[1].split('.') if p]
obj = json.loads(os.environ.get('JSON_INPUT', ''))
cur = obj
for key in path:
    if isinstance(cur, dict) and key in cur:
        cur = cur[key]
    elif isinstance(cur, list) and key.isdigit():
        index = int(key)
        if 0 <= index < len(cur):
            cur = cur[index]
        else:
            sys.exit(1)
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

  "${PYTHON_CMD[@]}" - "$JWT_SECRET" "$user_id" "$email" "$role" <<'PY'
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
    "jti": "inventory-test-jti-" + str(int(time.time() * 1000)),
    "iat": int(time.time()),
    "exp": int(time.time()) + 3600
}, separators=(',', ':')).encode('utf-8'))
signature = b64(hmac.new(secret.encode('utf-8'), f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest())
print(f"{header}.{payload}.{signature}")
PY
}

generate_uuid() {
  "${PYTHON_CMD[@]}" - <<'PY'
import uuid
print(uuid.uuid4())
PY
}

call_api_url() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local bearer="${4:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$url" -H "Accept: application/json")

  if [[ -n "$bearer" ]]; then
    cmd+=(-H "Authorization: Bearer $bearer")
  fi

  if [[ -n "$data" ]]; then
    cmd+=(-H "Content-Type: application/json" -d "$data")
  fi

  if ! RESPONSE_STATUS="$("${cmd[@]}")"; then
    rm -f "$tmp_file"
    echo "Request failed: $method $url" >&2
    echo "Ensure inventory-service is running and reachable." >&2
    exit 1
  fi

  RESPONSE_BODY="$(cat "$tmp_file")"
  rm -f "$tmp_file"
}

call_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local bearer="${4:-}"
  call_api_url "$method" "$BASE_URL$path" "$data" "$bearer"
}

call_legacy_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local bearer="${4:-}"
  call_api_url "$method" "$LEGACY_BASE_URL$path" "$data" "$bearer"
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

assert_success_false() {
  local success
  success="$(json_field "$RESPONSE_BODY" "success" || true)"
  if [[ "$success" != "False" && "$success" != "false" ]]; then
    echo "Expected success=false" >&2
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

assert_json_field_equals() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(json_field "$RESPONSE_BODY" "$path" || true)"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $path=$expected, got $actual" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_bool_field_true() {
  local path="$1"
  local actual
  actual="$(json_field "$RESPONSE_BODY" "$path" || true)"
  if [[ "$actual" != "True" && "$actual" != "true" ]]; then
    echo "Expected $path=true, got $actual" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_bool_field_false() {
  local path="$1"
  local actual
  actual="$(json_field "$RESPONSE_BODY" "$path" || true)"
  if [[ "$actual" != "False" && "$actual" != "false" ]]; then
    echo "Expected $path=false, got $actual" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_not_empty_field() {
  local path="$1"
  local actual
  actual="$(json_field "$RESPONSE_BODY" "$path" || true)"
  if [[ -z "$actual" ]]; then
    echo "Expected non-empty field at $path" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

require_cmd curl
detect_python

SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"
WAREHOUSE_TOKEN="$(make_token "$WAREHOUSE_ID" "$WAREHOUSE_EMAIL" "WAREHOUSE")"
BUYER_TOKEN="$(make_token "$BUYER_ID" "$BUYER_EMAIL" "BUYER")"

RUN_SUFFIX="${RUN_SUFFIX:-$(date +%s)-$$}"
SKU="${SKU:-SKU-$RUN_SUFFIX}"
SKU_RELEASE="${SKU_RELEASE:-SKU-REL-$RUN_SUFFIX}"
ORDER_CONFIRM_ID="${ORDER_CONFIRM_ID:-$(generate_uuid)}"
ORDER_RELEASE_ID="${ORDER_RELEASE_ID:-$(generate_uuid)}"

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

print_step "Public validation endpoints"
call_api GET "/inventory/validate?sku=SKU-NOT-FOUND-$RUN_SUFFIX&quantity=2"
assert_status_in "200"
assert_success_true
assert_bool_field_false "data.isAvailable"
assert_json_field_equals "data.availableQuantity" "0"

call_legacy_api GET "/inventory/validate?sku=SKU-NOT-FOUND-$RUN_SUFFIX&quantity=2"
assert_status_in "200"
assert_success_true
assert_bool_field_false "data.isAvailable"

print_step "Validation failure should return 400"
call_api GET "/inventory/validate?sku=&quantity=0"
assert_status_in "400"
assert_success_false
assert_error_code "BAD_REQUEST"

print_step "Unauthorized should fail"
call_api PATCH "/inventory/stocks/$SKU/adjust" '{"deltaOnHand":10}'
assert_status_in "401"
assert_success_false
assert_error_code "UNAUTHORIZED"

print_step "Forbidden role should fail"
call_api PATCH "/inventory/stocks/$SKU/adjust" '{"deltaOnHand":10}' "$BUYER_TOKEN"
assert_status_in "403"
assert_success_false
assert_error_code "FORBIDDEN"

print_step "Create stock for confirm flow"
call_api PATCH "/inventory/stocks/$SKU/adjust" "{\"productId\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"sellerId\":\"$SELLER_ID\",\"deltaOnHand\":20,\"reason\":\"Initial stock\"}" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.sku" "$SKU"
assert_json_field_equals "data.onHand" "20"
assert_json_field_equals "data.reserved" "0"
assert_json_field_equals "data.available" "20"
assert_not_empty_field "data.id"
assert_not_empty_field "data.createdAt"
assert_not_empty_field "data.updatedAt"
CURRENT_VERSION="$(json_field "$RESPONSE_BODY" "data.version")"

print_step "Invalid adjustment should fail for missing identifiers on new SKU"
call_api PATCH "/inventory/stocks/INVALID-$RUN_SUFFIX/adjust" '{"deltaOnHand":5}' "$SELLER_TOKEN"
assert_status_in "422"
assert_success_false
assert_error_code "INVENTORY_INVALID_ADJUSTMENT"

print_step "Negative adjustment should fail when available would become negative"
call_api PATCH "/inventory/stocks/$SKU/adjust" '{"deltaOnHand":-999,"reason":"Should fail"}' "$SELLER_TOKEN"
assert_status_in "422"
assert_success_false
assert_error_code "INVENTORY_NEGATIVE_STOCK"

print_step "Stale version should conflict"
call_api PATCH "/inventory/stocks/$SKU/adjust" "{\"deltaOnHand\":1,\"expectedVersion\":$((CURRENT_VERSION - 1)),\"reason\":\"Stale version\"}" "$SELLER_TOKEN"
assert_status_in "409"
assert_success_false
assert_error_code "CONFLICT"

print_step "Get stock snapshot"
call_api GET "/inventory/stocks/$SKU" "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.onHand" "20"
assert_json_field_equals "data.available" "20"

print_step "Validate available stock"
call_api GET "/inventory/validate?sku=$SKU&quantity=5"
assert_status_in "200"
assert_success_true
assert_bool_field_true "data.isAvailable"
assert_json_field_equals "data.availableQuantity" "20"

print_step "Insufficient stock should return 422"
call_api POST /inventory/reservations "{\"orderId\":\"$ORDER_CONFIRM_ID\",\"items\":[{\"sku\":\"$SKU\",\"quantity\":99}]}" "$ADMIN_TOKEN"
assert_status_in "422"
assert_success_false
assert_error_code "INVENTORY_INSUFFICIENT_STOCK"

print_step "Reserve inventory for confirm flow"
call_api POST /inventory/reservations "{\"orderId\":\"$ORDER_CONFIRM_ID\",\"items\":[{\"sku\":\"$SKU\",\"quantity\":5}]}" "$ADMIN_TOKEN"
assert_status_in "200 201"
assert_success_true
assert_json_field_equals "data.orderId" "$ORDER_CONFIRM_ID"
assert_json_field_equals "data.status" "ACTIVE"
assert_bool_field_false "data.idempotent"
assert_json_field_equals "data.items.0.sku" "$SKU"
assert_json_field_equals "data.items.0.quantity" "5"
assert_not_empty_field "data.expiresAt"

print_step "Reservation replay should be idempotent"
call_api POST /inventory/reservations "{\"orderId\":\"$ORDER_CONFIRM_ID\",\"items\":[{\"sku\":\"$SKU\",\"quantity\":5}]}" "$ADMIN_TOKEN"
assert_status_in "200 201"
assert_success_true
assert_bool_field_true "data.idempotent"
assert_json_field_equals "data.status" "ACTIVE"

print_step "Reservation payload mismatch should conflict"
call_api POST /inventory/reservations "{\"orderId\":\"$ORDER_CONFIRM_ID\",\"items\":[{\"sku\":\"$SKU\",\"quantity\":2}]}" "$ADMIN_TOKEN"
assert_status_in "409"
assert_success_false
assert_error_code "INVENTORY_RESERVATION_CONFLICT"

print_step "Confirm reservation"
call_api POST "/inventory/reservations/$ORDER_CONFIRM_ID/confirm" '{"reason":"Pack and deduct stock"}' "$WAREHOUSE_TOKEN"
assert_status_in "200 201"
assert_success_true
assert_json_field_equals "data.status" "CONFIRMED"
assert_json_field_equals "data.items.0.sku" "$SKU"
assert_json_field_equals "data.items.0.quantity" "5"

print_step "Stock snapshot after confirm"
call_api GET "/inventory/stocks/$SKU" "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.onHand" "15"
assert_json_field_equals "data.reserved" "0"
assert_json_field_equals "data.available" "15"

print_step "Release after confirm should return not found"
call_api POST "/inventory/reservations/$ORDER_CONFIRM_ID/release" '{}' "$ADMIN_TOKEN"
assert_status_in "404"
assert_success_false
assert_error_code "INVENTORY_RESERVATION_NOT_FOUND"

print_step "Create stock for release flow"
call_api PATCH "/inventory/stocks/$SKU_RELEASE/adjust" "{\"productId\":\"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb\",\"sellerId\":\"$SELLER_ID\",\"deltaOnHand\":12,\"reason\":\"Release flow stock\"}" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.onHand" "12"

print_step "Reserve inventory for release flow"
call_api POST /inventory/reservations "{\"orderId\":\"$ORDER_RELEASE_ID\",\"items\":[{\"sku\":\"$SKU_RELEASE\",\"quantity\":4}]}" "$ADMIN_TOKEN"
assert_status_in "200 201"
assert_success_true
assert_json_field_equals "data.status" "ACTIVE"

print_step "Stock snapshot while reserved"
call_api GET "/inventory/stocks/$SKU_RELEASE" "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.onHand" "12"
assert_json_field_equals "data.reserved" "4"
assert_json_field_equals "data.available" "8"

print_step "Release reservation"
call_api POST "/inventory/reservations/$ORDER_RELEASE_ID/release" '{"reason":"Order cancelled manually"}' "$ADMIN_TOKEN"
assert_status_in "200 201"
assert_success_true
assert_json_field_equals "data.status" "RELEASED"
assert_json_field_equals "data.items.0.sku" "$SKU_RELEASE"
assert_json_field_equals "data.items.0.quantity" "4"

print_step "Stock snapshot after release"
call_api GET "/inventory/stocks/$SKU_RELEASE" "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
assert_json_field_equals "data.onHand" "12"
assert_json_field_equals "data.reserved" "0"
assert_json_field_equals "data.available" "12"

print_step "Unknown SKU should return not found"
call_api GET "/inventory/stocks/SKU-UNKNOWN-$RUN_SUFFIX" "" "$SELLER_TOKEN"
assert_status_in "404"
assert_success_false
assert_error_code "INVENTORY_SKU_NOT_FOUND"

echo
echo "All inventory-service functional smoke tests passed."
