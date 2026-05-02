# user-service

Go implementation of `user-service`.
Business logic and API behavior are aligned with `services/user-service-nest` including:

- soft-delete + revive deleted user by email
- response envelope/error codes
- Kafka `user.registered` publishing
- request-id propagation (`X-Request-ID`)

## Endpoints

- `GET /api/health`
- `GET /api/v1/health`
- `GET /api/ready`
- `GET /api/v1/ready`
- `POST /api/v1/users` (also `/api/users`)
- `GET /api/v1/users` (also `/api/users`)
- `GET /api/v1/users/{id}`
- `PATCH /api/v1/users/{id}`
- `PATCH /api/v1/users/{id}/status`
- `DELETE /api/v1/users/{id}`

## Run locally

```bash
cd services/user-service
go mod tidy
go run ./cmd/server
```

## Environment

Use local file `services/user-service/.env` (no `.env.example`).

Supported config styles:

- `DB_*` (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`) similar to old service
- or `DATABASE_URL` shortcut
- `KAFKA_*` for `user.registered` producer

## Docker

```bash
docker compose -f services/user-service/docker-compose.dev.yml up --build -d
```

## Test Kafka E2E

```bash
BASE_URL=http://localhost:3110/api/v1 bash scripts/test-user-service-go-kafka.sh
```
