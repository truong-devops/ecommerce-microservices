# Review Service - Simple Guide

Tài liệu này giải thích ngắn gọn `review-service` trong monorepo để người mới đọc lại nhanh.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/review-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/review_handler.go`
3. `internal/service/review_service.go`
4. `internal/repository/review_repository.go`

Chỉ cần nắm 4 file này là hiểu phần lớn luồng hoạt động.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, gắn middleware, router.
- `internal/config/`: load env cho app/mongo.

### Cấu hình

- `internal/config/config.go`: map biến môi trường thành struct.
- Validate env khi khởi động.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi JSON.

### Reviews module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API review (`chi` router).
- `internal/service/`: logic chính create/list/get/update/delete/moderate/reply/summary.
- `internal/repository/`: thao tác MongoDB (query list, duplicate check, summary aggregate).
- `internal/domain/`: schema bson struct, model review và các enum trạng thái.

### Health module

- `internal/handler/health.go`: `/health`, `/ready`, `/live`.

### Test + docker

- `test/review-api.e2e.spec.ts`: e2e test các flow chính.
- `docker-compose.dev.yml`: stack local `mongo` + `review-service`.
- `scripts/test-review-service.sh` (ở root repo): smoke test end-to-end.

1. Request vào API `/api/v1/*`.
2. Middleware gắn `x-request-id`, kiểm tra JWT token, và kiểm tra role.
3. Handler nhận request và gọi method trong `service`.
4. Service validate nghiệp vụ và gọi repository.
5. Handler dùng `httpx` trả response chuẩn hoặc trả lỗi JSON.

## 5) Luồng create review (quan trọng)

1. `POST /reviews` chỉ cho role `CUSTOMER`.
2. Service kiểm tra duplicate active review theo `(orderId, productId, buyerId)`.
3. Tạo review với status mặc định `PUBLISHED`.
4. Trả dữ liệu review theo envelope chuẩn.

Nếu duplicate thì trả `409 REVIEW_ALREADY_EXISTS`.

## 6) Quy tắc visibility và moderation

### Visibility

- Public chỉ thấy review `PUBLISHED`.
- Owner (`CUSTOMER`) có thể thấy review của chính mình kể cả `HIDDEN/REJECTED`.
- Staff moderation (`ADMIN|SUPPORT|SUPER_ADMIN`) có thể thấy review không public.
- `DELETED` được coi như not found.

### Moderation

- API: `PATCH /reviews/:id/moderation`
- Role: `ADMIN|SUPPORT|SUPER_ADMIN`
- Chỉ cho phép chuyển sang `PUBLISHED|HIDDEN|REJECTED`.
- Nếu `HIDDEN` hoặc `REJECTED` thì bắt buộc `reason`.

## 7) Danh sách API chính

Base prefix: `/api/v1`

### Health

- `GET /health` (public)
- `GET /ready` (public)
- `GET /live` (public)

### Reviews

- `POST /reviews` (`CUSTOMER`) - tạo review
- `GET /reviews` (public) - list review, filter + pagination
- `GET /reviews/:id` (public/optional auth) - chi tiết review theo rule visibility
- `PATCH /reviews/:id` (`CUSTOMER`) - cập nhật review của chính mình
- `DELETE /reviews/:id` (`CUSTOMER`) - soft delete review của chính mình
- `PATCH /reviews/:id/moderation` (`ADMIN|SUPPORT|SUPER_ADMIN`) - moderation
- `POST /reviews/:id/reply` (`SELLER|ADMIN|SUPPORT|SUPER_ADMIN`) - phản hồi review
- `GET /reviews/products/:productId/summary` (public) - thống kê rating sản phẩm

## 8) Mongo schema và index

Collection: `reviews`

Field chính:
- `orderId`, `productId`, `sellerId`, `buyerId`
- `rating`, `title`, `content`, `images`
- `status`, `moderationReason`, `moderatedBy`, `moderatedAt`
- `reply`, `deletedAt`, `createdAt`, `updatedAt`

Indexes:
- unique partial: `(orderId, productId, buyerId)` với status active (`PUBLISHED|HIDDEN|REJECTED`)
- query index: `(productId, status, createdAt)`
- query index: `(sellerId, status, createdAt)`

## 9) Kafka trạng thái hiện tại

- `shared/kafka/topics.ts` đã có topic review:
  - `review.created`
  - `review.updated`
  - `review.deleted`
  - `review.moderated`
- `shared/kafka/events/review.events.ts` đã có typed event interfaces.
- `review-service` hiện chưa publish Kafka runtime (chưa có outbox/dispatcher như shipping-service).

## 10) File nên đọc theo thứ tự

1. `cmd/server/main.go`
2. `internal/handler/review_handler.go`
3. `internal/service/review_service.go`
4. `internal/repository/review_repository.go`
5. `internal/domain/review.go`
6. `scripts/test-review-service.sh` (ở root repo)
