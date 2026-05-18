# shipping-service

Go implementation of the shipping microservice (PostgreSQL, Redis, Kafka outbox).

## Run locally (compose)

```bash
docker compose up -d shipping-service postgres redis kafka
curl -sS http://localhost:12018/api/v1/health
```

Or service-only dev compose:

```bash
cd services/shipping-service
docker compose -f docker-compose.dev.yml up -d --build
```

## Notes

- Default stack port (root compose): **12018**
- Exposes `/api/v1/*` routes
- Consumes `order.events` when Kafka is enabled; publishes `shipping.events` via outbox dispatcher
- Legacy NestJS reference may exist in git history; **current runtime is Go**
