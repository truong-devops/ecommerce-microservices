# Auth Service - Simple Guide

Tài liệu này giải thích đơn giản auth-service đang chạy trong monorepo.

## 1) Gốc service ở đâu?

Gốc của service là:

`services/auth-service/`

Mọi đường dẫn bên dưới đều tính từ thư mục này.

## 2) Đọc từ đâu để hiểu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/auth/controllers/auth.controller.ts`
4. `src/modules/auth/services/auth.service.ts`

Nếu bạn chỉ đọc 4 file này, bạn sẽ nắm được ~80% luồng chạy.

## 3) Thư mục/file dùng để làm gì?

### Khởi động và wiring

- `src/main.ts`: Khởi động NestJS, gắn middleware/interceptor/filter/validation.
- `src/app.module.ts`: Nối các module, config, database, global guards.

### Cấu hình

- `src/config/configuration.ts`: map biến môi trường thành object config.
- `src/config/env.validation.ts`: validate env bằng Joi (thiếu env sẽ fail startup).

### Common (dùng chung)

- `src/common/middlewares/request-id.middleware.ts`: tạo/gắn `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request có cấu trúc.
- `src/common/interceptors/response.interceptor.ts`: bọc response thành format chuẩn.
- `src/common/filters/http-exception.filter.ts`: chuẩn hóa lỗi JSON.
- `src/common/guards/jwt-auth.guard.ts`: check JWT cho private route.
- `src/common/guards/roles.guard.ts`: check role với `@Roles(...)`.
- `src/common/decorators/public.decorator.ts`: đánh dấu route public.
- `src/common/decorators/current-user.decorator.ts`: lấy user từ request context.
- `src/common/decorators/roles.decorator.ts`: khai báo role cần thiết.

### Auth module (nghiệp vụ chính)

- `src/modules/auth/auth.module.ts`: gom controller/service/repository/entity.
- `src/modules/auth/controllers/auth.controller.ts`: định nghĩa REST API auth.
- `src/modules/auth/services/auth.service.ts`: logic chính (register/login/refresh/logout...).
- `src/modules/auth/services/token.service.ts`: issue/verify/hash token.
- `src/modules/auth/services/session.service.ts`: quản lý session + revoke.
- `src/modules/auth/services/password.service.ts`: hash/compare password.
- `src/modules/auth/services/mfa.service.ts`: TOTP MFA.
- `src/modules/auth/services/audit.service.ts`: ghi audit log.
- `src/modules/auth/services/events-publisher.service.ts`: publish event Kafka.

### Strategy

- `src/modules/auth/strategies/access-token.strategy.ts`: validate access token.
- `src/modules/auth/strategies/refresh-token.strategy.ts`: validate refresh token.

### DTO

- `src/modules/auth/dto/*.dto.ts`: validate input cho từng endpoint.

### Entity + Repository

- `src/modules/auth/entities/*.entity.ts`: bảng dữ liệu TypeORM.
- `src/modules/auth/repositories/*.repository.ts`: truy cập DB, tách khỏi service.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check Postgres + Redis.

### Database migration

- `migrations/0001_init_auth_service.sql`: tạo schema ban đầu.

## 4) Luồng request đơn giản (từ đầu đến cuối)

1. Request vào API.
2. Middleware gắn `x-request-id`.
3. Guard check JWT (nếu không `@Public`).
4. Controller nhận request, gọi `auth.service.ts`.
5. Service gọi repository để đọc/ghi DB.
6. Nếu cần thì gọi Redis (revoke) + Kafka (publish event).
7. Interceptor trả response chuẩn: `success/data/meta`.
8. Nếu lỗi thì filter trả `success=false` và `error`.

## 5) Nhìn nhanh từng use case

- Register: `auth.controller.ts -> auth.service.register()`
- Verify email: `auth.service.verifyEmail()`
- Login: `auth.service.login()`
- Refresh token rotation + reuse detection: `auth.service.refreshToken()`
- Logout/logout-all: `auth.service.logout()` / `auth.service.logoutAll()`
- Forgot/reset/change password: các hàm tương ứng trong `auth.service.ts`
- Session list/revoke: `auth.service.getSessions()` / `auth.service.revokeSessionById()`
- MFA admin: `auth.service.setupMfa()` / `auth.service.enableMfa()`

## 6) Rule quan trọng để không bị rối

- `auth.controller.ts` phải mỏng (thin controller).
- Logic nghiệp vụ để trong `auth.service.ts`.
- Truy cập DB để trong `repositories/*`.
- Validate input bằng DTO + class-validator.
- Lỗi trả về format chuẩn qua exception filter.

## 7) File bạn của bạn nên đọc theo thứ tự

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/auth/controllers/auth.controller.ts`
4. `src/modules/auth/services/auth.service.ts`
5. `src/modules/auth/services/token.service.ts`
6. `src/modules/auth/repositories/`
7. `src/modules/auth/entities/`

Đọc theo thứ tự này sẽ dễ hiểu luồng tổng thể nhất.
