#!/usr/bin/env bash
set -euo pipefail

COMPOSE_BASE="services/payment-service-nest/docker-compose.compare.yml"
COMPOSE_KAFKA="services/payment-service-nest/docker-compose.compare.kafka.yml"
AUTO_UP="${AUTO_UP:-0}"
TOPIC="${TOPIC:-order.events}"

compose_kafka() {
  docker compose -f "$COMPOSE_BASE" -f "$COMPOSE_KAFKA" "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

db_query_old() {
  local sql="$1"
  compose_kafka exec -T postgres-old psql -U ecommerce -d ecommerce_old -t -A -c "$sql"
}

db_query_go() {
  local sql="$1"
  compose_kafka exec -T postgres-go psql -U ecommerce -d ecommerce_go -t -A -c "$sql"
}

wait_log_contains() {
  local service="$1"
  local pattern="$2"
  local label="$3"
  local timeout_sec="${4:-120}"
  local start_epoch
  start_epoch="$(date +%s)"

  while true; do
    if compose_kafka logs --since=5m "$service" 2>/dev/null | grep -qi "$pattern"; then
      echo "$label ready"
      return 0
    fi

    if (( "$(date +%s)" - start_epoch >= timeout_sec )); then
      echo "$label not ready within ${timeout_sec}s (pattern: $pattern)" >&2
      return 1
    fi

    sleep 1
  done
}

if [[ "$AUTO_UP" == "1" ]]; then
  echo "==> Starting compare stack with Kafka override"
  compose_kafka up -d --build
fi

if ! compose_kafka ps --services --filter status=running | grep -q '^kafka$'; then
  echo "Kafka compare stack is not running." >&2
  echo "Run: docker compose -f $COMPOSE_BASE -f $COMPOSE_KAFKA up -d --build" >&2
  exit 1
fi

require_cmd node
echo "==> Ensure Kafka topic exists ($TOPIC)"
compose_kafka exec -T kafka bash -lc "kafka-topics --bootstrap-server kafka:29092 --create --if-not-exists --topic '$TOPIC' --partitions 1 --replication-factor 1 >/dev/null"

echo "==> Waiting for Kafka consumers to be ready"
wait_log_contains payment-service-old "Order events consumer started" "legacy consumer"
wait_log_contains payment-service-go "order events consumer started" "go consumer"
sleep 2

MARKER="$(node -e "console.log(require('crypto').randomUUID())")"
EVENT_JSON="$(node -e "console.log(JSON.stringify({eventType:'order.created',payload:{orderId:'$MARKER',userId:'11111111-1111-4111-8111-111111111111',orderNumber:'ORD-KAFKA',totalAmount:123.45,currency:'USD',metadata:{requestId:'kafka-compare'}}}))")"

echo "==> Publishing duplicated Kafka event (orderId=$MARKER)"
printf '%s\n%s\n' "$EVENT_JSON" "$EVENT_JSON" | compose_kafka exec -T kafka bash -lc "kafka-console-producer --bootstrap-server kafka:29092 --topic '$TOPIC' >/dev/null"

wait_for_dedupe() {
  local label="$1"
  local fn="$2"

  for _ in $(seq 1 90); do
    local count
    count="$($fn "SELECT COUNT(*) FROM payments WHERE order_id::text = '$MARKER';" | tr -d '[:space:]')"
    if [[ "$count" == "1" ]]; then
      echo "$label dedupe OK: payments=$count"
      return 0
    fi
    sleep 1
  done

  echo "$label did not converge to dedupe expectation" >&2
  local final_count
  final_count="$($fn "SELECT COUNT(*) FROM payments WHERE order_id::text = '$MARKER';" | tr -d '[:space:]')"
  echo "$label final count: payments=$final_count" >&2
  return 1
}

echo "==> Waiting for old service consume + dedupe"
wait_for_dedupe "legacy" db_query_old

echo "==> Waiting for go service consume + dedupe"
wait_for_dedupe "go" db_query_go

echo
echo "Kafka dedupe checks passed on both payment services"
