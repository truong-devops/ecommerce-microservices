#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3006/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-payment-access-secret-min-32}"
CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
ADMIN_ID="${ADMIN_ID:-22222222-2222-4222-8222-222222222222}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"

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

generate_uuid() {
  "$PYTHON_BIN" - <<'PY'
import uuid
print(uuid.uuid4())
PY
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
    "jti": "payment-test-jti-" + str(int(time.time() * 1000)),
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
    echo "Ensure payment-service is running and reachable." >&2
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
ORDER_ID="${ORDER_ID:-$(generate_uuid)}"
SELLER_ID="${SELLER_ID:-33333333-3333-4333-8333-333333333333}"

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
call_api GET /payments
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Create payment intent"
IDEMPOTENCY_KEY="payment-test-$(date +%s)-$$"
CREATE_PAYLOAD="{\"orderId\":\"$ORDER_ID\",\"sellerId\":\"$SELLER_ID\",\"currency\":\"USD\",\"amount\":25.5,\"provider\":\"mock\",\"description\":\"checkout payment\"}"
call_api POST /payments/intents "$CREATE_PAYLOAD" "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "200 201"
assert_success_true
PAYMENT_ID="$(json_field "$RESPONSE_BODY" "data.id")"
ORDER_ID="$(json_field "$RESPONSE_BODY" "data.orderId")"
if [[ -z "$PAYMENT_ID" ]]; then
  echo "Missing payment id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Payment created: $PAYMENT_ID"

print_step "Idempotency replay"
call_api POST /payments/intents "$CREATE_PAYLOAD" "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "200 201"
assert_success_true
PAYMENT_ID_REPLAY="$(json_field "$RESPONSE_BODY" "data.id")"
if [[ "$PAYMENT_ID_REPLAY" != "$PAYMENT_ID" ]]; then
  echo "Replay must return same payment id" >&2
  exit 1
fi
echo "Idempotency replay OK"

print_step "Idempotency payload mismatch"
call_api POST /payments/intents '{"orderId":"55555555-5555-4555-8555-555555555555","currency":"USD","amount":30}' "$CUSTOMER_TOKEN" "$IDEMPOTENCY_KEY"
assert_status_in "409"
assert_error_code "IDEMPOTENCY_CONFLICT"
echo "Idempotency mismatch OK"

print_step "List and get payment"
call_api GET /payments "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

call_api GET "/payments/$PAYMENT_ID" "" "$CUSTOMER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Read APIs OK"

print_step "Webhook status sync and replay"
WEBHOOK_EVENT_ID="evt-$(date +%s)-$$"
WEBHOOK_PAYLOAD="{\"providerEventId\":\"$WEBHOOK_EVENT_ID\",\"orderId\":\"$ORDER_ID\",\"eventType\":\"payment.captured\",\"status\":\"CAPTURED\",\"signature\":\"valid-mock-signature\"}"
call_api POST /payments/webhooks/mock "$WEBHOOK_PAYLOAD"
assert_status_in "200 201"
assert_success_true

call_api POST /payments/webhooks/mock "$WEBHOOK_PAYLOAD"
assert_status_in "200 201"
assert_success_true

echo "Webhook replay OK"

print_step "Webhook payload mismatch should fail"
call_api POST /payments/webhooks/mock "{\"providerEventId\":\"$WEBHOOK_EVENT_ID\",\"orderId\":\"$ORDER_ID\",\"eventType\":\"payment.failed\",\"status\":\"FAILED\",\"signature\":\"valid-mock-signature\"}"
assert_status_in "409"
assert_error_code "WEBHOOK_IDEMPOTENCY_CONFLICT"

echo "Webhook conflict OK"

print_step "Create refund"
call_api POST "/payments/$PAYMENT_ID/refunds" '{"amount":10,"reason":"customer request"}' "$CUSTOMER_TOKEN"
assert_status_in "200 201"
assert_success_true
REFUND_ID="$(json_field "$RESPONSE_BODY" "data.refund.id")"
if [[ -z "$REFUND_ID" ]]; then
  echo "Missing refund id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Refund created: $REFUND_ID"

print_step "List refunds"
call_api GET "/payments/$PAYMENT_ID/refunds" "" "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true

echo "Refund APIs OK"

echo
echo "All payment-service smoke tests passed"
