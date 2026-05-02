# Payment Service - Simple Guide

Tai lieu nay giai thich ngan gon `payment-service` trong monorepo de de onboard, van hanh va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/payment-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/payment_handler.go`
3. `internal/service/payment_service.go`
4. `internal/repository/payment_repository.go`
5. `internal/events/outbox_dispatcher.go`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng nghiệp vụ.

## 3) Thu muc/file dung de lam gi?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, prefix `/api/v1`, global middleware.
- `internal/config/`: load env cho app/db/redis/jwt/kafka/payment gateway.

### Cấu hình

- `internal/config/config.go`: map biến môi trường thành struct.
- Validate env khi khởi động.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi.

### Payments module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API payment (`chi` router).
- `internal/service/`: logic payment intent, webhook callback, refund, chargeback basic, xử lý idempotency.
- `internal/repository/`: thao tác DB theo từng bảng (payments, transactions, history, audit, idempotency, outbox).
- `internal/events/`: publish Kafka đến `payment.events`, xử lý outbox dispatcher.
- `internal/provider/` (hoặc tương đương): tích hợp gateway (mock và VNPAY).

### Health module

- `internal/handler/health.go`: `/health`, `/ready`, `/live`.

### Migration

- `migrations/0001_init_payment_service.sql`: tao toan bo schema payment.

### Test

- `scripts/test-payment-service.sh` (ở root repo): smoke test API end-to-end.

## 4) Luong request tong quat

1. Request vào API `/api/v1/*`.
2. Middleware gắn `x-request-id`, kiểm tra JWT token, và kiểm tra role.
3. Handler nhận request, validate input và gọi method tương ứng trong `service`.
4. Service validate nghiệp vụ + state transition + ownership.
5. Write APIs chạy transaction (`pgx`) để ghi business data + outbox trong cùng DB transaction.
6. Handler dùng `httpx` trả envelope thành công.
7. Nếu lỗi, handler trả envelope lỗi + business error code.

## 5) API chinh

Base prefix: `/api/v1`

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)
- `POST /payments/intents` (`CUSTOMER`, bat buoc `Idempotency-Key`)
- `GET /payments` (`CUSTOMER|ADMIN|SUPPORT|SUPER_ADMIN`, role-scoped list + pagination)
- `GET /payments/:id` (role-scoped read)
- `GET /payments/order/:orderId` (role-scoped read by order)
- `POST /payments/:id/refunds` (`CUSTOMER|ADMIN|SUPPORT`, rule checks)
- `GET /payments/:id/refunds` (`CUSTOMER|ADMIN|SUPPORT|SUPER_ADMIN`)
- `POST /payments/webhooks/:provider` (public webhook, idempotency by provider event)

## 6) Payment status va transition

### PaymentStatus

- `PENDING`
- `REQUIRES_ACTION`
- `AUTHORIZED`
- `CAPTURED`
- `FAILED`
- `CANCELLED`
- `PARTIALLY_REFUNDED`
- `REFUNDED`
- `CHARGEBACK`

### RefundStatus

- `PENDING`
- `SUCCEEDED`
- `FAILED`

Service validate transition hop le. Transition sai tra `422` voi code `INVALID_PAYMENT_STATUS_TRANSITION`.

## 7) Idempotency (quan trong)

### Create payment intent

- Key: `(userId, idempotencyKey, requestHash)`.
- Dung Redis lock de chong race condition.
- Luu DB record de replay response.
- Neu key trung nhung hash khac -> tra `409 IDEMPOTENCY_CONFLICT`.

### Webhook callback

- Key: `(provider, providerEventId, requestHash)`.
- Replay cung payload -> tra ket qua cu.
- Trung eventId nhung hash khac -> `409 WEBHOOK_IDEMPOTENCY_CONFLICT`.

## 8) Outbox va Kafka

- Service khong publish truc tiep trong transaction business.
- Transaction chi ghi `outbox_events` voi status `PENDING`.
- `outbox-dispatcher.service.ts` chay nen:
1. lay event `PENDING/FAILED` den han retry
2. publish Kafka
3. mark `PUBLISHED` hoac `FAILED` + tang retry + backoff

Payment event types:

- `payment.created`
- `payment.requires-action`
- `payment.authorized`
- `payment.captured`
- `payment.failed`
- `payment.cancelled`
- `payment.refunded`
- `payment.partially-refunded`
- `payment.chargeback`

## 9) Data model chinh (PostgreSQL)

Bang chinh:

- `payments`
- `payment_transactions`
- `payment_status_histories`
- `payment_audit_logs`
- `idempotency_records`
- `webhook_idempotency_records`
- `refunds`
- `outbox_events`

Quy uoc:

- PK UUID
- amount dung `numeric(14,2)`
- thoi gian dung `timestamptz`
- co index va unique constraint cho idempotency/outbox query

## 10) Gateway provider (mock va VNPAY)

- `PAYMENT_GATEWAY=mock`: local dev/test, khong phu thuoc network ngoai.
- `PAYMENT_GATEWAY=vnpay`: dung VNPAY sandbox/production.
- Provider contract:
1. `createPaymentIntent`
2. `parseWebhook`
3. `createRefund`

Nho khai bao day du `VNPAY_*` env khi bat provider VNPAY.

## 11) Run nhanh de verify

Tu `services/payment-service/`:

1. `npm run docker:up`
2. `npm run docker:migrate`
3. `npm run docker:logs`

Tu root repo:

4. `./scripts/test-payment-service.sh`

Neu script in `All payment-service smoke tests passed` la flow co ban da OK.
