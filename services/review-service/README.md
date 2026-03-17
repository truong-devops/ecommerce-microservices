# review-service

Production-ready NestJS review service for marketplace product reviews.

## Container-first run (recommended)

1. `cd services/review-service`
2. `npm run docker:up`
3. `npm run docker:logs`

From repo root, run smoke test:

`./scripts/test-review-service.sh`

## Stop service

From `services/review-service/`:

`npm run docker:down`

## Local scripts

- `npm run start:dev`
- `npm run build`
- `npm run test`

## Notes

- This service follows `docs/development/code-standards.md`.
- `docker-compose.dev.yml` starts `mongo` and `review-service`.
- Environment template is `services/review-service/.env.example`.
