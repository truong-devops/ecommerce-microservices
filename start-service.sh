#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
ELK_COMPOSE_FILE="$ROOT_DIR/docker-compose.elk.yml"

usage() {
  cat <<'USAGE'
Usage:
  ./start-service.sh [--elk] [--build] [--down]

Options:
  --elk     Start the local stack with Filebeat, Logstash, Elasticsearch, and Kibana.
  --build   Build images before starting containers.
  --down    Stop the selected local stack instead of starting it.
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

WITH_ELK=false
WITH_BUILD=false
DOWN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --elk)
      WITH_ELK=true
      ;;
    --build)
      WITH_BUILD=true
      ;;
    --down)
      DOWN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_cmd docker

compose_args=(-f "$BASE_COMPOSE_FILE")
if [[ "$WITH_ELK" == "true" ]]; then
  compose_args+=(-f "$ELK_COMPOSE_FILE")
fi

if [[ "$DOWN" == "true" ]]; then
  docker compose "${compose_args[@]}" down
  exit 0
fi

up_args=(up -d --remove-orphans)
if [[ "$WITH_BUILD" == "true" ]]; then
  up_args+=(--build)
fi

docker compose "${compose_args[@]}" "${up_args[@]}"

echo
echo "Local stack is running."
echo "API Gateway: http://localhost:12000"
if [[ "$WITH_ELK" == "true" ]]; then
  echo "Kibana:      http://localhost:5601"
  echo "Elasticsearch index pattern: ecommerce-logs-local-*"
fi
