#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3008/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-shipping-access-secret-min-32}"
CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
SELLER_ID="${SELLER_ID:-22222222-2222-4222-8222-222222222222}"
ADMIN_ID="${ADMIN_ID:-33333333-3333-4333-8333-333333333333}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"
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

generate_uuid() {
  python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
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
    "jti": "shipping-test-jti-" + str(int(time.time() * 1000)),
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
    echo "Ensure shipping-service is running and reachable." >&2
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
SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"

RUN_SUFFIX="${RUN_SUFFIX:-$(date +%s)-$$}"
ORDER_ID="${ORDER_ID:-$(generate_uuid)}"
AWB_CODE="${AWB_CODE:-AWB-$RUN_SUFFIX}"
TRACKING_CODE="${TRACKING_CODE:-TRK-$RUN_SUFFIX}"
WEBHOOK_EVENT_ID="${WEBHOOK_EVENT_ID:-evt-$RUN_SUFFIX}"

echo "Using test data: ORDER_ID=$ORDER_ID AWB=$AWB_CODE TRACKING=$TRACKING_CODE EVENT_ID=$WEBHOOK_EVENT_ID"

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
call_api GET /shipments
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Create shipment as seller"
CREATE_PAYLOAD="{\"orderId\":\"$ORDER_ID\",\"buyerId\":\"$CUSTOMER_ID\",\"sellerId\":\"$SELLER_ID\",\"provider\":\"ghn\",\"currency\":\"USD\",\"shippingFee\":5.5,\"codAmount\":0,\"recipientName\":\"Buyer One\",\"recipientPhone\":\"0123456789\",\"recipientAddress\":\"Ho Chi Minh City\",\"awb\":\"$AWB_CODE\",\"trackingNumber\":\"$TRACKING_CODE\"}"
call_api POST /shipments "$CREATE_PAYLOAD" "$SELLER_TOKEN"
assert_status_in "200 201"
assert_success_true
SHIPMENT_ID="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ -z "$SHIPMENT_ID" ]]; then
  echo "Missing shipment id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Shipment created: $SHIPMENT_ID"

print_step "Customer can read own shipment"
call_api GET "/shipments/$SHIPMENT_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true
echo "Customer access OK"

print_step "Update status progression"
call_api PATCH "/shipments/$SHIPMENT_ID/status" '{"status":"AWB_CREATED"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

call_api PATCH "/shipments/$SHIPMENT_ID/status" '{"status":"PICKED_UP"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

echo "Status progression OK"

print_step "Add tracking event"
call_api POST "/shipments/$SHIPMENT_ID/tracking-events" '{"status":"IN_TRANSIT","eventCode":"MOVE","description":"In transit","location":"Hub A"}' "$SELLER_TOKEN"
assert_status_in "200 201"
assert_success_true

echo "Tracking event created"

print_step "Get tracking events"
call_api GET "/shipments/$SHIPMENT_ID/tracking-events" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Tracking listing OK"

print_step "Webhook status update + idempotency replay"
WEBHOOK_PAYLOAD="{\"providerEventId\":\"$WEBHOOK_EVENT_ID\",\"orderId\":\"$ORDER_ID\",\"status\":\"OUT_FOR_DELIVERY\",\"description\":\"Out for delivery\"}"
call_api POST /shipments/webhooks/ghn "$WEBHOOK_PAYLOAD"
assert_status_in "200 201"
assert_success_true

call_api POST /shipments/webhooks/ghn "$WEBHOOK_PAYLOAD"
assert_status_in "200 201"
assert_success_true

echo "Webhook idempotency replay OK"

print_step "Webhook payload mismatch should fail"
call_api POST /shipments/webhooks/ghn "{\"providerEventId\":\"$WEBHOOK_EVENT_ID\",\"orderId\":\"$ORDER_ID\",\"status\":\"DELIVERED\"}"
assert_status_in "409"
assert_error_code "WEBHOOK_IDEMPOTENCY_CONFLICT"

echo "Webhook conflict OK"

print_step "Invalid transition should fail"
call_api PATCH "/shipments/$SHIPMENT_ID/status" '{"status":"CANCELLED"}' "$ADMIN_TOKEN"
assert_status_in "422"
assert_error_code "INVALID_SHIPMENT_STATUS_TRANSITION"

echo "Invalid transition guard OK"

echo
echo "All shipping-service smoke tests passed"
