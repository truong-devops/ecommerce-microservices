# shipping-service

Production-ready NestJS shipping service for shipment lifecycle and tracking.

## Container-first run (recommended)

Run everything for this service using Docker only:

1. `cd services/shipping-service`
2. `npm run docker:up`
3. `npm run docker:migrate`
4. `npm run docker:logs`

From repo root, run smoke test:

`./scripts/test-shipping-service.sh`

## Stop service

From `services/shipping-service/`:

`npm run docker:down`

## Local scripts

- `npm run start:dev`
- `npm run build`
- `npm run test`

## Notes

- This service follows `docs/development/code-standards.md`.
- `docker-compose.dev.yml` starts `postgres`, `redis`, and `shipping-service`.
- Environment template is `services/shipping-service/.env.example`.
