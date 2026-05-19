# analytics-service

Go implementation of `analytics-service`.

- Auth + role guard (`SELLER | ADMIN | SUPPORT | SUPER_ADMIN`)
- Response envelope (`success`, `data`, `meta`)
- Health endpoints:
  - `GET /api/v1/health|ready|live`
  - `GET /api/health|ready|live`
- Analytics endpoints:
  - `GET /api/v1/analytics/overview`
  - `GET /api/v1/analytics/events/timeseries`
  - `GET /api/v1/analytics/payments/summary`
  - `GET /api/v1/analytics/shipping/summary`
  - same aliases under `/api/analytics/*`
- FP-Growth recommendation endpoints:
  - `GET /api/v1/analytics/recommendations/products/{productId}`
  - `POST /api/v1/analytics/recommendations/cart`
  - `GET /api/v1/analytics/recommendations/insights`
  - `POST /api/v1/analytics/recommendations/train` (`ADMIN | SUPER_ADMIN`)
- Kafka ingest from `analytics.events` with Redis + DB dedupe
- PostgreSQL storage (`analytics_events_raw`, `seller_daily_metrics`, `recommendation_*`)

## Recommendations

FP-Growth training runs inside `analytics-service`; no separate recommendation service is required.

Daily flow:

```txt
02:00
analytics-service -> order-service: fetch completed orders from the last 90 days
analytics-service: normalize order items into recommendation transactions
analytics-service: run FP-Growth and replace recommendation_rules
```

Request flow:

```txt
buyer-web -> api-gateway -> analytics-service
analytics-service: read precomputed recommendation_rules
```

## Recommendation Environment

Set these in `analytics-service`:

```txt
RECOMMENDATION_ENABLED=true
RECOMMENDATION_TRAINING_ENABLED=false
RECOMMENDATION_TRAINING_HOUR=2
RECOMMENDATION_WINDOW_DAYS=90
RECOMMENDATION_MIN_SUPPORT_COUNT=3
RECOMMENDATION_MIN_CONFIDENCE=0.15
RECOMMENDATION_MAX_ANTECEDENT_SIZE=3
RECOMMENDATION_MAX_RULES=5000
RECOMMENDATION_ORDER_FETCH_PAGE_SIZE=500
ORDER_SERVICE_BASE_URL=http://order-service:8080
ORDER_SERVICE_INTERNAL_TOKEN=<same value as order-service INTERNAL_SERVICE_TOKEN>
```

Set this in `order-service` so only trusted services can read internal completed orders:

```txt
INTERNAL_SERVICE_TOKEN=<shared service token>
```

For local demos with little data, lower `RECOMMENDATION_MIN_SUPPORT_COUNT` to `1` or `2`.

## Manual Training

After both services are running and the internal token is configured:

```txt
curl -X POST \
  -H "Authorization: Bearer <admin_or_super_admin_jwt>" \
  http://localhost:<gateway-port>/api/v1/analytics/recommendations/train
```

Product recommendations are public through the gateway:

```txt
curl "http://localhost:<gateway-port>/api/v1/analytics/recommendations/products/<product-id>?limit=8"
```

## Local Backfill

For a local database without enough multi-item completed orders, load the seed file and train rules from it:

```txt
RECOMMENDATION_MIN_SUPPORT_COUNT=2 \
go run ./cmd/backfill-recommendations \
  -file testdata/recommendation_completed_orders.json
```

The command rewrites `completedAt` values into the current recommendation window by default. The seed file uses product IDs from the local product-service data so the frontend can hydrate real product cards.
