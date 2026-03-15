#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001/api/v1}"
EMAIL="${AUTH_TEST_EMAIL:-buyer.$(date +%s)@example.com}"
PASSWORD="${AUTH_TEST_PASSWORD:-StrongPass123}"
NEW_PASSWORD="${AUTH_TEST_NEW_PASSWORD:-StrongPass456}"

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
    echo "Ensure auth-service is running and reachable." >&2
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

print_step "Register"
call_api POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"CUSTOMER\"}"
assert_status_in "200 201"
assert_success_true
VERIFY_TOKEN="$(json_field "$RESPONSE_BODY" "data.verifyToken" || true)"
if [[ -z "$VERIFY_TOKEN" ]]; then
  echo "verifyToken missing. Ensure APP_ENV=development for local smoke test." >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Registered $EMAIL"

print_step "Verify email"
call_api POST /auth/verify-email "{\"token\":\"$VERIFY_TOKEN\"}"
assert_status_in "200 201"
assert_success_true
echo "Email verified"

print_step "Login"
call_api POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
assert_status_in "200 201"
assert_success_true
ACCESS_TOKEN="$(json_field "$RESPONSE_BODY" "data.accessToken")"
REFRESH_TOKEN="$(json_field "$RESPONSE_BODY" "data.refreshToken")"
if [[ -z "$ACCESS_TOKEN" || -z "$REFRESH_TOKEN" ]]; then
  echo "Missing access/refresh token from login response" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Login OK"

print_step "Get sessions"
call_api GET /auth/sessions "" "$ACCESS_TOKEN"
assert_status_in "200"
assert_success_true
echo "Session listing OK"

print_step "Refresh token rotation"
call_api POST /auth/refresh-token "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
assert_status_in "200 201"
assert_success_true
NEW_ACCESS_TOKEN="$(json_field "$RESPONSE_BODY" "data.accessToken")"
NEW_REFRESH_TOKEN="$(json_field "$RESPONSE_BODY" "data.refreshToken")"
if [[ -z "$NEW_ACCESS_TOKEN" || -z "$NEW_REFRESH_TOKEN" ]]; then
  echo "Missing new access/refresh token from refresh response" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Refresh rotation OK"

print_step "Refresh token reuse detection"
call_api POST /auth/refresh-token "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
assert_status_in "401"
assert_error_code "TOKEN_REUSE_DETECTED"
echo "Reuse detection OK"

print_step "Login again after reuse detection"
call_api POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
assert_status_in "200 201"
assert_success_true
ACCESS_TOKEN_2="$(json_field "$RESPONSE_BODY" "data.accessToken")"
REFRESH_TOKEN_2="$(json_field "$RESPONSE_BODY" "data.refreshToken")"
echo "Re-login OK"

print_step "Logout"
call_api POST /auth/logout "{\"refreshToken\":\"$REFRESH_TOKEN_2\"}" "$ACCESS_TOKEN_2"
assert_status_in "200 201"
assert_success_true
echo "Logout OK"

print_step "Ensure access token revoked"
call_api GET /auth/sessions "" "$ACCESS_TOKEN_2"
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Access token revocation OK"

print_step "Login and logout-all"
call_api POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
assert_status_in "200 201"
assert_success_true
ACCESS_TOKEN_3="$(json_field "$RESPONSE_BODY" "data.accessToken")"

call_api POST /auth/logout-all "" "$ACCESS_TOKEN_3"
assert_status_in "200 201"
assert_success_true
echo "Logout-all OK"

print_step "Forgot and reset password"
call_api POST /auth/forgot-password "{\"email\":\"$EMAIL\"}"
assert_status_in "200 201"
assert_success_true
RESET_TOKEN="$(json_field "$RESPONSE_BODY" "data.resetToken" || true)"
if [[ -z "$RESET_TOKEN" ]]; then
  echo "resetToken missing. Ensure APP_ENV=development for local smoke test." >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi

call_api POST /auth/reset-password "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"$NEW_PASSWORD\"}"
assert_status_in "200 201"
assert_success_true
echo "Reset password OK"

print_step "Old password should fail"
call_api POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
assert_status_in "401"
assert_error_code "UNAUTHORIZED"
echo "Old password rejection OK"

print_step "New password should login"
call_api POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$NEW_PASSWORD\"}"
assert_status_in "200 201"
assert_success_true
echo "New password login OK"

echo
echo "All auth-service smoke tests passed for email: $EMAIL"
