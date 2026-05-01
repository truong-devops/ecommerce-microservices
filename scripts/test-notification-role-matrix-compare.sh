#!/usr/bin/env bash
set -euo pipefail

JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
BASE_URL_OLD="${BASE_URL_OLD:-http://localhost:3029/api/v1}"
BASE_URL_GO="${BASE_URL_GO:-http://localhost:3039/api/v1}"

RESPONSE_STATUS=""
RESPONSE_BODY=""

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_field() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" node - "$path" <<'NODE'
const path = process.argv[2].split('.').filter(Boolean);
const obj = JSON.parse(process.env.JSON_INPUT ?? '');
let cur = obj;
for (const key of path) {
  if (Array.isArray(cur) && /^\d+$/.test(key)) {
    const idx = Number(key);
    if (idx >= cur.length) process.exit(1);
    cur = cur[idx];
    continue;
  }
  if (cur && typeof cur === 'object' && key in cur) {
    cur = cur[key];
    continue;
  }
  process.exit(1);
}
if (cur === null || cur === undefined) process.stdout.write('');
else if (typeof cur === 'object') process.stdout.write(JSON.stringify(cur));
else process.stdout.write(String(cur));
NODE
}

make_token() {
  local user_id="$1"
  local email="$2"
  local role="$3"

  node - "$JWT_SECRET" "$user_id" "$email" "$role" <<'NODE'
const crypto = require('crypto');
const [, , secret, userId, email, role] = process.argv;
const b64url = (input) => Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64url(JSON.stringify({ sub: userId, email, role, jti: `role-${role}-${Date.now()}`, iat: now, exp: now + 3600 }));
const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

  RESPONSE_STATUS="$("${cmd[@]}")"
  RESPONSE_BODY="$(cat "$tmp_file")"
  rm -f "$tmp_file"
}

assert_status() {
  local expected="$1"
  if [[ "$RESPONSE_STATUS" != "$expected" ]]; then
    echo "Expected status $expected, got $RESPONSE_STATUS" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_error_code() {
  local expected="$1"
  local code
  code="$(json_field "$RESPONSE_BODY" "error.code" || true)"
  if [[ "$code" != "$expected" ]]; then
    echo "Expected error.code=$expected, got $code" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

assert_success() {
  local success
  success="$(json_field "$RESPONSE_BODY" "success" || true)"
  if [[ "$success" != "true" && "$success" != "True" ]]; then
    echo "Expected success=true" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

wait_health() {
  local base="$1"
  for i in $(seq 1 30); do
    local code
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$base/health" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Service not ready: $base" >&2
  exit 1
}

run_for_base() {
  local base="$1"
  local label="$2"

  echo
  echo "==> Role matrix on $label ($base)"
  wait_health "$base"

  local customer_id="11111111-1111-4111-8111-111111111111"
  local other_customer_id="33333333-3333-4333-8333-333333333333"

  local admin_token
  local customer_token
  local support_token
  local warehouse_token
  local seller_token
  local super_admin_token

  admin_token="$(make_token "22222222-2222-4222-8222-222222222222" "admin@example.com" "ADMIN")"
  customer_token="$(make_token "$customer_id" "buyer@example.com" "CUSTOMER")"
  support_token="$(make_token "44444444-4444-4444-8444-444444444444" "support@example.com" "SUPPORT")"
  warehouse_token="$(make_token "55555555-5555-4555-8555-555555555555" "warehouse@example.com" "WAREHOUSE")"
  seller_token="$(make_token "66666666-6666-4666-8666-666666666666" "seller@example.com" "SELLER")"
  super_admin_token="$(make_token "77777777-7777-4777-8777-777777777777" "superadmin@example.com" "SUPER_ADMIN")"

  echo "- Unauthorized GET /notifications -> 401"
  call_api GET "$base/notifications"
  assert_status "401"
  assert_error_code "UNAUTHORIZED"

  echo "- CUSTOMER POST /notifications -> 403"
  call_api POST "$base/notifications" "{\"recipientIds\":[\"$customer_id\"],\"content\":\"role-matrix\"}" "$customer_token"
  assert_status "403"
  assert_error_code "FORBIDDEN"

  echo "- ADMIN POST /notifications -> 201"
  call_api POST "$base/notifications" "{\"recipientIds\":[\"$customer_id\"],\"subject\":\"matrix-own\",\"content\":\"role-matrix-own\"}" "$admin_token"
  assert_status "201"
  assert_success
  local own_notification_id
  own_notification_id="$(json_field "$RESPONSE_BODY" "data.items.0.id")"

  call_api POST "$base/notifications" "{\"recipientIds\":[\"$other_customer_id\"],\"subject\":\"matrix-other\",\"content\":\"role-matrix-other\"}" "$admin_token"
  assert_status "201"
  assert_success
  local other_notification_id
  other_notification_id="$(json_field "$RESPONSE_BODY" "data.items.0.id")"

  echo "- Read roles GET /notifications -> 200"
  for token in "$customer_token" "$admin_token" "$support_token" "$warehouse_token" "$seller_token" "$super_admin_token"; do
    call_api GET "$base/notifications" "" "$token"
    assert_status "200"
    assert_success
  done

  echo "- CUSTOMER GET own id -> 200"
  call_api GET "$base/notifications/$own_notification_id" "" "$customer_token"
  assert_status "200"
  assert_success

  echo "- CUSTOMER GET other id -> 403"
  call_api GET "$base/notifications/$other_notification_id" "" "$customer_token"
  assert_status "403"
  assert_error_code "FORBIDDEN"

  echo "- ADMIN GET other id -> 200"
  call_api GET "$base/notifications/$other_notification_id" "" "$admin_token"
  assert_status "200"
  assert_success

  echo "Role matrix passed on $label"
}

require_cmd curl
require_cmd node

run_for_base "$BASE_URL_OLD" "legacy"
run_for_base "$BASE_URL_GO" "go"

echo
echo "All role-matrix checks passed for both services"
