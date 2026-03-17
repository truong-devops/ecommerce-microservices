#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/cart-service/docker-compose.dev.yml"
BASE_URL="${BASE_URL:-http://localhost:3004/api/v1}"
LEGACY_BASE_URL="${LEGACY_BASE_URL:-http://localhost:3004/api}"
JWT_SECRET="${JWT_SECRET:-change-me-cart-access-secret-min-32chars}"
BUYER_ID="${BUYER_ID:-11111111-1111-4111-8111-111111111111}"
SELLER_ID="${SELLER_ID:-22222222-2222-4222-8222-222222222222}"
ANOTHER_BUYER_ID="${ANOTHER_BUYER_ID:-33333333-3333-4333-8333-333333333333}"
BUYER_EMAIL="${BUYER_EMAIL:-buyer@example.com}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
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

detect_node_bin() {
  if command -v node >/dev/null 2>&1; then
    echo "node"
    return
  fi

  if command -v node.exe >/dev/null 2>&1; then
    echo "node.exe"
    return
  fi

  if [[ -x "/c/Program Files/nodejs/node.exe" ]]; then
    echo "/c/Program Files/nodejs/node.exe"
    return
  fi

  echo "Missing required command: node (or node.exe)" >&2
  exit 1
}

detect_npm_bin() {
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return
  fi

  if command -v npm.cmd >/dev/null 2>&1; then
    echo "npm.cmd"
    return
  fi

  if [[ -x "/c/Program Files/nodejs/npm.cmd" ]]; then
    echo "/c/Program Files/nodejs/npm.cmd"
    return
  fi

  echo "Missing npm executable (npm or npm.cmd)." >&2
  exit 1
}

json_field() {
  local json_input="$1"
  local path="$2"

  JSON_INPUT="$json_input" "$NODE_BIN" - "$path" <<'NODE'
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

make_token() {
  local user_id="$1"
  local email="$2"
  local role="$3"

  "$NODE_BIN" - "$JWT_SECRET" "$user_id" "$email" "$role" <<'NODE'
const crypto = require('crypto');

const [secret, userId, email, role] = process.argv.slice(2);
const now = Math.floor(Date.now() / 1000);

function b64(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({
  sub: userId,
  email,
  role,
  jti: `cart-test-jti-${Date.now()}`,
  iat: now,
  exp: now + 3600
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(`${header}.${payload}`)
  .digest('base64url');

process.stdout.write(`${header}.${payload}.${signature}`);
NODE
}

call_api() {
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
NODE_BIN="$(detect_node_bin)"
NPM_BIN="$(detect_npm_bin)"

print_step "Starting cart-service stack (redis + postgres + cart-service)"
docker compose -f "$COMPOSE_FILE" up --build -d redis postgres cart-service
docker compose -f "$COMPOSE_FILE" ps

print_step "Waiting for health endpoint"
for i in $(seq 1 60); do
  status="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)"
  if [[ "$status" == "200" ]]; then
    echo "Health check OK"
    break
  fi

  if [[ "$i" -eq 60 ]]; then
    echo "Health check timeout. Last status=$status" >&2
    docker compose -f "$COMPOSE_FILE" logs cart-service --tail=200 >&2 || true
    docker compose -f "$COMPOSE_FILE" logs redis --tail=200 >&2 || true
    docker compose -f "$COMPOSE_FILE" logs postgres --tail=200 >&2 || true
    exit 1
  fi
  sleep 2
done

BUYER_TOKEN="$(make_token "$BUYER_ID" "$BUYER_EMAIL" "BUYER")"
SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ANOTHER_BUYER_TOKEN="$(make_token "$ANOTHER_BUYER_ID" "another@example.com" "BUYER")"

print_step "Health checks"
call_api GET "$BASE_URL/health"
assert_status_in "200"
assert_success_true

call_api GET "$LEGACY_BASE_URL/health"
assert_status_in "200"
assert_success_true

echo "Health endpoints OK"

print_step "Unauthorized should fail"
call_api GET "$BASE_URL/cart"
assert_status_in "401"
assert_error_code "UNAUTHORIZED"

echo "Unauthorized guard OK"

print_step "Get empty cart"
call_api GET "$BASE_URL/cart" "" "$BUYER_TOKEN"
assert_status_in "200"
assert_success_true

print_step "Add first item"
call_api POST "$BASE_URL/cart/items" '{"productId":"product-1","variantId":"variant-1","sku":"SKU-1","name":"Keyboard","unitPrice":10,"quantity":2,"sellerId":"seller-a"}' "$BUYER_TOKEN"
assert_status_in "200 201"
assert_success_true
ITEM_ID="$(json_field "$RESPONSE_BODY" "data.items.0.id")"
if [[ -z "$ITEM_ID" ]]; then
  echo "Missing item id after add" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi

echo "Item created: $ITEM_ID"

print_step "Add duplicate merge-key item should merge quantity"
call_api POST "$LEGACY_BASE_URL/cart/items" '{"productId":"product-1","variantId":"variant-1","sku":"SKU-1","name":"Keyboard","unitPrice":10,"quantity":1,"sellerId":"seller-a"}' "$BUYER_TOKEN"
assert_status_in "200 201"
assert_success_true
MERGED_QTY="$(json_field "$RESPONSE_BODY" "data.items.0.quantity")"
MERGE_VERSION="$(json_field "$RESPONSE_BODY" "data.version")"
if [[ "$MERGED_QTY" != "3" ]]; then
  echo "Expected merged quantity 3, got $MERGED_QTY" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi

echo "Merge rule OK"

print_step "Update item quantity"
call_api PATCH "$BASE_URL/cart/items/$ITEM_ID" '{"quantity":5}' "$BUYER_TOKEN"
assert_status_in "200"
assert_success_true
UPDATED_QTY="$(json_field "$RESPONSE_BODY" "data.items.0.quantity")"
if [[ "$UPDATED_QTY" != "5" ]]; then
  echo "Expected quantity 5, got $UPDATED_QTY" >&2
  exit 1
fi

echo "Update quantity OK"

print_step "Conflict check with stale expectedVersion"
call_api PATCH "$LEGACY_BASE_URL/cart/items/$ITEM_ID" "{\"quantity\":2,\"expectedVersion\":$MERGE_VERSION}" "$BUYER_TOKEN"
assert_status_in "409"
assert_error_code "CART_VERSION_CONFLICT"

echo "Optimistic concurrency conflict OK"

print_step "Validate cart via versioned route"
call_api POST "$BASE_URL/cart/validate" '{"includeExternalChecks":false}' "$BUYER_TOKEN"
assert_status_in "200 201"
assert_success_true
VALID_FLAG="$(json_field "$RESPONSE_BODY" "data.valid")"
if [[ "$VALID_FLAG" != "true" && "$VALID_FLAG" != "True" ]]; then
  echo "Expected data.valid=true" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi

print_step "Validate cart via legacy route"
call_api POST "$LEGACY_BASE_URL/cart/validate" '{"includeExternalChecks":false}' "$BUYER_TOKEN"
assert_status_in "200 201"
assert_success_true
LEGACY_VALID_FLAG="$(json_field "$RESPONSE_BODY" "data.valid")"
if [[ "$LEGACY_VALID_FLAG" != "true" && "$LEGACY_VALID_FLAG" != "True" ]]; then
  echo "Expected legacy data.valid=true" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi

echo "Validate routes OK"

print_step "Business validation should fail when quantity exceeds max"
call_api PATCH "$BASE_URL/cart/items/$ITEM_ID" '{"quantity":999}' "$BUYER_TOKEN"
assert_status_in "422"
assert_error_code "CART_QUANTITY_EXCEEDED"

echo "Business validation OK"

print_step "Seller role should be forbidden"
call_api GET "$BASE_URL/cart" "" "$SELLER_TOKEN"
assert_status_in "403"
assert_error_code "FORBIDDEN"

echo "Role guard OK"

print_step "Remove item then ensure not-found on second delete"
call_api DELETE "$BASE_URL/cart/items/$ITEM_ID" "" "$BUYER_TOKEN"
assert_status_in "200"
assert_success_true

call_api DELETE "$BASE_URL/cart/items/$ITEM_ID" "" "$BUYER_TOKEN"
assert_status_in "404"
assert_error_code "CART_ITEM_NOT_FOUND"

echo "Remove/not-found flow OK"

print_step "Cart not found for another buyer"
call_api DELETE "$BASE_URL/cart/items/non-existing-item" "" "$ANOTHER_BUYER_TOKEN"
assert_status_in "404"
assert_error_code "CART_NOT_FOUND"

echo "Cart not found flow OK"

print_step "Clear cart"
call_api DELETE "$LEGACY_BASE_URL/cart" "" "$BUYER_TOKEN"
assert_status_in "200"
assert_success_true

echo "Clear cart OK"

if [[ "$RUN_E2E" == "1" ]]; then
  print_step "Running cart-service e2e suite"
  cd "$REPO_ROOT"
  "$NPM_BIN" run test:e2e --workspace services/cart-service
fi

echo
echo "All cart-service Docker smoke tests passed."
