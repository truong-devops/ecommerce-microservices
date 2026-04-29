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
