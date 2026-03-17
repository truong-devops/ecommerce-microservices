# payment-service

Production-ready NestJS payment service for payment intent, webhook status sync, refund handling, and outbox-based event publishing.

## Container-first run (recommended)

Run everything for this service using Docker only:

1. `cd services/payment-service`
2. `npm run docker:up`
3. `npm run docker:migrate`
4. `npm run docker:logs`

From repo root, run smoke test:

`./scripts/test-payment-service.sh`

## Stop service

From `services/payment-service/`:

`npm run docker:down`

## Local scripts

- `npm run start:dev`
- `npm run build`
- `npm run test`

## Notes

- This service follows `docs/development/code-standards.md`.
- `docker-compose.dev.yml` starts `postgres`, `redis`, and `payment-service`.
- Environment template is `services/payment-service/.env.example`.
- Gateway provider is configurable via `PAYMENT_GATEWAY` (`mock` or `vnpay`).
- For VNPAY sandbox flow, set `PAYMENT_GATEWAY=vnpay` and fill `VNPAY_*` env values.
