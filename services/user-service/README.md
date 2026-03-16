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

## Migration

- `npm run migration:run --workspace services/user-service`
- `npm run migration:revert --workspace services/user-service`

## Test

- `npm run test:e2e --workspace services/user-service`

The e2e suite uses `sqljs` in test mode and mocks Kafka publisher.
