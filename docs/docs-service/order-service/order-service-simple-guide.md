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

- `cmd/server/main.go`: khởi động service, gắn middleware, router.
- `internal/config/`: load env.
- `internal/app/` (hoặc tương tự): nối config, database, handler.

### Cấu hình

- `internal/config/config.go`: map biến môi trường thành struct.
- Validate env khi khởi động.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi.

### Orders module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API order (`chi` router).
- `internal/service/`: logic chính create/list/get/cancel/update status, xử lý idempotency, outbox.
- `internal/domain/`: state machine và transition hợp lệ (`OrderStatus`).
- `internal/events/`: publish Kafka.

### Entity + Repository

- `internal/repository/`: thao tác DB theo từng bảng (orders/items/history/audit/idempotency/outbox).

### Health module

- `internal/handler/health.go`: `/health`, `/ready`, `/live`.

### Migration

- `migrations/0001_init_order_service.sql`: tạo toàn bộ schema ban đầu.

## 4) Luồng request tổng quát

1. Request vào API `/api/v1/*`.
2. Middleware gắn `x-request-id`, kiểm tra JWT token, và kiểm tra role.
3. Handler nhận request và gọi method tương ứng trong `service`.
4. Service validate nghiệp vụ và gọi `repository`.
5. Với write API: chạy transaction (`pgx`) để ghi order + history + audit + outbox.
6. Handler dùng `httpx` trả response hoặc lỗi chuẩn.

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

1. `cmd/server/main.go`
2. `internal/handler/order_handler.go`
3. `internal/service/order_service.go`
4. `internal/repository/order_repository.go`
5. `internal/domain/order.go`
6. `migrations/0001_init_order_service.sql`
7. `scripts/test-order-service.sh` (ở root repo)
