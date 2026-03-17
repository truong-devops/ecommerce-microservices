# inventory-service

Production-ready NestJS inventory service for stock adjustments and order reservations.

## Container-first run (recommended)

1. `cd services/inventory-service`
2. `npm run docker:up`
3. `npm run docker:migrate`
4. `npm run docker:logs`
5. `npm run docker:test`

## Stop service

From `services/inventory-service/`:

`npm run docker:down`

## API routes

Health (public):

- `GET /api/v1/health`, `GET /api/health`
- `GET /api/v1/ready`, `GET /api/ready`
- `GET /api/v1/live`, `GET /api/live`

Inventory:

- `GET /api/v1/inventory/validate?sku=SKU-1&quantity=2` (public)
- `GET /api/inventory/validate?sku=SKU-1&quantity=2` (public)
- `GET /api/v1/inventory/stocks/:sku`
- `PATCH /api/v1/inventory/stocks/:sku/adjust`
- `POST /api/v1/inventory/reservations`
- `POST /api/v1/inventory/reservations/:orderId/release`
- `POST /api/v1/inventory/reservations/:orderId/confirm`

## Notes

- Backing DB: PostgreSQL.
- Reservation default TTL: 10 minutes (`RESERVATION_DEFAULT_TTL_MINUTES`).
- Domain events are persisted through outbox and published to Kafka topic `inventory.events`.
- Smoke test script: `scripts/test-inventory-service.sh`.
