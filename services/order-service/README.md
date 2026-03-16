# order-service

Production-ready NestJS order service for order lifecycle management.

## Container-first run (recommended)

Run everything for this service using Docker only:

1. `cd services/order-service`
2. `npm run docker:up`
3. `npm run docker:migrate`
4. `npm run docker:logs`

From repo root, run smoke test:

`./scripts/test-order-service.sh`

## Stop service

From `services/order-service/`:

`npm run docker:down`

## Notes

- This service is designed to run container-first for local dev and deployment parity.
- `docker-compose.dev.yml` starts `postgres`, `redis`, and `order-service`.
- Postgres/Redis are internal-only in this compose file (no host port publish) to avoid port conflicts.
- Environment template is `services/order-service/.env.example`.
