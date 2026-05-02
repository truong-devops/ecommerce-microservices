# inventory-service

Go implementation for inventory lifecycle management with API/business parity target to legacy NestJS inventory-service.

## Container-first run

1. `cd services/inventory-service`
2. `docker compose -f docker-compose.dev.yml up -d --build`
3. Smoke test from repo root:

`BASE_URL=http://localhost:3007/api/v1 JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars ./scripts/test-inventory-service.sh`
