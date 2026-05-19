# Local setup and compose boundaries

## Compose ownership

- Root `docker-compose.yml`: minimal project-level bootstrap and local defaults.
- `infrastructure/docker/docker-compose.*.yml`: environment-specific infrastructure stack.
- `services/<name>/docker-compose*.yml`: service-local overrides for isolated development.

Use root compose as the default entrypoint to avoid drifting startup commands.

## Suggested flow

1. Start infra dependencies from `infrastructure/docker/docker-compose.dev.yml`.
2. Run service(s) you are actively developing from each service package.
3. Keep environment values in `.env.dev`, `.env.staging`, `.env.prod`.

## Monorepo task runner

This repository uses Turbo for build/test/lint orchestration.

## FP-Growth recommendations

Recommendation training is owned by `services/analytics-service`. It reads completed orders through the internal `order-service` API, runs FP-Growth offline, and serves precomputed rules at request time.

### Required env

Use the same service token in both services.

`services/order-service`:

```txt
INTERNAL_SERVICE_TOKEN=local-recommendation-token
```

`services/analytics-service`:

```txt
RECOMMENDATION_ENABLED=true
RECOMMENDATION_TRAINING_ENABLED=false
RECOMMENDATION_TRAINING_HOUR=2
RECOMMENDATION_WINDOW_DAYS=90
RECOMMENDATION_MIN_SUPPORT_COUNT=2
RECOMMENDATION_MIN_CONFIDENCE=0.15
RECOMMENDATION_MAX_ANTECEDENT_SIZE=3
RECOMMENDATION_MAX_RULES=5000
RECOMMENDATION_ORDER_FETCH_PAGE_SIZE=500
ORDER_SERVICE_BASE_URL=http://localhost:3011
ORDER_SERVICE_INTERNAL_TOKEN=local-recommendation-token
```

Keep `RECOMMENDATION_TRAINING_ENABLED=false` while testing manually. Enable it when the local scheduler should run daily at `RECOMMENDATION_TRAINING_HOUR`.

### Local verification flow

1. Start `order-service`, `analytics-service`, `api-gateway`, and the frontend app you are checking.
2. Make sure the order database has completed orders with at least two distinct product IDs.
3. If you do not have enough completed orders, seed analytics directly:

```txt
cd services/analytics-service
RECOMMENDATION_MIN_SUPPORT_COUNT=2 \
go run ./cmd/backfill-recommendations \
  -file testdata/recommendation_completed_orders.json
```

The seed file uses product IDs from the local product-service data so frontend hydration can display real product cards.

4. Run a manual train with an admin JWT when you want to train from `order-service` data:

```txt
curl -X POST \
  -H "Authorization: Bearer <admin_or_super_admin_jwt>" \
  http://localhost:<gateway-port>/api/v1/analytics/recommendations/train
```

5. Check product recommendations through the gateway:

```txt
curl "http://localhost:<gateway-port>/api/v1/analytics/recommendations/products/<product-id>?limit=8"
```

6. Check cart recommendations with a buyer/admin JWT:

```txt
curl -X POST \
  -H "Authorization: Bearer <buyer_or_admin_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"productIds":["<product-id-1>","<product-id-2>"],"limit":8}' \
  http://localhost:<gateway-port>/api/v1/analytics/recommendations/cart
```

7. Check seller insights with a seller/admin JWT:

```txt
curl -H "Authorization: Bearer <seller_or_admin_jwt>" \
  "http://localhost:<gateway-port>/api/v1/analytics/recommendations/insights?limit=20"
```
