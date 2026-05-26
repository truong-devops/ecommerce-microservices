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
- Nexus Express outbound is disabled by default. Set `NEXUS_WEBHOOK_ENABLED=true` with the production partner code/webhook secret to verify ping while `NEXUS_ENABLED=false`; enable outbound only after health, ping, mapping and controlled-test approval pass.
- With outbound enabled, only sellers listed in `NEXUS_MERCHANT_MAPPING_FILE` are sent to Nexus.
- Nexus webhook endpoint: `POST /api/v1/shipments/webhooks/nexus`.
- Legacy NestJS reference may exist in git history; **current runtime is Go**

Run the signed Nexus health check before enabling outbound create-order calls:

```bash
NEXUS_BASE_URL=https://ops.nexus-ex.site \
NEXUS_PARTNER_CODE='<secret-runtime-value>' \
NEXUS_API_KEY='<secret-runtime-value>' \
NEXUS_API_SECRET='<secret-runtime-value>' \
go run ./cmd/nexus-healthcheck
```
