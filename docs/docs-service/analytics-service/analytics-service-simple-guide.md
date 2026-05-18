# Analytics Service - Simple Guide

Go analytics service (`services/analytics-service/`). Storage: **PostgreSQL** (not ClickHouse in the default stack).

## 1) Gốc service

`services/analytics-service/`

## 2) Đọc nhanh (5 file)

1. `cmd/server/main.go`
2. `internal/handler/analytics_handler.go`
3. `internal/service/analytics_service.go`
4. `internal/repository/analytics_repository.go`
5. `internal/events/analytics_events_consumer.go` (khi `KAFKA_ENABLED=true`)

## 3) Kiến trúc

| Thành phần | Chi tiết |
|---|---|
| Runtime | Go 1.24 |
| Storage | PostgreSQL: `analytics_events_raw`, `seller_daily_metrics` |
| Async | Kafka topic `analytics.events` (optional in compose) |
| Dedupe | Redis optional; DB unique `event_key` |
| Auth | JWT + role middleware |

## 4) API chính

Prefix: `/api/v1/analytics/*`

- `GET /overview?from&to&sellerId?`
- `GET /events/timeseries?from&to&interval=hour|day&eventType?`
- `GET /payments/summary?from&to&sellerId?`
- `GET /shipping/summary?from&to&sellerId?`

Roles: `SELLER | ADMIN | SUPPORT | SUPER_ADMIN` (seller scoped to own `sellerId`).

## 5) Ingest flow

1. Consumer nhận `analytics.events`.
2. Normalize payload → `eventKey` (hash).
3. Dedupe Redis (nếu bật) + insert Postgres.
4. Rollups vào `seller_daily_metrics` theo logic service.

## 6) Schema

`migrations/0001_init_analytics_service.sql` — bảng Postgres với `event_key` PK, `payload_json` JSONB.

## 7) Health

- `/health`, `/ready`, `/live` (+ `/api/v1/...` aliases)
- Readiness: Postgres ping; Redis khi enabled

## 8) Chạy & test

```bash
docker compose up -d analytics-service postgres redis
cd services/analytics-service && go test ./...
./scripts/test-analytics-service.sh
```

Port mặc định: **12021**.
