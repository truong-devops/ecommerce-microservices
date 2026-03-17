# Review Service - Simple Guide

Tài liệu này giải thích ngắn gọn `review-service` trong monorepo để người mới đọc lại nhanh.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/review-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/reviews/controllers/review.controller.ts`
4. `src/modules/reviews/services/review.service.ts`
5. `src/modules/reviews/repositories/review.repository.ts`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng hoạt động.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `src/main.ts`: khởi động NestJS, gắn middleware/filter/interceptor/validation global.
- `src/app.module.ts`: nối config, MongoDB, guards global, `HealthModule`, `ReviewsModule`.

### Cấu hình

- `src/config/configuration.ts`: map biến môi trường thành object config.
- `src/config/env.validation.ts`: validate env bằng Joi, thiếu env sẽ fail startup.

### Common (dùng chung)

- `src/common/middlewares/request-id.middleware.ts`: tạo/gắn `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request có cấu trúc.
- `src/common/interceptors/response.interceptor.ts`: bọc response chuẩn `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuẩn hóa lỗi JSON.
- `src/common/guards/jwt-auth.guard.ts`: kiểm tra JWT (hỗ trợ public route với optional token).
- `src/common/guards/roles.guard.ts`: kiểm tra role với `@Roles(...)`.
- `src/common/decorators/current-user.decorator.ts`: lấy user từ request context.
- `src/common/decorators/public.decorator.ts`: đánh dấu route public.
- `src/common/decorators/roles.decorator.ts`: khai báo role endpoint.

### Reviews module (nghiệp vụ chính)

- `src/modules/reviews/review.module.ts`: gom controller, service, repository, JWT strategy.
- `src/modules/reviews/controllers/review.controller.ts`: định nghĩa REST API review.
- `src/modules/reviews/services/review.service.ts`: logic chính create/list/get/update/delete/moderate/reply/summary.
- `src/modules/reviews/repositories/review.repository.ts`: thao tác MongoDB (query list, duplicate check, summary aggregate).
- `src/modules/reviews/entities/review.entity.ts`: schema Mongoose + indexes.
- `src/modules/reviews/enums/review-status.enum.ts`: trạng thái review (`PUBLISHED|HIDDEN|REJECTED|DELETED`).

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check trạng thái kết nối MongoDB.

### Test + docker

- `test/review-api.e2e.spec.ts`: e2e test các flow chính.
- `docker-compose.dev.yml`: stack local `mongo` + `review-service`.
- `scripts/test-review-service.sh` (ở root repo): smoke test end-to-end.

## 4) Luồng request tổng quát

1. Request vào API `/api/v1/*`.
2. `request-id.middleware` gắn `x-request-id`.
3. `jwt-auth.guard` kiểm tra access token (hoặc bỏ qua nếu route public không có token).
4. `roles.guard` kiểm tra role endpoint (nếu có `@Roles`).
5. Controller gọi `review.service.ts`.
6. Service validate nghiệp vụ và gọi repository.
7. `response.interceptor` trả response chuẩn.
8. Nếu có lỗi, `http-exception.filter` trả lỗi chuẩn.

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

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/reviews/controllers/review.controller.ts`
4. `src/modules/reviews/services/review.service.ts`
5. `src/modules/reviews/repositories/review.repository.ts`
6. `src/modules/reviews/entities/review.entity.ts`
7. `test/review-api.e2e.spec.ts`
8. `scripts/test-review-service.sh` (ở root repo)
