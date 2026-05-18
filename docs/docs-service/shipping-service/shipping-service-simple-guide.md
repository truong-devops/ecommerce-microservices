# Shipping Service - Simple Guide

Go fulfillment service (`services/shipping-service/`). PostgreSQL + Redis; Kafka outbox khi `KAFKA_ENABLED=true`.

## 1) Gốc service

`services/shipping-service/`

## 2) Đọc nhanh (5 file)

1. `cmd/server/main.go`
2. `internal/router/router.go`
3. `internal/handler/shipping_handler.go`
4. `internal/service/shipping_service.go`
5. `internal/events/dispatcher.go`

## 3) Cấu trúc thư mục

| Path | Vai trò |
|---|---|
| `internal/config/` | Env, DB URL, Kafka topics |
| `internal/domain/` | Models, status transitions, errors |
| `internal/repository/` | Postgres: shipments, tracking, outbox, webhook idempotency |
| `internal/events/` | Outbox dispatcher, Kafka consumer (`order.events`), publisher |
| `internal/service/order_client.go` | Gọi order service khi cần |
| `migrations/` | SQL schema init |

## 4) Luồng chính

1. Consume `order.events` (khi Kafka bật) hoặc API tạo shipment.
2. Ghi shipment + history + audit + `outbox_events` trong transaction.
3. Dispatcher publish `shipping.events`; notification/analytics topics theo config.
4. Webhook carrier: idempotency qua Redis/DB.

## 5) Chạy local

```bash
docker compose up -d shipping-service postgres redis kafka
./scripts/test-shipping-service.sh
```

Port mặc định: **12018**.

## 6) Test

```bash
cd services/shipping-service && go test ./...
```
