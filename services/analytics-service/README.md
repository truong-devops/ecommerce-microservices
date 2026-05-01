# analytics-service

Go implementation of `analytics-service`, aligned with the current NestJS service behavior.

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
- Kafka ingest from `analytics.events` with Redis + DB dedupe
- PostgreSQL storage (`analytics_events_raw`, `seller_daily_metrics`)
