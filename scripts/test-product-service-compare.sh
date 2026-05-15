#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/services/product-service/docker-compose.compare.yml"
FULL_COMPOSE_FILE="$REPO_ROOT/services/product-service/docker-compose.compare.full.yml"
REAL_SEARCH_COMPOSE_FILE="$REPO_ROOT/services/product-service/docker-compose.compare.search-real.yml"

AUTO_UP="${AUTO_UP:-1}"
PRODUCT_COMPARE_FULL_STACK="${PRODUCT_COMPARE_FULL_STACK:-0}"
PRODUCT_COMPARE_REAL_SEARCH="${PRODUCT_COMPARE_REAL_SEARCH:-0}"
PRODUCT_COMPARE_TRANSPORT="${PRODUCT_COMPARE_TRANSPORT:-host}"
PRODUCT_COMPARE_SCENARIO="${PRODUCT_COMPARE_SCENARIO:-public}"
PRODUCT_COMPARE_LOAD="${PRODUCT_COMPARE_LOAD:-0}"
PRODUCT_LOAD_DURATION_SEC="${PRODUCT_LOAD_DURATION_SEC:-60}"
PRODUCT_LOAD_CONCURRENCY="${PRODUCT_LOAD_CONCURRENCY:-50}"
PRODUCT_NEST_BASE_URL="${PRODUCT_NEST_BASE_URL:-http://localhost:13003/api/v1}"
PRODUCT_GO_BASE_URL="${PRODUCT_GO_BASE_URL:-http://localhost:13013/api/v1}"
PRODUCT_COMPARE_ROUTE_PREFIX="${PRODUCT_COMPARE_ROUTE_PREFIX:-}"
PRODUCT_COMPARE_RUN_ID="${PRODUCT_COMPARE_RUN_ID:-r$(date +%s)}"

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
if [[ "$PRODUCT_COMPARE_FULL_STACK" == "1" ]]; then
  COMPOSE_ARGS=(-f "$COMPOSE_FILE" -f "$FULL_COMPOSE_FILE")
  if [[ "$PRODUCT_COMPARE_REAL_SEARCH" == "1" ]]; then
    COMPOSE_ARGS+=(-f "$REAL_SEARCH_COMPOSE_FILE")
  fi
fi

wait_for_health() {
  local base_url="$1"
  local label="$2"
  local timeout_sec="${3:-120}"
  local start_epoch
  start_epoch="$(date +%s)"

  while true; do
    if curl -fsS "$base_url/health" >/dev/null 2>&1; then
      return 0
    fi

    if (( "$(date +%s)" - start_epoch >= timeout_sec )); then
      echo "$label is not healthy within ${timeout_sec}s: $base_url/health" >&2
      return 1
    fi

    sleep 2
  done
}

verify_kafka() {
  local product_events_file
  local analytics_events_file
  product_events_file="$(mktemp)"
  analytics_events_file="$(mktemp)"

  docker exec product-service-shadow-kafka-1 bash -lc \
    'kafka-console-consumer --bootstrap-server localhost:29092 --topic product.events --from-beginning --timeout-ms 10000 2>/dev/null || true' \
    > "$product_events_file"
  docker exec product-service-shadow-kafka-1 bash -lc \
    'kafka-console-consumer --bootstrap-server localhost:29092 --topic analytics.events --from-beginning --timeout-ms 10000 2>/dev/null || true' \
    > "$analytics_events_file"

  PRODUCT_COMPARE_RUN_ID="$PRODUCT_COMPARE_RUN_ID" \
  PRODUCT_EVENTS_FILE="$product_events_file" \
  ANALYTICS_EVENTS_FILE="$analytics_events_file" \
  node "$REPO_ROOT/scripts/product-service-shadow-verify-kafka.mjs"
}

if [[ "$AUTO_UP" == "1" ]]; then
  echo "==> Starting product-service shadow compare stack"
  docker compose "${COMPOSE_ARGS[@]}" up -d --build
fi

if [[ "$PRODUCT_COMPARE_FULL_STACK" == "1" ]]; then
  echo "==> Ensuring Kafka topics"
  docker exec product-service-shadow-kafka-1 kafka-topics --bootstrap-server localhost:29092 --create --if-not-exists --topic product.events --partitions 1 --replication-factor 1 >/dev/null
  docker exec product-service-shadow-kafka-1 kafka-topics --bootstrap-server localhost:29092 --create --if-not-exists --topic analytics.events --partitions 1 --replication-factor 1 >/dev/null
fi

if [[ "$PRODUCT_COMPARE_TRANSPORT" == "docker" ]]; then
  echo "==> Running product-service shadow compare from Docker network ($PRODUCT_COMPARE_SCENARIO, run=$PRODUCT_COMPARE_RUN_ID)"
  docker run --rm \
    --network product-service-shadow_default \
    -v "$REPO_ROOT/scripts:/scripts:ro" \
    -e PRODUCT_NEST_BASE_URL=http://product-service-nest:8080/api/v1 \
    -e PRODUCT_GO_BASE_URL=http://product-service:8080/api/v1 \
    -e PRODUCT_COMPARE_RETRIES=60 \
    -e PRODUCT_COMPARE_SCENARIO="$PRODUCT_COMPARE_SCENARIO" \
    -e PRODUCT_COMPARE_RUN_ID="$PRODUCT_COMPARE_RUN_ID" \
    -e JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-dev-shared-jwt-access-secret-min-32-chars}" \
    node:20-alpine \
    node /scripts/product-service-shadow-compare.mjs

  if [[ "$PRODUCT_COMPARE_FULL_STACK" == "1" ]]; then
    echo "==> Running API Gateway product-service shadow compare from Docker network"
    docker run --rm \
      --network product-service-shadow_default \
      -v "$REPO_ROOT/scripts:/scripts:ro" \
      -e PRODUCT_NEST_BASE_URL=http://api-gateway-nest:8080 \
      -e PRODUCT_GO_BASE_URL=http://api-gateway-go:8080 \
      -e PRODUCT_COMPARE_ROUTE_PREFIX=/api/v1 \
      -e PRODUCT_COMPARE_RETRIES=60 \
      -e PRODUCT_COMPARE_SCENARIO="$PRODUCT_COMPARE_SCENARIO" \
      -e PRODUCT_COMPARE_RUN_ID="${PRODUCT_COMPARE_RUN_ID}-gw" \
      -e JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-dev-shared-jwt-access-secret-min-32-chars}" \
      node:20-alpine \
      node /scripts/product-service-shadow-compare.mjs
    verify_kafka
    if [[ "$PRODUCT_COMPARE_LOAD" == "1" ]]; then
      echo "==> Running Go API Gateway load check (${PRODUCT_LOAD_DURATION_SEC}s, concurrency=${PRODUCT_LOAD_CONCURRENCY})"
      docker run --rm \
        --network product-service-shadow_default \
        -v "$REPO_ROOT/scripts:/scripts:ro" \
        -e PRODUCT_LOAD_BASE_URL=http://api-gateway-go:8080 \
        -e PRODUCT_LOAD_ROUTE_PREFIX=/api/v1 \
        -e PRODUCT_LOAD_DURATION_SEC="$PRODUCT_LOAD_DURATION_SEC" \
        -e PRODUCT_LOAD_CONCURRENCY="$PRODUCT_LOAD_CONCURRENCY" \
        -e JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-dev-shared-jwt-access-secret-min-32-chars}" \
        node:20-alpine \
        node /scripts/product-service-shadow-load.mjs
    fi
  fi
  exit 0
fi

echo "==> Waiting for Nest product-service"
wait_for_health "$PRODUCT_NEST_BASE_URL" "Nest product-service"

echo "==> Waiting for Go product-service"
wait_for_health "$PRODUCT_GO_BASE_URL" "Go product-service"

echo "==> Running product-service shadow compare ($PRODUCT_COMPARE_SCENARIO, run=$PRODUCT_COMPARE_RUN_ID)"
PRODUCT_NEST_BASE_URL="$PRODUCT_NEST_BASE_URL" \
PRODUCT_GO_BASE_URL="$PRODUCT_GO_BASE_URL" \
PRODUCT_COMPARE_SCENARIO="$PRODUCT_COMPARE_SCENARIO" \
PRODUCT_COMPARE_ROUTE_PREFIX="$PRODUCT_COMPARE_ROUTE_PREFIX" \
PRODUCT_COMPARE_RUN_ID="$PRODUCT_COMPARE_RUN_ID" \
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-dev-shared-jwt-access-secret-min-32-chars}" \
node "$REPO_ROOT/scripts/product-service-shadow-compare.mjs"

if [[ "$PRODUCT_COMPARE_FULL_STACK" == "1" ]]; then
  verify_kafka
fi
