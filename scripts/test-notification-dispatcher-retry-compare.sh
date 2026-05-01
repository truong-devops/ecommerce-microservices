#!/usr/bin/env bash
set -euo pipefail

COMPOSE_BASE="services/notification-service-nest/docker-compose.compare.yml"
COMPOSE_FAIL="services/notification-service-nest/docker-compose.compare.fail.yml"
BASE_URL_OLD="${BASE_URL_OLD:-http://localhost:3029/api/v1}"
BASE_URL_GO="${BASE_URL_GO:-http://localhost:3039/api/v1}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
RESET_DATA_ON_START="${RESET_DATA_ON_START:-true}"

compose_base() {
  docker compose -f "$COMPOSE_BASE" "$@"
}

compose_fail() {
  docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_FAIL" "$@"
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
const payload = b64url(JSON.stringify({ sub: userId, email, role, jti: `retry-${Date.now()}`, iat: now, exp: now + 3600 }));
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

  local status
  status="$("${cmd[@]}")"
  local body
  body="$(cat "$tmp_file")"
  rm -f "$tmp_file"

  echo "$status"$'\n'"$body"
}

db_old() {
  local sql="$1"
  compose_base exec -T postgres-old psql -U ecommerce -d ecommerce_old -t -A -c "$sql"
}

db_go() {
  local sql="$1"
  compose_base exec -T postgres-go psql -U ecommerce -d ecommerce_go -t -A -c "$sql"
}

wait_health() {
  local base="$1"
  for _ in $(seq 1 40); do
    local code
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$base/health" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Service not healthy: $base" >&2
  return 1
}

ensure_normal_mode() {
  compose_base up -d postgres-old redis-old postgres-go redis-go notification-old-migrate
  compose_base up -d --force-recreate notification-service-old notification-service-go
}

reset_compare_data() {
  local sql="TRUNCATE TABLE notification_attempts, inbox_events, notifications RESTART IDENTITY CASCADE;"
  db_old "$sql"
  db_go "$sql"
}

create_subject() {
  echo "retry-$1-$(date +%s)-$RANDOM"
}

wait_success_dispatch() {
  local label="$1"
  local query_fn="$2"
  local subject="$3"
  local last_status=""
  local last_sent_attempts=""

  for _ in $(seq 1 60); do
    local status
    local sent_attempts
    status="$($query_fn "SELECT status FROM notifications WHERE subject = '$subject' ORDER BY created_at DESC LIMIT 1;" | tr -d '[:space:]')"
    sent_attempts="$($query_fn "SELECT COUNT(*) FROM notification_attempts a JOIN notifications n ON n.id = a.notification_id WHERE n.subject = '$subject' AND a.status = 'SENT';" | tr -d '[:space:]')"
    last_status="$status"
    last_sent_attempts="$sent_attempts"

    if [[ "$status" == "SENT" && "$sent_attempts" =~ ^[0-9]+$ && "$sent_attempts" -ge 1 ]]; then
      echo "$label success dispatch OK (status=$status, sent_attempts=$sent_attempts)"
      return 0
    fi

    sleep 1
  done

  echo "$label success dispatch not observed for subject=$subject (last_status=${last_status:-<empty>}, last_sent_attempts=${last_sent_attempts:-<empty>})" >&2
  return 1
}

wait_failed_dispatch() {
  local label="$1"
  local query_fn="$2"
  local subject="$3"
  local last_status=""
  local last_retry_count=""
  local last_failed_attempts=""
  local last_next_retry_at=""

  for _ in $(seq 1 60); do
    local status
    local retry_count
    local failed_attempts
    local next_retry_at

    status="$($query_fn "SELECT status FROM notifications WHERE subject = '$subject' ORDER BY created_at DESC LIMIT 1;" | tr -d '[:space:]')"
    retry_count="$($query_fn "SELECT retry_count FROM notifications WHERE subject = '$subject' ORDER BY created_at DESC LIMIT 1;" | tr -d '[:space:]')"
    failed_attempts="$($query_fn "SELECT COUNT(*) FROM notification_attempts a JOIN notifications n ON n.id = a.notification_id WHERE n.subject = '$subject' AND a.status = 'FAILED';" | tr -d '[:space:]')"
    next_retry_at="$($query_fn "SELECT COALESCE(next_retry_at::text, '') FROM notifications WHERE subject = '$subject' ORDER BY created_at DESC LIMIT 1;" | tr -d '[:space:]')"
    last_status="$status"
    last_retry_count="$retry_count"
    last_failed_attempts="$failed_attempts"
    last_next_retry_at="$next_retry_at"

    if [[ "$status" == "FAILED" && "$retry_count" =~ ^[0-9]+$ && "$retry_count" -ge 1 && "$failed_attempts" =~ ^[0-9]+$ && "$failed_attempts" -ge 1 && -n "$next_retry_at" ]]; then
      echo "$label failed dispatch OK (status=$status, retry_count=$retry_count, failed_attempts=$failed_attempts)"
      return 0
    fi

    sleep 1
  done

  echo "$label failed dispatch not observed for subject=$subject (last_status=${last_status:-<empty>}, last_retry_count=${last_retry_count:-<empty>}, last_failed_attempts=${last_failed_attempts:-<empty>}, last_next_retry_at=${last_next_retry_at:-<empty>})" >&2
  return 1
}

ADMIN_TOKEN="$(make_token "22222222-2222-4222-8222-222222222222" "admin@example.com" "ADMIN")"
RECIPIENT_ID="11111111-1111-4111-8111-111111111111"

echo "==> Ensure compare stack in normal mode"
ensure_normal_mode
if [[ "$RESET_DATA_ON_START" == "true" ]]; then
  echo "==> Reset compare data (old/go) to avoid dispatcher backlog impact"
  reset_compare_data
fi
wait_health "$BASE_URL_OLD"
wait_health "$BASE_URL_GO"

echo "==> Phase A: success dispatcher path (normal mode)"

SUBJECT_OLD_OK="$(create_subject old-ok)"
RESP_OLD_OK="$(call_api POST "$BASE_URL_OLD/notifications" "{\"recipientIds\":[\"$RECIPIENT_ID\"],\"subject\":\"$SUBJECT_OLD_OK\",\"content\":\"retry success old\"}" "$ADMIN_TOKEN")"
STATUS_OLD_OK="$(printf '%s' "$RESP_OLD_OK" | head -n1)"
BODY_OLD_OK="$(printf '%s' "$RESP_OLD_OK" | tail -n +2)"
if [[ "$STATUS_OLD_OK" != "201" ]]; then
  echo "Failed to create old notification (success phase). status=$STATUS_OLD_OK body=$BODY_OLD_OK" >&2
  exit 1
fi

SUBJECT_GO_OK="$(create_subject go-ok)"
RESP_GO_OK="$(call_api POST "$BASE_URL_GO/notifications" "{\"recipientIds\":[\"$RECIPIENT_ID\"],\"subject\":\"$SUBJECT_GO_OK\",\"content\":\"retry success go\"}" "$ADMIN_TOKEN")"
STATUS_GO_OK="$(printf '%s' "$RESP_GO_OK" | head -n1)"
BODY_GO_OK="$(printf '%s' "$RESP_GO_OK" | tail -n +2)"
if [[ "$STATUS_GO_OK" != "201" ]]; then
  echo "Failed to create go notification (success phase). status=$STATUS_GO_OK body=$BODY_GO_OK" >&2
  exit 1
fi

wait_success_dispatch "legacy" db_old "$SUBJECT_OLD_OK"
wait_success_dispatch "go" db_go "$SUBJECT_GO_OK"

echo
echo "==> Phase B: forced fail dispatcher path"
compose_fail up -d --force-recreate notification-service-old notification-service-go
wait_health "$BASE_URL_OLD"
wait_health "$BASE_URL_GO"

SUBJECT_OLD_FAIL="$(create_subject old-fail)"
RESP_OLD_FAIL="$(call_api POST "$BASE_URL_OLD/notifications" "{\"recipientIds\":[\"$RECIPIENT_ID\"],\"subject\":\"$SUBJECT_OLD_FAIL\",\"content\":\"retry fail old\"}" "$ADMIN_TOKEN")"
STATUS_OLD_FAIL="$(printf '%s' "$RESP_OLD_FAIL" | head -n1)"
if [[ "$STATUS_OLD_FAIL" != "201" ]]; then
  echo "Failed to create old notification (fail phase)." >&2
  exit 1
fi

SUBJECT_GO_FAIL="$(create_subject go-fail)"
RESP_GO_FAIL="$(call_api POST "$BASE_URL_GO/notifications" "{\"recipientIds\":[\"$RECIPIENT_ID\"],\"subject\":\"$SUBJECT_GO_FAIL\",\"content\":\"retry fail go\"}" "$ADMIN_TOKEN")"
STATUS_GO_FAIL="$(printf '%s' "$RESP_GO_FAIL" | head -n1)"
if [[ "$STATUS_GO_FAIL" != "201" ]]; then
  echo "Failed to create go notification (fail phase)." >&2
  exit 1
fi

wait_failed_dispatch "legacy" db_old "$SUBJECT_OLD_FAIL"
wait_failed_dispatch "go" db_go "$SUBJECT_GO_FAIL"

echo
echo "==> Restoring normal mode"
compose_base up -d --force-recreate notification-service-old notification-service-go
wait_health "$BASE_URL_OLD"
wait_health "$BASE_URL_GO"

echo
echo "Dispatcher retry checks passed for both services"
