#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3012/api/v1}"
ROOT_URL="${ROOT_URL:-http://localhost:3012}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"

CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
ANOTHER_CUSTOMER_ID="${ANOTHER_CUSTOMER_ID:-22222222-2222-4222-8222-222222222222}"
SELLER_ID="${SELLER_ID:-33333333-3333-4333-8333-333333333333}"
ADMIN_ID="${ADMIN_ID:-44444444-4444-4444-8444-444444444444}"

CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"
ANOTHER_CUSTOMER_EMAIL="${ANOTHER_CUSTOMER_EMAIL:-buyer2@example.com}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
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
    elif isinstance(cur, list) and key.isdigit():
        idx = int(key)
        if 0 <= idx < len(cur):
            cur = cur[idx]
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
    "jti": "review-go-test-jti-" + str(int(time.time() * 1000)),
    "iat": int(time.time()),
    "exp": int(time.time()) + 3600
}, separators=(',', ':')).encode('utf-8'))
signature = b64(hmac.new(secret.encode('utf-8'), f"{header}.{payload}".encode('utf-8'), hashlib.sha256).digest())
print(f"{header}.{payload}.{signature}")
PY
}

generate_uuid() {
  python3 - <<'PY'
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

call_root() {
  local method="$1"
  local path="$2"
  call_api_url "$method" "$ROOT_URL$path"
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
ANOTHER_CUSTOMER_TOKEN="$(make_token "$ANOTHER_CUSTOMER_ID" "$ANOTHER_CUSTOMER_EMAIL" "CUSTOMER")"
SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"

ORDER_ID="${ORDER_ID:-$(generate_uuid)}"
PRODUCT_ID="${PRODUCT_ID:-$(generate_uuid)}"

echo "Using ORDER_ID=$ORDER_ID PRODUCT_ID=$PRODUCT_ID"

print_step "Health checks"
call_root GET /health
assert_status_in "200"
assert_success_true

call_root GET /ready
assert_status_in "200"
assert_success_true

call_root GET /live
assert_status_in "200"
assert_success_true

echo "Health endpoints OK"

print_step "Unauthorized create should fail"
call_api POST /reviews "{\"orderId\":\"$ORDER_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":5,\"content\":\"great\"}"
assert_status_in "401"
assert_error_code "UNAUTHORIZED"

echo "Unauthorized guard OK"

print_step "Create review"
call_api POST /reviews "{\"orderId\":\"$ORDER_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":4,\"title\":\"Good\",\"content\":\"Nice quality\"}" "$CUSTOMER_TOKEN"
assert_status_in "201"
assert_success_true
REVIEW_ID="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ -z "$REVIEW_ID" ]]; then
  echo "Missing review id" >&2
  exit 1
fi

echo "Created REVIEW_ID=$REVIEW_ID"

print_step "Duplicate create should fail"
call_api POST /reviews "{\"orderId\":\"$ORDER_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":5,\"content\":\"duplicate\"}" "$CUSTOMER_TOKEN"
assert_status_in "409"
assert_error_code "REVIEW_ALREADY_EXISTS"

echo "Duplicate guard OK"

print_step "Public list by product"
call_api GET "/reviews?productId=$PRODUCT_ID"
assert_status_in "200"
assert_success_true

echo "List API OK"

print_step "Get by id (public)"
call_api GET "/reviews/$REVIEW_ID"
assert_status_in "200"
assert_success_true

echo "Get detail OK"

print_step "Update own review"
call_api PATCH "/reviews/$REVIEW_ID" "{\"rating\":5,\"content\":\"Updated content\"}" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Update own review OK"

print_step "Another customer update should fail"
call_api PATCH "/reviews/$REVIEW_ID" "{\"content\":\"hack\"}" "$ANOTHER_CUSTOMER_TOKEN"
assert_status_in "403"
assert_error_code "FORBIDDEN"

echo "Ownership guard OK"

print_step "Seller reply"
call_api POST "/reviews/$REVIEW_ID/reply" "{\"content\":\"Thanks for your feedback\"}" "$SELLER_TOKEN"
assert_status_in "201"
assert_success_true

echo "Reply OK"

print_step "Moderate to HIDDEN by admin"
call_api PATCH "/reviews/$REVIEW_ID/moderation" "{\"status\":\"HIDDEN\",\"reason\":\"policy check\"}" "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

echo "Moderation OK"

print_step "Hidden review should not be visible publicly"
call_api GET "/reviews/$REVIEW_ID"
assert_status_in "404"
assert_error_code "REVIEW_NOT_FOUND"

echo "Public visibility rule OK"

print_step "Owner can still view hidden review"
call_api GET "/reviews/$REVIEW_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Owner visibility rule OK"

print_step "Publish again"
call_api PATCH "/reviews/$REVIEW_ID/moderation" "{\"status\":\"PUBLISHED\"}" "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

echo "Publish back OK"

print_step "Delete by owner"
call_api DELETE "/reviews/$REVIEW_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Delete OK"

print_step "Deleted review should not be found"
call_api GET "/reviews/$REVIEW_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "404"
assert_error_code "REVIEW_NOT_FOUND"

echo "Delete visibility OK"

print_step "Product summary endpoint"
call_api GET "/reviews/products/$PRODUCT_ID/summary"
assert_status_in "200"
assert_success_true

echo "Summary API OK"

echo
echo "All review-service-go smoke tests passed"
