#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/product-service/docker-compose.dev.yml"
BASE_URL="${BASE_URL:-http://localhost:3003/api/v1}"
JWT_SECRET="${JWT_SECRET:-change-me-product-access-secret-min-32-chars}"
SELLER_ID="${SELLER_ID:-11111111-1111-4111-8111-111111111111}"
ANOTHER_SELLER_ID="${ANOTHER_SELLER_ID:-22222222-2222-4222-8222-222222222222}"
ADMIN_ID="${ADMIN_ID:-33333333-3333-4333-8333-333333333333}"
SELLER_EMAIL="${SELLER_EMAIL:-seller@example.com}"
ANOTHER_SELLER_EMAIL="${ANOTHER_SELLER_EMAIL:-another-seller@example.com}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
KEEP_UP="${KEEP_UP:-0}"
RUN_JEST="${RUN_JEST:-1}"

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

json_array_contains_id() {
  local json_input="$1"
  local array_path="$2"
  local expected_id="$3"

  JSON_INPUT="$json_input" "$NODE_BIN" - "$array_path" "$expected_id" <<'NODE'
const path = process.argv[2].split('.').filter(Boolean);
const expected = process.argv[3];
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

if (!Array.isArray(cur)) {
  process.exit(1);
}

const exists = cur.some((item) => item && typeof item === 'object' && String(item.id || '') === expected);
process.exit(exists ? 0 : 1);
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
  jti: `product-test-jti-${Date.now()}`,
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

url_encode() {
  local value="$1"
  "$NODE_BIN" - "$value" <<'NODE'
const value = process.argv[2] ?? '';
process.stdout.write(encodeURIComponent(value));
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

print_step "Starting product-service stack (mongo + redis + product-service)"
docker compose -f "$COMPOSE_FILE" up --build -d mongo redis product-service
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
    docker compose -f "$COMPOSE_FILE" logs product-service --tail=200 >&2 || true
    docker compose -f "$COMPOSE_FILE" logs mongo --tail=200 >&2 || true
    docker compose -f "$COMPOSE_FILE" logs redis --tail=200 >&2 || true
    exit 1
  fi
  sleep 2
done

SELLER_TOKEN="$(make_token "$SELLER_ID" "$SELLER_EMAIL" "SELLER")"
ANOTHER_SELLER_TOKEN="$(make_token "$ANOTHER_SELLER_ID" "$ANOTHER_SELLER_EMAIL" "SELLER")"
ADMIN_TOKEN="$(make_token "$ADMIN_ID" "$ADMIN_EMAIL" "ADMIN")"

PRODUCT_NAME="Laptop Stand Pro $RANDOM"
PRODUCT_SKU="SKU-LS-PRO-$RANDOM"
PRODUCT_NAME_QUERY="$(url_encode "$PRODUCT_NAME")"

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
call_api POST /products '{"name":"Unauthorized","categoryId":"furniture","variants":[{"sku":"SKU-U-1","name":"Default","price":10,"currency":"USD"}]}'
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Unauthorized guard OK"

print_step "Validation should fail"
call_api POST /products '{"name":"","categoryId":"furniture","variants":[]}' "$SELLER_TOKEN"
assert_status_in "400"
assert_error_code "BAD_REQUEST"
echo "Validation guard OK"

print_step "Create draft product by seller"
CREATE_PAYLOAD="{\"name\":\"$PRODUCT_NAME\",\"categoryId\":\"furniture\",\"brand\":\"Acme\",\"attributes\":{\"color\":\"black\"},\"images\":[\"https://cdn.example.com/laptop-stand.png\"],\"variants\":[{\"sku\":\"$PRODUCT_SKU\",\"name\":\"Default\",\"price\":19.99,\"currency\":\"USD\",\"isDefault\":true}]}"
call_api POST /products "$CREATE_PAYLOAD" "$SELLER_TOKEN"
assert_status_in "200 201"
assert_success_true
PRODUCT_ID="$(json_field "$RESPONSE_BODY" "data.id")"
PRODUCT_STATUS="$(json_field "$RESPONSE_BODY" "data.status")"
if [[ -z "$PRODUCT_ID" ]]; then
  echo "Missing product id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
if [[ "$PRODUCT_STATUS" != "DRAFT" ]]; then
  echo "Expected product status DRAFT, got $PRODUCT_STATUS" >&2
  exit 1
fi
echo "Product created: $PRODUCT_ID"

print_step "List managed products should include product"
call_api GET /products/my "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
if ! json_array_contains_id "$RESPONSE_BODY" "data" "$PRODUCT_ID"; then
  echo "Expected /products/my to include created product" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Managed list OK"

print_step "Public list should not include draft product"
call_api GET "/products?search=$PRODUCT_NAME_QUERY"
assert_status_in "200"
assert_success_true
if json_array_contains_id "$RESPONSE_BODY" "data" "$PRODUCT_ID"; then
  echo "Draft product must not appear in public list" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Public visibility rule OK"

print_step "Duplicate slug should fail"
call_api POST /products "{\"name\":\"$PRODUCT_NAME\",\"categoryId\":\"furniture\",\"variants\":[{\"sku\":\"SKU-DUP-$RANDOM\",\"name\":\"Default\",\"price\":21,\"currency\":\"USD\"}]}" "$SELLER_TOKEN"
assert_status_in "409"
assert_error_code "PRODUCT_SLUG_EXISTS"
echo "Slug conflict OK"

print_step "Duplicate SKU should fail"
call_api POST /products "{\"name\":\"Another Product $RANDOM\",\"categoryId\":\"furniture\",\"variants\":[{\"sku\":\"$PRODUCT_SKU\",\"name\":\"Default\",\"price\":22,\"currency\":\"USD\"}]}" "$SELLER_TOKEN"
assert_status_in "409"
assert_error_code "PRODUCT_SKU_CONFLICT"
echo "SKU conflict OK"

print_step "Another seller cannot update product"
call_api PATCH "/products/$PRODUCT_ID" '{"name":"Hijacked Name"}' "$ANOTHER_SELLER_TOKEN"
assert_status_in "403"
assert_error_code "FORBIDDEN"
echo "Ownership guard OK"

print_step "Seller updates own product"
call_api PATCH "/products/$PRODUCT_ID" "{\"name\":\"$PRODUCT_NAME Updated\",\"variants\":[{\"sku\":\"$PRODUCT_SKU\",\"name\":\"Default\",\"price\":25.5,\"currency\":\"USD\",\"isDefault\":true}]}" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
UPDATED_NAME="$(json_field "$RESPONSE_BODY" "data.name")"
if [[ "$UPDATED_NAME" != "$PRODUCT_NAME Updated" ]]; then
  echo "Expected updated product name" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Update product OK"

print_step "Seller cannot update product status"
call_api PATCH "/products/$PRODUCT_ID/status" '{"status":"ACTIVE"}' "$SELLER_TOKEN"
assert_status_in "403"
assert_error_code "FORBIDDEN"
echo "Status permission guard OK"

print_step "Admin activates product"
call_api PATCH "/products/$PRODUCT_ID/status" '{"status":"ACTIVE"}' "$ADMIN_TOKEN"
assert_status_in "200"
assert_success_true
STATUS_AFTER_ADMIN="$(json_field "$RESPONSE_BODY" "data.status")"
if [[ "$STATUS_AFTER_ADMIN" != "ACTIVE" ]]; then
  echo "Expected ACTIVE status after admin update, got $STATUS_AFTER_ADMIN" >&2
  exit 1
fi
echo "Admin status update OK"

print_step "Public list should now include active product"
call_api GET "/products?search=$PRODUCT_NAME_QUERY"
assert_status_in "200"
assert_success_true
if ! json_array_contains_id "$RESPONSE_BODY" "data" "$PRODUCT_ID"; then
  echo "Expected active product in public list" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Public list active visibility OK"

print_step "Public get product detail"
call_api GET "/products/$PRODUCT_ID"
assert_status_in "200"
assert_success_true
echo "Public get detail OK"

print_step "Seller soft deletes product"
call_api DELETE "/products/$PRODUCT_ID" "" "$SELLER_TOKEN"
assert_status_in "200"
assert_success_true
DELETED_STATUS="$(json_field "$RESPONSE_BODY" "data.status")"
if [[ "$DELETED_STATUS" != "ARCHIVED" ]]; then
  echo "Expected ARCHIVED status after delete, got $DELETED_STATUS" >&2
  exit 1
fi
echo "Soft delete OK"

print_step "Deleted product should be hidden from public"
call_api GET "/products/$PRODUCT_ID"
assert_status_in "404"
assert_error_code "PRODUCT_NOT_FOUND"
echo "Deleted visibility rule OK"

print_step "Unknown product should return not found"
call_api GET "/products/8e302482-9696-45c4-9474-fa7b5f210d5b"
assert_status_in "404"
assert_error_code "PRODUCT_NOT_FOUND"
echo "Not found guard OK"

if [[ "$RUN_JEST" == "1" ]]; then
  print_step "Running workspace Jest tests"
  cd "$REPO_ROOT"
  "$NPM_BIN" run test --workspace services/product-service
fi

echo
echo "All product-service smoke tests passed."
