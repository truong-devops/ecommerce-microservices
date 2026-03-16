# User Service - Simple Guide

Tài liệu này giải thích đơn giản `user-service` đang chạy trong monorepo.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/user-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/users/controllers/users.controller.ts`
4. `src/modules/users/services/users.service.ts`

Nếu bạn chỉ đọc 4 file này, bạn sẽ nắm được ~80% luồng chạy.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `src/main.ts`: khởi động NestJS, gắn global prefix `api` và ValidationPipe.
- `src/app.module.ts`: nối config, TypeORM, middleware, global filter/interceptor.

### Cấu hình

- `src/config/app.config.ts`: validate env bằng Joi, map cấu hình DB/Kafka, tạo TypeORM options.

### Common (dùng chung)

- `src/common/middlewares/request-context.middleware.ts`: tạo/gắn `x-request-id`.
- `src/common/interceptors/response-envelope.interceptor.ts`: bọc response theo format chuẩn.
- `src/common/filters/http-exception.filter.ts`: chuẩn hóa lỗi JSON.
- `src/common/constants/error-codes.constant.ts`: định nghĩa error code của user-service.

### Users module (nghiệp vụ chính)

- `src/modules/users/users.module.ts`: gom controller/service/repository/event publisher.
- `src/modules/users/controllers/users.controller.ts`: định nghĩa REST API users.
- `src/modules/users/services/users.service.ts`: logic chính (create/get/update/status/delete).
- `src/modules/users/repositories/users.repository.ts`: truy cập DB qua TypeORM.
- `src/modules/users/entities/user.entity.ts`: bảng `users` (role/status/timestamps/soft delete).
- `src/modules/users/dto/*.dto.ts`: validate input cho từng endpoint.
- `src/modules/users/events/kafka-user-events.publisher.ts`: publish event `user.registered`.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/v1/health`.
- `src/modules/health/services/health.service.ts`: trả trạng thái service.

### Database migration

- `src/database/migrations/1710000000000-create-users-table.ts`: tạo schema users.
- `src/database/data-source.ts`: datasource cho migration command.

### Test

- `test/app.e2e-spec.ts`: e2e test cho health + CRUD + duplicate + validation.
- `test/jest-e2e.json`: config test e2e.

## 4) Luồng request đơn giản (từ đầu đến cuối)

1. Request vào API.
2. Middleware gắn `x-request-id`.
3. ValidationPipe validate DTO.
4. Controller nhận request, gọi `users.service.ts`.
5. Service gọi repository để đọc/ghi PostgreSQL.
6. Với create user thành công, service publish `user.registered`.
7. Interceptor trả response chuẩn: `success/data/meta`.
8. Nếu lỗi thì filter trả `success=false` và `error`.

## 5) Nhìn nhanh từng use case

- Health check: `health.controller.ts -> health.service.getHealth()`
- Create user: `users.controller.ts -> users.service.create()`
- List user (pagination/filter/search): `users.service.findAll()`
- Get detail user: `users.service.findOne()`
- Update profile user: `users.service.update()`
- Update status user: `users.service.updateStatus()`
- Soft delete user: `users.service.remove()`

## 6) Rule quan trọng để không bị rối

- `users.controller.ts` phải mỏng (thin controller).
- Logic nghiệp vụ để trong `users.service.ts`.
- Truy cập DB để trong `repositories/*`.
- Validate input bằng DTO + class-validator.
- Lỗi duplicate email trả `409`.
- Lỗi not found trả `404`.
- Lỗi validation trả `400`.
- Soft delete bằng `status=deleted` và `deletedAt`.

## 7) File bạn nên đọc theo thứ tự

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/users/controllers/users.controller.ts`
4. `src/modules/users/services/users.service.ts`
5. `src/modules/users/repositories/users.repository.ts`
6. `src/modules/users/entities/user.entity.ts`
7. `src/database/migrations/1710000000000-create-users-table.ts`

Đọc theo thứ tự này sẽ dễ hiểu luồng tổng thể nhất.
