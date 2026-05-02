# Notification Service - Simple Guide

Tai lieu nay giai thich ngan gon `notification-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/notification-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/notification_handler.go`
3. `internal/service/notification_service.go`
4. `internal/events/notification_events_consumer.go`
5. `internal/events/notification_dispatcher.go`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng nghiệp vụ.

## 3) Thu muc/file dung de lam gi?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, gắn middleware, router.
- `internal/config/`: map biến môi trường thành object config app/db/redis/jwt/dispatch/kafka.
- Validate env bằng struct tags.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi JSON.

### Notifications module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API notifications (`chi` router).
- `internal/service/`: logic manual campaign, list/get/mark read, map event vào notification record.
- `internal/events/`: consume topic `notification.events` với idempotency và worker dispatcher chạy nền.
- `internal/provider/`: mock provider để dispatch.

### Entity + Repository

- `internal/domain/`: schema entities notifications, attempts, inbox events.
- `internal/repository/`: thao tác DB theo từng bảng.

### Health module

- `internal/handler/health.go`: `/health`, `/ready`, `/live`.

### Migration

- `migrations/0001_init_notification_service.sql`: tao schema notifications/attempts/inbox.

## 4) Luong request tong quat

1. Request vào API `/api/v1/*`.
2. Middleware gắn `x-request-id`, kiểm tra token và role.
3. Handler nhận request và gọi method trong `service`.
4. Service validate nghiệp vụ và gọi repository.
5. Handler dùng `httpx` trả response chuẩn hoặc trả lỗi JSON.

## 5) Luong event consume (Kafka -> DB)

1. `notification-events-consumer.service.ts` subscribe topic `notification.events`.
2. Moi message parse thanh `{ eventType, payload }`.
3. Tao `eventKey` hash de idempotency.
4. `notifications.service.handleIncomingEvent(...)`:
- insert `inbox_events` (unique `event_key`)
- map event sang 1..n notification records
- insert `notifications`
5. Neu duplicate `event_key` thi bo qua (khong tao trung notification).

## 6) Luong dispatch retry (DB -> Provider)

1. `notification-dispatcher.service.ts` chay timer theo `DISPATCH_INTERVAL_MS`.
2. Lay batch records `PENDING` hoac `FAILED` den han retry.
3. Goi provider (`mock-notification-provider.service.ts`).
4. Thanh cong:
- ghi `notification_attempts` status `SENT`
- update `notifications.status = SENT`, set `sentAt`
5. That bai:
- ghi `notification_attempts` status `FAILED`
- tang `retryCount`
- set `nextRetryAt` theo exponential backoff (cap 300s)

## 7) Danh sach API chinh

Base prefix: `/api/v1`

### Health

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)

### Notifications

- `POST /notifications` (`ADMIN|SUPPORT|SUPER_ADMIN`) - tao manual campaign notifications
- `GET /notifications` (`CUSTOMER|ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - list notifications
- `GET /notifications/:id` (same roles) - chi tiet notification
- `PATCH /notifications/:id/read` (same roles) - mark read

Rule doc du lieu:
- `CUSTOMER` chi doc duoc notification cua chinh minh (`recipientId = userId`).
- Staff roles doc duoc toan bo.

## 8) Event types dang xu ly

- `auth.email.verification.requested`
- `auth.password.reset.requested`
- `auth.email.verified`
- `auth.password.reset.completed`
- `order.created`
- `order.cancelled`
- `order.status-updated`
- `order.delivered`
- `shipment.created`
- `shipment.status-updated`
- `shipment.delivered`
- `shipment.failed`
- `shipment.cancelled`

## 9) Chay local nhanh (Docker)

Tu `services/notification-service/`:

1. `npm run docker:up`
2. `npm run docker:migrate`
3. `npm run docker:logs`

Smoke test tu root repo:

`./scripts/test-notification-service.sh`

## 10) File nen doc theo thu tu

1. `cmd/server/main.go`
2. `internal/handler/notification_handler.go`
3. `internal/service/notification_service.go`
4. `internal/repository/`
5. `internal/domain/`
6. `internal/events/notification_events_consumer.go`
7. `internal/events/notification_dispatcher.go`
8. `migrations/0001_init_notification_service.sql`
9. `scripts/test-notification-service.sh` (ở root repo)
