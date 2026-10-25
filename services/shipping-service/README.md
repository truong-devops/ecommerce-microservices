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

## Reconnect Nexus with the root Compose stack

The root Compose stack injects Nexus credentials from the repository-level
`.env` and mounts a local seller allowlist at
`/run/config/nexus-merchants.json`. Never commit either the real credentials or
`services/shipping-service/config/nexus-merchant-mappings.json`.

1. Copy the tracked mapping example to the ignored runtime file and replace the
   seller IDs with only the shops approved by Nexus:

   ```bash
   cp services/shipping-service/config/nexus-merchant-mappings.example.json \
     services/shipping-service/config/nexus-merchant-mappings.json
   ```

   Do not reuse the legacy `HCM-001` or `HN-001` hub codes. Nexus now routes
   from the seller province/ward (and optional coordinates), so omit
   `provinceHubMappings` unless Nexus explicitly supplies a current postal hub
   code.

2. Put the production credentials and host mapping path in the root `.env`.
   Keep outbound disabled for the first restart:

   ```env
   NEXUS_ENABLED=false
   NEXUS_WEBHOOK_ENABLED=true
   NEXUS_BASE_URL=https://ops.nexus-ex.site
   NEXUS_PARTNER_CODE=<provided-by-nexus>
   NEXUS_API_KEY=<provided-by-nexus>
   NEXUS_API_SECRET=<provided-by-nexus>
   NEXUS_WEBHOOK_SECRET=<provided-by-nexus>
   NEXUS_MERCHANT_MAPPING_FILE_HOST=./services/shipping-service/config/nexus-merchant-mappings.json
   NEXUS_AUTO_CREATE_PICKUP=false
   ```

3. Recreate the service, run the signed health check, then ask Nexus to ping the
   public webhook `POST /api/v1/shipments/webhooks/nexus`:

   ```bash
   docker compose up -d --build --force-recreate shipping-service api-gateway
   docker compose exec shipping-service /nexus-healthcheck
   docker compose logs --since=10m --no-color shipping-service
   ```

4. Only after health and webhook verification succeed, set
   `NEXUS_ENABLED=true` and recreate `shipping-service`. Keep
   `NEXUS_AUTO_CREATE_PICKUP=false` for the first controlled order. Only new
   `CONFIRMED` order events create Nexus requests; existing internal shipments
   are not backfilled automatically.
