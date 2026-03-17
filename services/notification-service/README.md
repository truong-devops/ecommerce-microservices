# notification-service

Production-ready NestJS notification service for async event notifications and manual campaign send.

## Container-first run (recommended)

Run everything for this service using Docker only:

1. `cd services/notification-service`
2. `npm run docker:up`
3. `npm run docker:migrate`
4. `npm run docker:logs`

From repo root, run smoke test:

`./scripts/test-notification-service.sh`

## Stop service

From `services/notification-service/`:

`npm run docker:down`

## Local scripts

- `npm run start:dev`
- `npm run build`
- `npm run test`

## Notes

- This service follows `docs/development/code-standards.md`.
- `docker-compose.dev.yml` starts `postgres`, `redis`, and `notification-service`.
- Environment template is `services/notification-service/.env.example`.
