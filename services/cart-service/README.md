# cart-service

Go implementation for cart-service with API/business parity target to legacy NestJS cart-service.

## Container-first run

1. `cd services/cart-service`
2. `docker compose -f docker-compose.dev.yml up -d --build`
3. Smoke test from repo root:

`BASE_URL=http://localhost:3011/api/v1 JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars RUN_E2E=0 KEEP_UP=1 ./scripts/test-cart-service.sh`
