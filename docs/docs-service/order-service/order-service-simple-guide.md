# Order Service - Simple Guide

Tài liệu này giải thích ngắn gọn `order-service` trong monorepo để người mới đọc lại nhanh.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/order-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/orders/controllers/orders.controller.ts`
4. `src/modules/orders/services/orders.service.ts`
5. `src/modules/orders/services/outbox-dispatcher.service.ts`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng hoạt động.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `src/main.ts`: khởi động NestJS, gắn middleware/filter/interceptor/validation global.
- `src/app.module.ts`: nối config, database, guards global, `HealthModule`, `OrdersModule`.

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

### Orders module (nghiệp vụ chính)

- `src/modules/orders/orders.module.ts`: gom controller, service, repository, strategy.
- `src/modules/orders/controllers/orders.controller.ts`: định nghĩa REST API order.
- `src/modules/orders/services/orders.service.ts`: logic chính create/list/get/cancel/update status.
- `src/modules/orders/services/idempotency.service.ts`: xử lý `Idempotency-Key` và replay.
- `src/modules/orders/services/order-number.service.ts`: sinh `orderNumber`.
- `src/modules/orders/services/events-publisher.service.ts`: publish Kafka.
- `src/modules/orders/services/outbox-dispatcher.service.ts`: đọc `outbox_events` và publish theo retry/backoff.

### Entity + Repository

- `src/modules/orders/entities/*.entity.ts`: schema TypeORM cho orders/items/history/audit/idempotency/outbox.
- `src/modules/orders/repositories/*.repository.ts`: thao tác DB theo từng bảng.
- `src/modules/orders/entities/order-status.enum.ts`: state machine và transition hợp lệ.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check Postgres + Redis.

### Migration

- `migrations/0001_init_order_service.sql`: tạo toàn bộ schema ban đầu.

## 4) Luồng request tổng quát

1. Request vào API `/api/v1/*`.
2. `request-id.middleware` gắn `x-request-id`.
3. `jwt-auth.guard` kiểm tra access token.
4. `roles.guard` kiểm tra role endpoint.
5. Controller gọi `orders.service.ts`.
6. Service validate nghiệp vụ và gọi repositories.
7. Với write API: chạy transaction để ghi order + history + audit + outbox.
8. `response.interceptor` trả response chuẩn.
9. Nếu có lỗi, `http-exception.filter` trả lỗi chuẩn.

## 5) Luồng create order (quan trọng)

1. `POST /orders` bắt buộc header `Idempotency-Key`.
2. `idempotency.service` kiểm tra key đã dùng chưa.
3. Nếu key cũ cùng payload và đã có kết quả, trả replay response.
4. Nếu key cũ nhưng payload khác, trả `IDEMPOTENCY_CONFLICT`.
5. Nếu key mới, service mở transaction:
- tạo order
- tạo order items
- ghi status history (`PENDING`)
- ghi audit log
- ghi outbox event `order.created`
- lưu idempotency record response
6. Transaction commit xong mới trả về client.

## 6) Luồng đổi trạng thái đơn

- API staff: `PATCH /orders/:id/status`
- API customer xác nhận nhận hàng: `PATCH /orders/:id/confirm-received`
- API hủy đơn: `PATCH /orders/:id/cancel`

Service kiểm tra:
1. quyền role
2. ownership (nếu là CUSTOMER)
3. state transition hợp lệ theo `ORDER_STATUS_TRANSITIONS`

Sau đó ghi transaction:
- update `orders.status`
- insert `order_status_histories`
- insert `order_audit_logs`
- insert `outbox_events` (`order.status-updated`, `order.delivered`, `order.cancelled` tùy case)

## 7) Danh sách API chính

Base prefix: `/api/v1`

### Health

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)

### Orders

- `POST /orders` (`CUSTOMER`) - tạo đơn, bắt buộc `Idempotency-Key`
- `GET /orders` (`CUSTOMER|ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - list đơn
- `GET /orders/:id` (các role như trên) - chi tiết đơn
- `PATCH /orders/:id/cancel` (các role như trên) - hủy đơn
- `PATCH /orders/:id/confirm-received` (`CUSTOMER`) - xác nhận nhận hàng
- `PATCH /orders/:id/status` (`ADMIN|SUPPORT|WAREHOUSE|SELLER|SUPER_ADMIN`) - cập nhật trạng thái
- `GET /orders/:id/history` (các role như trên) - lịch sử trạng thái

## 8) State machine của order

- `PENDING -> CONFIRMED | CANCELLED | FAILED`
- `CONFIRMED -> PROCESSING | CANCELLED | FAILED`
- `PROCESSING -> SHIPPED | FAILED`
- `SHIPPED -> DELIVERED | FAILED`
- `DELIVERED` là trạng thái cuối
- `CANCELLED` là trạng thái cuối
- `FAILED` là trạng thái cuối

Transition sai sẽ trả lỗi `INVALID_ORDER_STATUS_TRANSITION`.

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
3. `src/modules/orders/controllers/orders.controller.ts`
4. `src/modules/orders/services/orders.service.ts`
5. `src/modules/orders/repositories/`
6. `src/modules/orders/entities/`
7. `src/modules/orders/services/idempotency.service.ts`
8. `src/modules/orders/services/outbox-dispatcher.service.ts`
9. `migrations/0001_init_order_service.sql`
10. `scripts/test-order-service.sh` (ở root repo)
