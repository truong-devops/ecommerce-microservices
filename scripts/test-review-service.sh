#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3009/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-review-access-secret-min-32}"
PRODUCT_ID="${PRODUCT_ID:-$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)}"
SELLER_ID="${SELLER_ID:-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb}"
CUSTOMER_1_ID="${CUSTOMER_1_ID:-11111111-1111-4111-8111-111111111111}"
CUSTOMER_2_ID="${CUSTOMER_2_ID:-22222222-2222-4222-8222-222222222222}"
ADMIN_ID="${ADMIN_ID:-33333333-3333-4333-8333-333333333333}"

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
    "jti": "review-test-jti-" + str(int(time.time() * 1000)),
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
    echo "Ensure review-service is running and reachable." >&2
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

CUSTOMER_1_TOKEN="$(make_token "$CUSTOMER_1_ID" "buyer1@example.com" "CUSTOMER")"
CUSTOMER_2_TOKEN="$(make_token "$CUSTOMER_2_ID" "buyer2@example.com" "CUSTOMER")"
SELLER_TOKEN="$(make_token "$SELLER_ID" "seller@example.com" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "admin@example.com" "ADMIN")"

ORDER_1_ID="${ORDER_1_ID:-$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)}"
ORDER_2_ID="${ORDER_2_ID:-$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)}"

echo "Using test data: ORDER_1_ID=$ORDER_1_ID ORDER_2_ID=$ORDER_2_ID PRODUCT_ID=$PRODUCT_ID"

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

print_step "Unauthorized create should fail"
call_api POST /reviews "{\"orderId\":\"$ORDER_1_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":5,\"content\":\"great\"}"
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Create review by customer 1"
call_api POST /reviews "{\"orderId\":\"$ORDER_1_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":4,\"title\":\"Good\",\"content\":\"Nice quality\"}" "$CUSTOMER_1_TOKEN"
assert_status_in "200 201"
assert_success_true
REVIEW_1_ID="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ -z "$REVIEW_1_ID" ]]; then
  echo "Missing review id" >&2
  exit 1
fi
echo "Review created: $REVIEW_1_ID"

print_step "Duplicate review should fail"
call_api POST /reviews "{\"orderId\":\"$ORDER_1_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":3,\"content\":\"duplicate\"}" "$CUSTOMER_1_TOKEN"
assert_status_in "409"
assert_error_code "REVIEW_ALREADY_EXISTS"
echo "Duplicate guard OK"

print_step "Create review by customer 2"
call_api POST /reviews "{\"orderId\":\"$ORDER_2_ID\",\"productId\":\"$PRODUCT_ID\",\"sellerId\":\"$SELLER_ID\",\"rating\":5,\"content\":\"Excellent\"}" "$CUSTOMER_2_TOKEN"
assert_status_in "200 201"
assert_success_true
REVIEW_2_ID="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ -z "$REVIEW_2_ID" ]]; then
  echo "Missing second review id" >&2
  exit 1
fi
echo "Second review created"

print_step "Public listing"
call_api GET "/reviews?productId=$PRODUCT_ID"
assert_status_in "200"
assert_success_true
echo "Public listing OK"

print_step "Summary before moderation"
call_api GET "/reviews/products/$PRODUCT_ID/summary"
assert_status_in "200"
assert_success_true
TOTAL_BEFORE="$(json_field "$RESPONSE_BODY" "data.totalReviews")"
if [[ "$TOTAL_BEFORE" != "2" ]]; then
  echo "Expected totalReviews=2 before moderation, got $TOTAL_BEFORE" >&2
  exit 1
fi
echo "Summary before moderation OK"

print_step "Owner update"
call_api PATCH "/reviews/$REVIEW_1_ID" "{\"rating\":3,\"content\":\"Updated by owner\"}" "$CUSTOMER_1_TOKEN"
assert_status_in "200"
assert_success_true
echo "Owner update OK"

print_step "Seller reply"
call_api POST "/reviews/$REVIEW_1_ID/reply" "{\"content\":\"Thanks for your feedback\"}" "$SELLER_TOKEN"
assert_status_in "200 201"
assert_success_true
echo "Seller reply OK"

print_step "Moderate review as admin"
call_api PATCH "/reviews/$REVIEW_1_ID/moderation" "{\"status\":\"HIDDEN\",\"reason\":\"Policy violation\"}" "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true
echo "Moderation OK"

print_step "Public cannot see hidden review"
call_api GET "/reviews/$REVIEW_1_ID"
assert_status_in "404"
assert_error_code "REVIEW_NOT_FOUND"
echo "Hidden review access guard OK"

print_step "Owner can still see hidden review"
call_api GET "/reviews/$REVIEW_1_ID" "" "$CUSTOMER_1_TOKEN"
assert_status_in "200"
assert_success_true
echo "Owner hidden access OK"

print_step "Summary after moderation"
call_api GET "/reviews/products/$PRODUCT_ID/summary"
assert_status_in "200"
assert_success_true
TOTAL_AFTER="$(json_field "$RESPONSE_BODY" "data.totalReviews")"
if [[ "$TOTAL_AFTER" != "1" ]]; then
  echo "Expected totalReviews=1 after moderation, got $TOTAL_AFTER" >&2
  exit 1
fi
echo "Summary after moderation OK"

print_step "Soft delete second review"
call_api DELETE "/reviews/$REVIEW_2_ID" "" "$CUSTOMER_2_TOKEN"
assert_status_in "200"
assert_success_true
echo "Soft delete OK"

print_step "Summary after soft delete"
call_api GET "/reviews/products/$PRODUCT_ID/summary"
assert_status_in "200"
assert_success_true
TOTAL_FINAL="$(json_field "$RESPONSE_BODY" "data.totalReviews")"
if [[ "$TOTAL_FINAL" != "0" ]]; then
  echo "Expected totalReviews=0 after soft delete, got $TOTAL_FINAL" >&2
  exit 1
fi
echo "Summary after soft delete OK"

echo
echo "All review-service smoke tests passed"
