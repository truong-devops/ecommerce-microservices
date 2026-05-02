# Analytics Service - Simple Guide

Tai lieu nay giai thich ngan gon `analytics-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

`services/analytics-service/`

## 2) Doc tu dau de hieu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/analytics_handler.go`
3. `internal/service/analytics_service.go`
4. `internal/repository/analytics_repository.go`
5. `internal/events/analytics_events_consumer.go`

## 3) Architecture tong quat

- Runtime: Go 1.22.
- Storage: ClickHouse (`analytics_events_raw`).
- Async ingest: Kafka consumer topic `analytics.events`.
- Idempotency ingest: Redis optional (`REDIS_ENABLED=true`) và fallback dedupe bằng ClickHouse.
- AuthZ: JWT auth và role check middleware.

## 4) Thu muc/file chinh

- `internal/middleware/`: auth, RBAC, logger, request ID.
- `internal/config/`: map env cho app/clickhouse/redis/kafka/ingest, startup validation.
- `internal/repository/`: insert/query ClickHouse.
- `internal/service/analytics_event_normalizer.go`: parse event + hash `eventKey`.
- `internal/service/analytics_service.go`: business scope, date-range validation, query orchestration.
- `internal/events/analytics_events_consumer.go`: Kafka consumer lifecycle.

## 5) API chinh

Controller support ca 2 path:

- `/api/v1/analytics/*`
- `/api/analytics/*`

Endpoints:

- `GET /overview?from&to&sellerId?`
- `GET /events/timeseries?from&to&interval=hour|day&eventType?`
- `GET /payments/summary?from&to&sellerId?`
- `GET /shipping/summary?from&to&sellerId?`

Role access:

- `SELLER | ADMIN | SUPPORT | SUPER_ADMIN`
- Seller always bi scope ve `sellerId = userId`.

## 6) Kafka ingest flow

1. Consumer subscribe topic `analytics.events`.
2. Parse message JSON `{ eventType, payload, occurredAt }`.
3. Build deterministic `eventKey = sha256(eventType + canonical(payload) + occurredAt)`.
4. Dedupe qua Redis (neu bat), fallback ClickHouse.
5. Insert row vao `analytics_events_raw`.

## 7) ClickHouse schema

Migration: `migrations/0001_init_analytics_service.sql`

Table: `ecommerce_analytics.analytics_events_raw`

- Core columns: `event_key`, `event_type`, `occurred_at`, `seller_id`, `user_id`, `order_id`, `payment_id`, `shipment_id`, `amount`, `refunded_amount`, `currency`, `status`, `payload_json`.
- Engine: `MergeTree`.
- Partition: theo thang (`toYYYYMM(occurred_at)`).
- TTL: 365 ngay.

## 8) Health endpoints

- `GET /health` và `GET /api/v1/health`
- `GET /ready` và `GET /api/v1/ready`
- `GET /live` và `GET /api/v1/live`

Readiness check:

- ClickHouse ping
- Redis ping (neu enabled)

## 9) Chay local nhanh

Tu `services/analytics-service/`:

1. Start dependencies (ClickHouse, Kafka, Redis)
2. `go run cmd/server/main.go`

Smoke test tu root repo:

`./scripts/test-analytics-service.sh`

## 10) Test strategy

- Unit test: normalizer + analytics service logic.
- E2E test: health, unauthorized, forbidden, validation fail, overview happy path.
