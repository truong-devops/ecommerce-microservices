# Payment Service API

## Tổng quan

- Service: `services/payment-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/payments`
- Hỗ trợ idempotency khi tạo payment intent.

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Payment endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/payments/intents` | Roles(`CUSTOMER`) | Tạo payment intent cho order |
| GET | `/api/v1/payments` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Danh sách payment |
| GET | `/api/v1/payments/order/:orderId` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Lấy payment theo order |
| GET | `/api/v1/payments/:id` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Chi tiết payment |
| POST | `/api/v1/payments/:id/refunds` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tạo refund |
| GET | `/api/v1/payments/:id/refunds` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Danh sách refund |
| POST | `/api/v1/payments/webhooks/:provider` | Public | Webhook callback từ cổng thanh toán |

Public SePay webhook qua API Gateway:

- `POST /api/v1/payments/webhooks/sepay`
- `POST /api/payments/webhooks/sepay`

Endpoint SePay nhận raw JSON body để xác thực HMAC/API key. Khi xử lý được request, service trả `{"success":true}` theo contract webhook SePay.

## DTO chính

### `CreatePaymentIntentDto`

- `orderId` (UUID, required)
- `sellerId` (UUID, optional)
- `currency` (required, `^[A-Z]{3}$`)
- `amount` (required, >= 0.01)
- `provider` (optional, max 64)
- `description` (optional, max 500)
- `metadata` (optional, object)
- `autoCapture` (optional, boolean)
- `simulatedStatus` (optional):
  - `PENDING`, `REQUIRES_ACTION`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CHARGEBACK`

Header khuyến nghị:
- `Idempotency-Key`

Với `provider=sepay` hoặc `PAYMENT_GATEWAY=sepay`:

- `currency` phải là `VND`.
- `amount` phải là số nguyên VND.
- Response có thêm `paymentInstructions`:
  - `type`: `VIETQR`
  - `paymentCode`
  - `qrImageUrl`
  - `bankCode`
  - `accountNumber`
  - `accountName`
  - `amount`
  - `currency`
  - `transferDescription`
  - `expiresAt`
- Response có thêm `expiresAt` và `capturedAt`.

### SePay reconciliation config

Worker đối soát đọc SePay User API `GET /transactions/list` khi bật:

- `SEPAY_RECONCILE_ENABLED=true`
- `SEPAY_API_BASE_URL` (mặc định `https://my.sepay.vn/userapi`)
- `SEPAY_API_TOKEN`
- `SEPAY_RECONCILE_INTERVAL_MS`
- `SEPAY_RECONCILE_BATCH_SIZE`

Cursor lưu trong `payment_reconciliation_cursors`. Raw transaction được lưu vào `payment_provider_events` với `source=reconciliation`.

### `ListPaymentsDto` (query)

- `page`, `pageSize` (max 100)
- `status` (enum `PaymentStatus`)
- `orderId`, `userId`, `sellerId` (UUID optional)
- `provider`, `search`
- `sortBy`: `createdAt | amount | status`
- `sortOrder`: `ASC | DESC`

### `CreateRefundDto`

- `amount` (required, >= 0.01)
- `reason` (optional, max 500)

### `PaymentWebhookDto`

- `providerEventId` (required)
- `paymentId` (optional UUID)
- `orderId` (optional UUID)
- `gatewayTransactionId`, `providerPaymentId` (optional)
- `eventType` (required)
- `status` (required, `PaymentStatus`)
- `amount`, `currency`, `occurredAt`, `signature` (optional)
- `metadata`, `rawPayload` (optional object)

Lưu ý: DTO generic này vẫn dùng cho mock/gateway cũ. SePay webhook dùng native payload từ SePay gồm các trường như `id`, `gateway`, `transactionDate`, `accountNumber`, `code`, `content`, `transferType`, `transferAmount`, `referenceCode`.

## Payment status enum

`PENDING | REQUIRES_ACTION | AUTHORIZED | CAPTURED | FAILED | CANCELLED | PARTIALLY_REFUNDED | REFUNDED | CHARGEBACK`

## Error code nổi bật

- `PAYMENT_NOT_FOUND`
- `PAYMENT_ALREADY_CAPTURED`
- `PAYMENT_AMOUNT_MISMATCH`
- `REFUND_AMOUNT_EXCEEDED`
- `IDEMPOTENCY_CONFLICT`
- `WEBHOOK_IDEMPOTENCY_CONFLICT`
- `INVALID_PAYMENT_STATUS_TRANSITION`
- `GATEWAY_CALLBACK_INVALID_SIGNATURE`
