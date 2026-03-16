# Shipping Service - Simple Guide

Tài liệu này giải thích ngắn gọn `shipping-service` trong monorepo để người mới đọc lại nhanh.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/shipping-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/shipping/controllers/shipping.controller.ts`
4. `src/modules/shipping/services/shipping.service.ts`
5. `src/modules/shipping/services/outbox-dispatcher.service.ts`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng hoạt động.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `src/main.ts`: khởi động NestJS, gắn middleware/filter/interceptor/validation global.
- `src/app.module.ts`: nối config, database, guards global, `HealthModule`, `ShippingModule`.

### Cấu hình

- `src/config/configuration.ts`: map biến môi trường thành object config.
- `src/config/env.validation.ts`: validate env bằng Joi, thiếu env sẽ fail startup.

### Common (dùng chung)

- `src/common/middlewares/request-id.middleware.ts`: tạo/gắn `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request có cấu trúc.
- `src/common/interceptors/response.interceptor.ts`: bọc response chuẩn `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuẩn hóa lỗi JSON.
- `src/common/guards/jwt-auth.guard.ts`: kiểm tra JWT.
- `src/common/guards/roles.guard.ts`: kiểm tra role với `@Roles(...)`.
- `src/common/decorators/current-user.decorator.ts`: lấy user từ request context.
- `src/common/decorators/public.decorator.ts`: đánh dấu route public.
- `src/common/decorators/roles.decorator.ts`: khai báo role endpoint.

### Shipping module (nghiệp vụ chính)

- `src/modules/shipping/shipping.module.ts`: gom controller, service, repository, strategy.
- `src/modules/shipping/controllers/shipping.controller.ts`: định nghĩa REST API shipping.
- `src/modules/shipping/services/shipping.service.ts`: logic chính create/list/get/update status/tracking/webhook.
- `src/modules/shipping/services/events-publisher.service.ts`: publish Kafka.
- `src/modules/shipping/services/outbox-dispatcher.service.ts`: đọc `outbox_events` và publish theo retry/backoff.

### Entity + Repository

- `src/modules/shipping/entities/*.entity.ts`: schema TypeORM cho shipments/tracking/history/audit/webhook-idempotency/outbox.
- `src/modules/shipping/repositories/*.repository.ts`: thao tác DB theo từng bảng.
- `src/modules/shipping/entities/shipment-status.enum.ts`: state machine và transition hợp lệ.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check Postgres + Redis.

### Migration

- `migrations/0001_init_shipping_service.sql`: tạo toàn bộ schema ban đầu.

## 4) Luồng request tổng quát

1. Request vào API `/api/v1/*`.
2. `request-id.middleware` gắn `x-request-id`.
3. `jwt-auth.guard` kiểm tra access token.
4. `roles.guard` kiểm tra role endpoint.
5. Controller gọi `shipping.service.ts`.
6. Service validate nghiệp vụ và gọi repositories.
7. Với write API: chạy transaction để ghi shipment + history + audit + outbox.
8. `response.interceptor` trả response chuẩn.
9. Nếu có lỗi, `http-exception.filter` trả lỗi chuẩn.

## 5) Luồng create shipment (quan trọng)

1. `POST /shipments` cho role staff (`ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`).
2. Service kiểm tra `orderId` chưa có shipment.
3. Tạo shipment với status ban đầu `PENDING`.
4. Ghi status history `PENDING`.
5. Ghi audit log `SHIPMENT_CREATED`.
6. Ghi outbox event `shipment.created`.
7. Transaction commit xong mới trả về client.

## 6) Luồng cập nhật trạng thái / tracking

- API staff cập nhật trạng thái: `PATCH /shipments/:id/status`
- API staff thêm tracking event: `POST /shipments/:id/tracking-events`

Service kiểm tra:
1. quyền role staff
2. shipment tồn tại
3. state transition hợp lệ theo `SHIPMENT_STATUS_TRANSITIONS`

Sau đó ghi transaction:
- update `shipments.status`
- insert `shipment_status_histories`
- insert `shipment_tracking_events` (nếu có)
- insert `shipment_audit_logs`
- insert `outbox_events` (`shipment.status-updated`, `shipment.delivered`, `shipment.failed`, `shipment.cancelled` tùy case)

## 7) Danh sách API chính

Base prefix: `/api/v1`

### Health

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)

### Shipping

- `POST /shipments` (`ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - tạo shipment
- `GET /shipments` (`CUSTOMER|ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - list shipment
- `GET /shipments/:id` (các role như trên) - chi tiết shipment
- `GET /shipments/order/:orderId` (các role như trên) - lấy shipment theo order
- `PATCH /shipments/:id/status` (`ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - cập nhật trạng thái
- `POST /shipments/:id/tracking-events` (`ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - thêm tracking event
- `GET /shipments/:id/tracking-events` (các role như trên) - danh sách tracking event
- `POST /shipments/webhooks/:provider` (public) - webhook từ logistics provider

Rule đọc dữ liệu:
- `CUSTOMER` chỉ đọc shipment có `buyerId = userId`.
- Staff roles đọc được tất cả shipment.

## 8) State machine của shipment

- `PENDING -> AWB_CREATED`
- `AWB_CREATED -> PICKED_UP | CANCELLED`
- `PICKED_UP -> IN_TRANSIT | FAILED | RETURNED`
- `IN_TRANSIT -> OUT_FOR_DELIVERY | FAILED | RETURNED`
- `OUT_FOR_DELIVERY -> DELIVERED | FAILED | RETURNED`
- `FAILED -> OUT_FOR_DELIVERY | RETURNED`
- `DELIVERED` là trạng thái cuối
- `CANCELLED` là trạng thái cuối
- `RETURNED` là trạng thái cuối

Transition sai sẽ trả lỗi `INVALID_SHIPMENT_STATUS_TRANSITION`.

## 9) Outbox và Kafka

- Service không publish trực tiếp trong transaction business.
- Business chỉ ghi vào `outbox_events`.
- `outbox-dispatcher.service.ts` chạy nền:
1. lấy event `PENDING/FAILED đến hạn retry`
2. publish Kafka qua `events-publisher.service.ts`
3. đánh dấu `PUBLISHED` hoặc `FAILED` + tăng retry

Mục tiêu: giảm rủi ro mất event khi service crash.

## 10) File nên đọc theo thứ tự

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/shipping/controllers/shipping.controller.ts`
4. `src/modules/shipping/services/shipping.service.ts`
5. `src/modules/shipping/repositories/`
6. `src/modules/shipping/entities/`
7. `src/modules/shipping/services/events-publisher.service.ts`
8. `src/modules/shipping/services/outbox-dispatcher.service.ts`
9. `migrations/0001_init_shipping_service.sql`
10. `scripts/test-shipping-service.sh` (ở root repo)
