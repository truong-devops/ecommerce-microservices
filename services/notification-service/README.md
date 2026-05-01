# notification-service

Go implementation of `notification-service` with API/auth/business behavior aligned to the legacy NestJS service.

## Endpoints

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
- `POST /api/v1/notifications`
- `GET /api/v1/notifications`
- `GET /api/v1/notifications/{id}`
- `PATCH /api/v1/notifications/{id}/read`

## Run locally

```bash
cd services/notification-service
cp .env.example .env
GOCACHE=../../.gocache GOMODCACHE=../../.gomodcache go run ./cmd/server
```

## Test parity (smoke)

From repo root:

```bash
BASE_URL=http://localhost:3009/api/v1 JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars ./scripts/test-notification-service.sh
```

## Notes

- Uses PostgreSQL for notifications/inbox/attempts.
- Uses Redis for JWT revocation check when `REDIS_ENABLED=true`.
- Includes Kafka consumer for `notification.events` and background dispatcher with retry backoff.
