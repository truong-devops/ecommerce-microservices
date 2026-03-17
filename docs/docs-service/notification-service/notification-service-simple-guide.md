# Notification Service - Simple Guide

Tai lieu nay giai thich ngan gon `notification-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/notification-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/notifications/controllers/notifications.controller.ts`
4. `src/modules/notifications/services/notifications.service.ts`
5. `src/modules/notifications/services/notification-events-consumer.service.ts`
6. `src/modules/notifications/services/notification-dispatcher.service.ts`

Chi can nam 6 file nay la hieu phan lon luong nghiep vu.

## 3) Thu muc/file dung de lam gi?

### Khoi dong va wiring

- `src/main.ts`: khoi dong NestJS, gan middleware/filter/interceptor/validation global.
- `src/app.module.ts`: noi config, TypeORM Postgres, global guards, `HealthModule`, `NotificationsModule`.

### Cau hinh

- `src/config/configuration.ts`: map bien moi truong thanh object config app/db/redis/jwt/dispatch/kafka.
- `src/config/env.validation.ts`: validate env bang Joi, thieu env quan trong se fail startup.

### Common (dung chung)

- `src/common/middlewares/request-id.middleware.ts`: tao/gan `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request co cau truc.
- `src/common/interceptors/response.interceptor.ts`: boc response chuan `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuan hoa loi JSON.
- `src/common/guards/jwt-auth.guard.ts`: check JWT.
- `src/common/guards/roles.guard.ts`: check role voi `@Roles(...)`.
- `src/common/decorators/public.decorator.ts`: danh dau route public.
- `src/common/decorators/current-user.decorator.ts`: lay user context tu request.

### Notifications module (nghiep vu chinh)

- `src/modules/notifications/notifications.module.ts`: gom controller/service/repository/strategy/consumer/dispatcher.
- `src/modules/notifications/controllers/notifications.controller.ts`: dinh nghia REST API notifications.
- `src/modules/notifications/services/notifications.service.ts`: logic manual campaign, list/get/mark read, map event vao notification record.
- `src/modules/notifications/services/notification-events-consumer.service.ts`: consume topic `notification.events` voi idempotency.
- `src/modules/notifications/services/notification-dispatcher.service.ts`: worker nen dispatch pending/failed theo retry backoff.
- `src/modules/notifications/services/mock-notification-provider.service.ts`: provider mock de dispatch (de thay the bang provider that sau).

### Entity + Repository

- `src/modules/notifications/entities/notification.entity.ts`: bang `notifications`.
- `src/modules/notifications/entities/notification-attempt.entity.ts`: bang `notification_attempts`.
- `src/modules/notifications/entities/inbox-event.entity.ts`: bang `inbox_events` cho idempotency consumer.
- `src/modules/notifications/repositories/*.repository.ts`: thao tac DB theo tung bang.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check Postgres + Redis (neu bat).

### Migration

- `migrations/0001_init_notification_service.sql`: tao schema notifications/attempts/inbox.

## 4) Luong request tong quat

1. Request vao API `/api/v1/*`.
2. `request-id.middleware` gan `x-request-id`.
3. `jwt-auth.guard` kiem tra token (neu route khong `@Public`).
4. `roles.guard` kiem tra role endpoint.
5. Controller goi `notifications.service.ts`.
6. Service validate nghiep vu va goi repository.
7. `response.interceptor` tra response envelope.
8. Neu loi, `http-exception.filter` tra error envelope.

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

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/notifications/controllers/notifications.controller.ts`
4. `src/modules/notifications/services/notifications.service.ts`
5. `src/modules/notifications/repositories/`
6. `src/modules/notifications/entities/`
7. `src/modules/notifications/services/notification-events-consumer.service.ts`
8. `src/modules/notifications/services/notification-dispatcher.service.ts`
9. `migrations/0001_init_notification_service.sql`
10. `scripts/test-notification-service.sh` (o root repo)
