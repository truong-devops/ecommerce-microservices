# Payment Service - Simple Guide

Tai lieu nay giai thich ngan gon `payment-service` trong monorepo de de onboard, van hanh va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/payment-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/payments/controllers/payments.controller.ts`
4. `src/modules/payments/services/payments.service.ts`
5. `src/modules/payments/services/outbox-dispatcher.service.ts`

Chi can nam 5 file nay la hieu phan lon luong nghiep vu.

## 3) Thu muc/file dung de lam gi?

### Khoi dong va wiring

- `src/main.ts`: khoi dong NestJS, prefix `/api/v1`, global middleware/filter/interceptor/validation.
- `src/app.module.ts`: noi config, TypeORM Postgres, Redis, JWT guard global, `HealthModule`, `PaymentsModule`.

### Cau hinh

- `src/config/configuration.ts`: map bien moi truong cho app/db/redis/jwt/kafka/payment gateway.
- `src/config/env.validation.ts`: validate env bang Joi, thieu env quan trong se fail startup.

### Common (dung chung)

- `src/common/middlewares/request-id.middleware.ts`: tao/gan `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: structured log co `requestId`, `path`, `method`, `statusCode`, `durationMs`.
- `src/common/interceptors/response.interceptor.ts`: boc response chuan `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuan hoa envelope loi.
- `src/common/guards/jwt-auth.guard.ts`: check JWT access token.
- `src/common/guards/roles.guard.ts`: check role theo `@Roles(...)`.
- `src/common/decorators/public.decorator.ts`: danh dau route public.
- `src/common/decorators/current-user.decorator.ts`: lay user context tu request.

### Payments module (nghiep vu chinh)

- `src/modules/payments/payments.module.ts`: gom controller/service/repository/provider/strategy.
- `src/modules/payments/controllers/payments.controller.ts`: dinh nghia REST API payment.
- `src/modules/payments/services/payments.service.ts`: logic payment intent, webhook callback, refund, chargeback basic.
- `src/modules/payments/services/idempotency.service.ts`: xu ly idempotency cho intent va webhook.
- `src/modules/payments/services/outbox-dispatcher.service.ts`: doc outbox va publish event theo retry/backoff.
- `src/modules/payments/services/events-publisher.service.ts`: publish Kafka den `payment.events`, `notification.events`, `analytics.events`.
- `src/modules/payments/providers/payment-gateway-provider.interface.ts`: contract gateway.
- `src/modules/payments/providers/mock-payment-gateway.provider.ts`: provider local de dev/test.
- `src/modules/payments/providers/vnpay-payment-gateway.provider.ts`: provider VNPAY (tao url + verify callback + refund request model).
- `src/modules/payments/entities/*.entity.ts`: schema TypeORM cho bang payment.
- `src/modules/payments/repositories/*.repository.ts`: truy cap DB theo tung bang.
- `src/modules/payments/dto/*.dto.ts`: validate input cho endpoint.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check Postgres + Redis readiness.

### Migration

- `migrations/0001_init_payment_service.sql`: tao toan bo schema payment.

### Test

- `src/modules/payments/services/*.spec.ts`: unit test cho payments/idempotency/outbox.
- `src/common/guards/jwt-auth.guard.spec.ts`: unit test guard auth.
- `src/modules/payments/providers/vnpay-payment-gateway.provider.spec.ts`: unit test VNPAY signer/parser.
- `scripts/test-payment-service.sh` (o root repo): smoke test API end-to-end.

## 4) Luong request tong quat

1. Request vao API `/api/v1/*`.
2. `request-id.middleware` gan `x-request-id`.
3. `jwt-auth.guard` kiem tra token (route public dung `@Public`).
4. `roles.guard` kiem tra role endpoint.
5. Controller goi `payments.service.ts`.
6. Service validate nghiep vu + state transition + ownership.
7. Write APIs chay transaction de ghi business data + outbox trong cung DB transaction.
8. `response.interceptor` tra envelope thanh cong.
9. Neu loi, `http-exception.filter` tra envelope loi + business error code.

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
