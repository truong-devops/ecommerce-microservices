#!/usr/bin/env bash
set -euo pipefail

ORDER_BASE_URL="${ORDER_BASE_URL:-http://localhost:12016/api/v1}"
INVENTORY_BASE_URL="${INVENTORY_BASE_URL:-http://localhost:12013/api/v1}"
PAYMENT_BASE_URL="${PAYMENT_BASE_URL:-http://localhost:12017/api/v1}"
PRODUCT_BASE_URL="${PRODUCT_BASE_URL:-http://localhost:12012/api/v1}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
CUSTOMER_ID="${CUSTOMER_ID:-11111111-1111-4111-8111-111111111111}"
SELLER_ID="${SELLER_ID:-33333333-3333-4333-8333-333333333333}"
CUSTOMER_EMAIL="${CUSTOMER_EMAIL:-buyer@example.com}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
PRODUCT_ID="${PRODUCT_ID:-}"
TEST_SKU="${TEST_SKU:-}"
UNIT_PRICE="${UNIT_PRICE:-}"
ORDER_CURRENCY="${ORDER_CURRENCY:-}"
QUANTITY="${QUANTITY:-2}"
SAGA_TIMEOUT_SECONDS="${SAGA_TIMEOUT_SECONDS:-90}"

RESPONSE_STATUS=""
RESPONSE_BODY=""

require_cmd(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
print_step(){ echo; echo "==> $1"; }
json_field(){ local json_input="$1" path="$2"; JSON_INPUT="$json_input" python3 - "$path" <<'PY'
import json, os, sys
cur=json.loads(os.environ.get("JSON_INPUT",""))
for key in [p for p in sys.argv[1].split('.') if p]:
    if isinstance(cur,dict) and key in cur: cur=cur[key]
    elif isinstance(cur,list) and key.isdigit() and int(key)<len(cur): cur=cur[int(key)]
    else: sys.exit(1)
print(json.dumps(cur) if isinstance(cur,(dict,list)) else ("" if cur is None else cur))
PY
}
make_token(){ local user_id="$1" email="$2" role="$3"; python3 - "$JWT_SECRET" "$user_id" "$email" "$role" <<'PY'
import base64, hashlib, hmac, json, sys, time
secret,user_id,email,role=sys.argv[1:5]
def b64(data): return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
h=b64(json.dumps({"alg":"HS256","typ":"JWT"},separators=(",",":")).encode())
p=b64(json.dumps({"sub":user_id,"email":email,"role":role,"sessionId":"checkout-saga-session","tokenVersion":1,"jti":"checkout-saga-"+str(int(time.time()*1000)),"iat":int(time.time()),"exp":int(time.time())+3600},separators=(",",":")).encode())
s=b64(hmac.new(secret.encode(),f"{h}.{p}".encode(),hashlib.sha256).digest())
print(f"{h}.{p}.{s}")
PY
}
call_api_url(){ local method="$1" url="$2" data="${3:-}" bearer="${4:-}" idem="${5:-}"; local tmp_file; tmp_file="$(mktemp)"; local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$url" -H "Accept: application/json"); [[ -n "$bearer" ]] && cmd+=(-H "Authorization: Bearer $bearer"); [[ -n "$idem" ]] && cmd+=(-H "Idempotency-Key: $idem"); [[ -n "$data" ]] && cmd+=(-H "Content-Type: application/json" -d "$data"); RESPONSE_STATUS="$("${cmd[@]}")" || { rm -f "$tmp_file"; exit 1; }; RESPONSE_BODY="$(cat "$tmp_file")"; rm -f "$tmp_file"; }
assert_status_in(){ local expected="$1"; for status in $expected; do [[ "$RESPONSE_STATUS" == "$status" ]] && return; done; echo "Expected [$expected], got $RESPONSE_STATUS body=$RESPONSE_BODY" >&2; exit 1; }
assert_success_true(){ local success; success="$(json_field "$RESPONSE_BODY" success || true)"; [[ "$success" == "True" || "$success" == "true" ]] || { echo "Expected success=true body=$RESPONSE_BODY" >&2; exit 1; }; }
wait_for_order_status(){ local order_id="$1" expected="$2" token="$3"; local deadline=$((SECONDS+SAGA_TIMEOUT_SECONDS)); while ((SECONDS<deadline)); do call_api_url GET "$ORDER_BASE_URL/orders/$order_id" "" "$token"; if [[ "$RESPONSE_STATUS" == "200" ]]; then [[ "$(json_field "$RESPONSE_BODY" data.status || true)" == "$expected" ]] && return 0; fi; sleep 2; done; echo "Timed out waiting for order $expected body=$RESPONSE_BODY" >&2; exit 1; }
wait_for_stock(){ local sku="$1" expected_on_hand="$2" expected_reserved="$3" token="$4"; local deadline=$((SECONDS+SAGA_TIMEOUT_SECONDS)); while ((SECONDS<deadline)); do call_api_url GET "$INVENTORY_BASE_URL/inventory/stocks/$sku" "" "$token"; if [[ "$RESPONSE_STATUS" == "200" ]]; then local on_hand reserved; on_hand="$(json_field "$RESPONSE_BODY" data.onHand || true)"; reserved="$(json_field "$RESPONSE_BODY" data.reserved || true)"; [[ "$on_hand" == "$expected_on_hand" && "$reserved" == "$expected_reserved" ]] && return 0; fi; sleep 2; done; echo "Timed out waiting for stock $sku onHand=$expected_on_hand reserved=$expected_reserved body=$RESPONSE_BODY" >&2; exit 1; }
discover_product(){ call_api_url GET "$PRODUCT_BASE_URL/products"; assert_status_in "200"; assert_success_true; JSON_INPUT="$RESPONSE_BODY" python3 <<'PY'
import json, os, sys
for product in json.loads(os.environ["JSON_INPUT"]).get("data", []):
    variants = product.get("variants") or []
    if product.get("status") == "ACTIVE" and variants:
        variant = variants[0]
        print(product.get("id", ""))
        print(variant.get("sku", ""))
        print(variant.get("price", ""))
        print(variant.get("currency", ""))
        sys.exit(0)
sys.exit("No ACTIVE product with variant found")
PY
}

require_cmd curl; require_cmd python3
CUSTOMER_TOKEN="$(make_token "$CUSTOMER_ID" "$CUSTOMER_EMAIL" CUSTOMER)"
SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" SELLER)"
RUN_ID="$(date +%s)-$$"
if [[ -z "$PRODUCT_ID" || -z "$TEST_SKU" || -z "$UNIT_PRICE" || -z "$ORDER_CURRENCY" ]]; then
  PRODUCT_INFO="$(discover_product)"
  PRODUCT_ID="${PRODUCT_ID:-$(echo "$PRODUCT_INFO" | sed -n '1p')}"
  TEST_SKU="${TEST_SKU:-$(echo "$PRODUCT_INFO" | sed -n '2p')}"
  UNIT_PRICE="${UNIT_PRICE:-$(echo "$PRODUCT_INFO" | sed -n '3p')}"
  ORDER_CURRENCY="${ORDER_CURRENCY:-$(echo "$PRODUCT_INFO" | sed -n '4p')}"
fi

print_step "Health checks"
call_api_url GET "$ORDER_BASE_URL/health"; assert_status_in "200"; assert_success_true
call_api_url GET "$INVENTORY_BASE_URL/health"; assert_status_in "200"; assert_success_true
call_api_url GET "$PAYMENT_BASE_URL/health"; assert_status_in "200"; assert_success_true

print_step "Ensure stock exists"
call_api_url PATCH "$INVENTORY_BASE_URL/inventory/stocks/$TEST_SKU/adjust" "{\"productId\":\"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"sellerId\":\"$SELLER_ID\",\"deltaOnHand\":100,\"reason\":\"checkout saga payment failure $RUN_ID\"}" "$SELLER_TOKEN"
assert_status_in "200"; assert_success_true
START_ON_HAND="$(json_field "$RESPONSE_BODY" data.onHand)"

print_step "Create order"
ORDER_PAYLOAD="{\"currency\":\"$ORDER_CURRENCY\",\"shippingAmount\":0,\"discountAmount\":0,\"note\":\"checkout saga payment failure $RUN_ID\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"sku\":\"$TEST_SKU\",\"productName\":\"Saga item\",\"quantity\":$QUANTITY,\"unitPrice\":$UNIT_PRICE}]}"
call_api_url POST "$ORDER_BASE_URL/orders" "$ORDER_PAYLOAD" "$CUSTOMER_TOKEN" "checkout-payment-failure-$RUN_ID"
assert_status_in "200 201"; assert_success_true
ORDER_ID="$(json_field "$RESPONSE_BODY" data.id)"
TOTAL_AMOUNT="$(json_field "$RESPONSE_BODY" data.totalAmount)"

print_step "Wait for active reservation"
wait_for_stock "$TEST_SKU" "$START_ON_HAND" "$QUANTITY" "$SELLER_TOKEN"

print_step "Create mock failed payment"
PAYMENT_PAYLOAD="{\"orderId\":\"$ORDER_ID\",\"currency\":\"$ORDER_CURRENCY\",\"amount\":$TOTAL_AMOUNT,\"provider\":\"mock\",\"simulatedStatus\":\"FAILED\"}"
call_api_url POST "$PAYMENT_BASE_URL/payments/intents" "$PAYMENT_PAYLOAD" "$CUSTOMER_TOKEN" "checkout-payment-failure-payment-$RUN_ID"
assert_status_in "200 201"; assert_success_true
PAYMENT_STATUS="$(json_field "$RESPONSE_BODY" data.status)"
[[ "$PAYMENT_STATUS" == "FAILED" ]] || { echo "Expected payment FAILED, got $PAYMENT_STATUS" >&2; exit 1; }

print_step "Wait for order FAILED"
wait_for_order_status "$ORDER_ID" "FAILED" "$CUSTOMER_TOKEN"

print_step "Wait for reservation release"
wait_for_stock "$TEST_SKU" "$START_ON_HAND" "0" "$SELLER_TOKEN"

echo
echo "Checkout saga payment failure path passed."
