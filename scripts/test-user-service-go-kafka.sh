#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_COMPOSE_FILE="$REPO_ROOT/docker-compose.dev.yml"
GO_COMPOSE_FILE="$REPO_ROOT/services/user-service/docker-compose.dev.yml"
BASE_URL="${BASE_URL:-http://localhost:3110/api/v1}"
KEEP_UP="${KEEP_UP:-0}"
STOP_KAFKA="${STOP_KAFKA:-0}"
RUN_GO_TEST="${RUN_GO_TEST:-0}"
TOPIC="${KAFKA_USER_TOPIC:-user.registered.go.smoke.$(date +%s)}"

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

json_get() {
  local json_input="$1"
  local path="$2"
  JSON_INPUT="$json_input" node - "$path" <<'NODE'
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

call_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local tmp_file
  tmp_file="$(mktemp)"

  local -a cmd=(curl -sS -o "$tmp_file" -w "%{http_code}" -X "$method" "$BASE_URL$path" -H "Accept: application/json")
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

assert_status() {
  local expected="$1"
  if [[ "$RESPONSE_STATUS" != "$expected" ]]; then
    echo "Expected HTTP $expected, got $RESPONSE_STATUS" >&2
    echo "Body: $RESPONSE_BODY" >&2
    exit 1
  fi
}

teardown() {
  if [[ "$KEEP_UP" != "1" ]]; then
    echo
    echo "Stopping Go service compose..."
    docker compose -f "$GO_COMPOSE_FILE" down >/dev/null 2>&1 || true
  else
    echo
    echo "Keeping Go service compose up (KEEP_UP=1)."
  fi

  if [[ "$STOP_KAFKA" == "1" ]]; then
    echo "Stopping Kafka + Zookeeper from root compose..."
    docker compose -f "$ROOT_COMPOSE_FILE" stop kafka zookeeper >/dev/null 2>&1 || true
  else
    echo "Keeping Kafka + Zookeeper running (STOP_KAFKA=0)."
  fi
}

trap teardown EXIT

require_cmd docker
require_cmd curl
require_cmd node

print_step "Starting Kafka infrastructure (zookeeper + kafka)"
KAFKA_ADVERTISED_HOST=host.docker.internal docker compose -f "$ROOT_COMPOSE_FILE" up -d --force-recreate zookeeper kafka

print_step "Waiting for Kafka readiness"
for i in $(seq 1 90); do
  if docker compose -f "$ROOT_COMPOSE_FILE" exec -T kafka bash -lc "kafka-topics --bootstrap-server localhost:29092 --list >/dev/null 2>&1"; then
    echo "Kafka is ready"
    break
  fi

  if [[ "$i" -eq 90 ]]; then
    echo "Kafka readiness timeout" >&2
    docker compose -f "$ROOT_COMPOSE_FILE" logs kafka --tail=200 >&2 || true
    docker compose -f "$ROOT_COMPOSE_FILE" logs zookeeper --tail=200 >&2 || true
    exit 1
  fi
  sleep 2
done

print_step "Creating test topic: $TOPIC"
docker compose -f "$ROOT_COMPOSE_FILE" exec -T kafka bash -lc "kafka-topics --bootstrap-server localhost:29092 --create --if-not-exists --topic '$TOPIC' --partitions 1 --replication-factor 1"

print_step "Starting user-service with Kafka enabled"
KAFKA_ENABLED=true KAFKA_BROKERS=host.docker.internal:9092 KAFKA_USER_TOPIC="$TOPIC" docker compose -f "$GO_COMPOSE_FILE" up --build -d user-service-db user-service
docker compose -f "$GO_COMPOSE_FILE" ps

if [[ "$RUN_GO_TEST" == "1" ]]; then
  print_step "Running go test suite"
  (
    cd "$REPO_ROOT/services/user-service"
    go test ./...
  )
fi

print_step "Waiting for user-service health endpoint"
for i in $(seq 1 60); do
  status="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || true)"
  if [[ "$status" == "200" ]]; then
    echo "Health check OK"
    break
  fi

  if [[ "$i" -eq 60 ]]; then
    echo "Health check timeout. Last status=$status" >&2
    docker compose -f "$GO_COMPOSE_FILE" logs user-service --tail=200 >&2 || true
    exit 1
  fi
  sleep 2
done

TIMESTAMP="$(date +%s)"
EMAIL="kafka.go.user.${TIMESTAMP}@example.com"

print_step "POST /users to trigger user.registered event"
CREATE_PAYLOAD="{\"email\":\"$EMAIL\",\"firstName\":\"Kafka\",\"lastName\":\"Test\",\"phone\":\"+84901234567\",\"role\":\"buyer\"}"
call_api POST /users "$CREATE_PAYLOAD"
assert_status 201
USER_ID="$(json_get "$RESPONSE_BODY" "data.id")"
if [[ -z "$USER_ID" ]]; then
  echo "Create user returned empty id" >&2
  echo "Body: $RESPONSE_BODY" >&2
  exit 1
fi
echo "Created user id=$USER_ID email=$EMAIL"

print_step "Consuming message from topic $TOPIC"
CONSUMED_OUTPUT="$(docker compose -f "$ROOT_COMPOSE_FILE" exec -T kafka bash -lc "timeout 30s kafka-console-consumer --bootstrap-server localhost:29092 --topic '$TOPIC' --from-beginning --max-messages 1 --property print.key=true --property key.separator='|'" || true)"
if [[ -z "$CONSUMED_OUTPUT" ]]; then
  echo "No Kafka message consumed from topic $TOPIC" >&2
  docker compose -f "$GO_COMPOSE_FILE" logs user-service --tail=200 >&2 || true
  exit 1
fi

echo "Consumed message: $CONSUMED_OUTPUT"

if [[ "$CONSUMED_OUTPUT" != *"$USER_ID"* ]] || [[ "$CONSUMED_OUTPUT" != *"$EMAIL"* ]]; then
  echo "Consumed message does not match created user" >&2
  echo "Expected to contain userId=$USER_ID and email=$EMAIL" >&2
  exit 1
fi

echo
echo "Kafka e2e OK: user-service published user.registered successfully."
