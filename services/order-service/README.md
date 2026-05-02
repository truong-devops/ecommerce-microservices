# order-service

Go implementation for order lifecycle management.

## Container-first run

1. `cd services/order-service`
2. `docker compose -f docker-compose.dev.yml up -d --build`
3. Smoke test from repo root:

`BASE_URL=http://localhost:3011/api/v1 JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars ./scripts/test-order-service.sh`
