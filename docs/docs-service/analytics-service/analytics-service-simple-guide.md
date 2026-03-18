# Analytics Service - Simple Guide

Tai lieu nay giai thich ngan gon `analytics-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

`services/analytics-service/`

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/analytics/controllers/analytics.controller.ts`
4. `src/modules/analytics/services/analytics.service.ts`
5. `src/modules/analytics/repositories/analytics.repository.ts`
6. `src/modules/analytics/services/analytics-events-consumer.service.ts`

## 3) Architecture tong quat

- Runtime: NestJS + TypeScript.
- Storage: ClickHouse (`analytics_events_raw`).
- Async ingest: Kafka consumer topic `analytics.events`.
- Idempotency ingest: Redis optional (`REDIS_ENABLED=true`) va fallback dedupe bang ClickHouse.
- AuthZ: global `JwtAuthGuard` + `RolesGuard`.

## 4) Thu muc/file chinh

- `src/common/*`: decorators, guards, filter, interceptors, middleware, logger, redis helper.
- `src/config/configuration.ts`: map env cho app/clickhouse/redis/kafka/ingest.
- `src/config/env.validation.ts`: Joi schema cho startup validation.
- `src/modules/analytics/repositories/analytics.repository.ts`: insert/query ClickHouse.
- `src/modules/analytics/services/analytics-event-normalizer.service.ts`: parse event + hash `eventKey`.
- `src/modules/analytics/services/analytics.service.ts`: business scope, date-range validation, query orchestration.
- `src/modules/analytics/services/analytics-events-consumer.service.ts`: Kafka consumer lifecycle.

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

- `GET /api/v1/health` va `GET /api/health`
- `GET /api/v1/ready` va `GET /api/ready`
- `GET /api/v1/live` va `GET /api/live`

Readiness check:

- ClickHouse ping
- Redis ping (neu enabled)

## 9) Chay local nhanh

Tu `services/analytics-service/`:

1. `npm run docker:up`
2. `npm run docker:migrate`
3. `npm run docker:logs`

Smoke test tu root repo:

`./scripts/test-analytics-service.sh`

## 10) Test strategy

- Unit test: normalizer + analytics service logic.
- E2E test: health, unauthorized, forbidden, validation fail, overview happy path.
