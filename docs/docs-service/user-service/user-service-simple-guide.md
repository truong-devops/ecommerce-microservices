# User Service - Simple Guide

Tài liệu này giải thích đơn giản `user-service` đang chạy trong monorepo.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/user-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/user_handler.go`
3. `internal/service/user_service.go`
4. `internal/repository/user_repository.go`

Nếu bạn chỉ đọc 4 file này, bạn sẽ nắm được ~80% luồng chạy.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, gắn middleware, router.
- `internal/config/`: load env cho app/db/kafka.

### Cấu hình

- `internal/config/config.go`: map cấu hình DB/Kafka từ biến môi trường thành struct.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging).
- `internal/httpx/`: helper trả response chuẩn `success/data/meta` và chuẩn hóa lỗi JSON.

### Users module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API users (`chi` router).
- `internal/service/`: logic chính (create/get/update/status/delete).
- `internal/repository/`: truy cập DB (PostgreSQL).
- `internal/events/`: publish event `user.registered` qua Kafka.
- `internal/domain/`: struct và model cho `users` (role/status/timestamps/soft delete).

### Health module

- `internal/handler/health.go`: `/health`, `/v1/health`.

### Database migration

- `migrations/`: file SQL migration tạo schema users.

### Test

- `scripts/test-user-service-go-kafka.sh`: script e2e test gọi REST API và check Kafka.

## 4) Luồng request đơn giản (từ đầu đến cuối)

1. Request vào API.
2. Middleware gắn `x-request-id`.
3. Handler validate input và nhận request.
4. Handler gọi `service`.
5. Service gọi repository để đọc/ghi PostgreSQL.
6. Với create user thành công, service publish `user.registered`.
7. Handler dùng `httpx` trả response chuẩn: `success/data/meta` hoặc lỗi `success=false` và `error`.

## 5) Nhìn nhanh từng use case

- Health check: `health.go`
- Create user: `user_handler.go -> user_service.go`
- List user (pagination/filter/search): `user_service.go (findAll)`
- Get detail user: `user_service.go (findOne)`
- Update profile user: `user_service.go (update)`
- Update status user: `user_service.go (updateStatus)`
- Soft delete user: `user_service.go (remove)`

## 6) Rule quan trọng để không bị rối

- Logic nghiệp vụ để trong `service`.
- Truy cập DB để trong `repository`.
- Validate input ở `handler`.
- Lỗi duplicate email trả `409`.
- Lỗi not found trả `404`.
- Lỗi validation trả `400`.
- Soft delete bằng `status=deleted` và `deletedAt`.

## 7) File bạn nên đọc theo thứ tự

1. `cmd/server/main.go`
2. `internal/handler/user_handler.go`
3. `internal/service/user_service.go`
4. `internal/repository/user_repository.go`
5. `internal/domain/user.go`
6. `migrations/0001_init_user_service.sql`

Đọc theo thứ tự này sẽ dễ hiểu luồng tổng thể nhất.
