# payment-service

Go implementation for payment lifecycle with API/business parity target to legacy NestJS payment-service.

## Quick start

1. `cd services/payment-service`
2. `docker compose -f docker-compose.dev.yml up -d --build`
3. `BASE_URL=http://localhost:3006/api/v1 JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars ./scripts/test-payment-service.sh`
