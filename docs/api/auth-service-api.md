# Auth Service API

## Tổng quan

- Service: `services/auth-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/auth`
- Public endpoint có `@Public()`, còn lại cần JWT.

## Health

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Health check |
| GET | `/api/v1/ready` | Public | Readiness check |
| GET | `/api/v1/live` | Public | Liveness check |

## Auth endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Đăng ký user mới |
| POST | `/api/v1/auth/login` | Public | Đăng nhập, trả access + refresh token |
| POST | `/api/v1/auth/logout` | Auth | Logout 1 session |
| POST | `/api/v1/auth/logout-all` | Auth | Logout tất cả session của user |
| POST | `/api/v1/auth/refresh-token` | Public | Cấp access token mới từ refresh token |
| POST | `/api/v1/auth/verify-email` | Public | Xác thực email bằng token |
| POST | `/api/v1/auth/resend-verify-email` | Public | Gửi lại email verify |
| POST | `/api/v1/auth/forgot-password` | Public | Khởi tạo luồng quên mật khẩu |
| POST | `/api/v1/auth/reset-password` | Public | Đặt lại mật khẩu qua token |
| POST | `/api/v1/auth/change-password` | Auth | Đổi mật khẩu khi đã đăng nhập |
| GET | `/api/v1/auth/sessions` | Auth | Lấy danh sách session đang tồn tại |
| DELETE | `/api/v1/auth/sessions/:sessionId` | Auth | Revoke 1 session cụ thể |
| POST | `/api/v1/auth/mfa/setup` | Roles(`ADMIN`,`SUPER_ADMIN`) | Tạo secret/flow bật MFA |
| POST | `/api/v1/auth/mfa/enable` | Roles(`ADMIN`,`SUPER_ADMIN`) | Bật MFA bằng mã 6 số |

## Request body chính

### `POST /auth/register`

- `email` (email, required)
- `password` (string, required, min 10)
- `role` (optional): `CUSTOMER | SELLER` (public register chỉ cho 2 role này)

Password policy: phải có chữ hoa, chữ thường và số.

### `POST /auth/login`

- `email` (email, required)
- `password` (string, required)
- `mfaCode` (optional, length 6)

Ghi chú:
- User chưa verify email sẽ bị từ chối (`EMAIL_NOT_VERIFIED`).
- Tài khoản admin/super_admin yêu cầu MFA hợp lệ.

### `POST /auth/logout`

- `refreshToken` (string, required)

### `POST /auth/refresh-token`

- `refreshToken` (string, required)

### `POST /auth/verify-email`

- `token` (string, required)

### `POST /auth/resend-verify-email`

- `email` (email, required)

### `POST /auth/forgot-password`

- `email` (email, required)

### `POST /auth/reset-password`

- `token` (string, required)
- `newPassword` (string, required, min 10, theo password policy)

### `POST /auth/change-password`

- `currentPassword` (string, required)
- `newPassword` (string, required, min 10, theo password policy)

### `POST /auth/mfa/enable`

- `code` (string, required, length 6)

## Response behavior

- Đa số endpoint trả object JSON chuẩn qua `ResponseInterceptor`.
- `login` trả token/session; `register` trả thông tin user vừa tạo và yêu cầu verify email.

## Error code nổi bật

- `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`
- `EMAIL_NOT_VERIFIED`
- `MFA_REQUIRED`, `MFA_INVALID`
- `TOKEN_REUSE_DETECTED`, `SESSION_REVOKED`
