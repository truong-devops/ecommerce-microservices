#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

SERVICES_NPM=(
  "auth-service"
  "order-service"
  "payment-service"
  "inventory-service"
  "shipping-service"
  "notification-service"
  "analytics-service"
  "cart-service"
  "product-service"
)

SERVICES_GO=(
  "review-service"
  "user-service"
)

PIDS=()

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

start_npm_service() {
  local service="$1"
  local env_file="$ROOT_DIR/services/$service/.env.local"
  local service_dir="$ROOT_DIR/services/$service"

  if [[ ! -f "$env_file" ]]; then
    echo "[skip] services/$service/.env.local not found"
    return
  fi

  echo "==> Starting $service (npm start:dev)"
  bash -lc '
    set -euo pipefail
    env_file="$1"
    service_dir="$2"
    service_name="$3"
    unset TS_NODE_COMPILER_OPTIONS TS_NODE_PROJECT TS_NODE_FILES || true
    set -a
    source "$env_file"
    set +a
    cd "'"$ROOT_DIR"'"
    npm run start:dev --workspace "services/$service_name"
  ' _ "$env_file" "$service_dir" "$service" &
  PIDS+=("$!")
}

start_go_service() {
  local service="$1"
  local env_file="$ROOT_DIR/services/$service/.env.local"
  local service_dir="$ROOT_DIR/services/$service"

  if [[ ! -f "$env_file" ]]; then
    echo "[skip] services/$service/.env.local not found"
    return
  fi

  echo "==> Starting $service (go run)"
  bash -lc '
    set -euo pipefail
    env_file="$1"
    service_dir="$2"
    set -a
    source "$env_file"
    set +a
    cd "$service_dir"
    go run ./cmd/server
  ' _ "$env_file" "$service_dir" &
  PIDS+=("$!")
}

cleanup() {
  echo
  echo "==> Stopping local service processes..."
  for pid in "${PIDS[@]:-}"; do
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done

  echo "==> Keeping infrastructure running."
  echo "   Stop infra manually: docker compose -f docker-compose.local.yml down"
}

trap cleanup INT TERM

require_cmd docker
require_cmd npm
require_cmd go

if [[ ! -f "$LOCAL_COMPOSE_FILE" ]]; then
  echo "Missing $LOCAL_COMPOSE_FILE" >&2
  exit 1
fi

INFRA_SERVICES=(
  "zookeeper"
  "kafka"
  "postgres"
  "redis"
  "mongo"
  "api-gateway"
)

echo "==> Starting local infrastructure from docker-compose.local.yml"
docker compose -f "$LOCAL_COMPOSE_FILE" up -d --remove-orphans "${INFRA_SERVICES[@]}"

for svc in "${SERVICES_NPM[@]}"; do
  start_npm_service "$svc"
done

for svc in "${SERVICES_GO[@]}"; do
  start_go_service "$svc"
done

echo
echo "==> All local services started (api-gateway runs in Docker)."
echo "Press Ctrl+C to stop local processes."

wait || true
