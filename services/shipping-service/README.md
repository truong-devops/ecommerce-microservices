# shipping-service

Go implementation of shipping-service.

## Run locally (container-first)

1. `cd services/shipping-service`
2. `docker compose -f docker-compose.dev.yml up -d --build`
3. Health check: `curl -sS http://localhost:3008/api/v1/health`

## Notes

- Previous NestJS implementation is now in `services/shipping-service-nest`.
- Exposes both `/api/v1/*` and compatibility `/api/*` routes.
- Kafka order consumer auto-creates shipment from `order.created`.
