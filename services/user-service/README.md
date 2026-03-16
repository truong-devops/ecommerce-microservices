# user-service

NestJS user domain service in ecommerce monorepo.

## API

- `GET /api/v1/health` and `GET /api/health`
- `POST /api/v1/users`
- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `PATCH /api/v1/users/:id`
- `PATCH /api/v1/users/:id/status`
- `DELETE /api/v1/users/:id`

## Environment

Copy `.env.example` to `.env.dev` and update values:

- `DB_*` for PostgreSQL connection
- `KAFKA_*` for publishing `user.registered`

## Run

From repository root:

- `npm run dev --workspace services/user-service`
- `npm run build --workspace services/user-service`
- `npm run start --workspace services/user-service`

## Docker

Run `user-service` + PostgreSQL in isolation:

- `docker compose -f services/user-service/docker-compose.dev.yml up --build -d`
- Health check: `curl http://localhost:3100/api/v1/health`
- Stop: `docker compose -f services/user-service/docker-compose.dev.yml down`
- Stop + remove DB volume: `docker compose -f services/user-service/docker-compose.dev.yml down -v`

Build production image:

- `docker build -f services/user-service/Dockerfile.prod -t user-service:prod services/user-service`
- `docker run --rm -p 3000:3000 --env-file services/user-service/.env.dev user-service:prod`

When running container with local PostgreSQL container, set `DB_HOST` to that container name (not `localhost`).

## Migration

- `npm run migration:run --workspace services/user-service`
- `npm run migration:revert --workspace services/user-service`

## Test

- `npm run test:e2e --workspace services/user-service`

The e2e suite uses `sqljs` in test mode and mocks Kafka publisher.
