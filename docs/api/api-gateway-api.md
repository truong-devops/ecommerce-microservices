# API Gateway

## Tổng quan

- Service: `services/api-gateway` (Go)
- Vai trò: reverse proxy + auth JWT + rate limit + observability.
- Port mặc định (env): `8080`.

## Gateway health/ops endpoints

| Method | Path | Chức năng |
|---|---|---|
| GET | `/health` | Health gateway |
| GET | `/ready` | Readiness (kiểm tra dependencies upstream) |
| GET | `/live` | Liveness |
| GET | `/metrics` | Prometheus metrics |

## Public routes (không JWT)

### Auth public

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh-token`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verify-email`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Alias versioned tương ứng:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/refresh-token`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

### Product & Review read-only

- `GET /api/products`, `GET /api/products/*`
- `GET /api/v1/products`, `GET /api/v1/products/*`
- `GET /api/reviews`, `GET /api/reviews/*`
- `GET /api/v1/reviews`, `GET /api/v1/reviews/*`

## Private routes (bắt buộc JWT)

Gateway mount proxy theo prefix (forward raw path sang service đích):

- `/api/auth/*`, `/api/v1/auth/*` -> auth service
- `/api/users/*` -> user service
- `/api/cart/*`, `/api/v1/cart/*` -> cart service
- `/api/orders/*`, `/api/v1/orders/*` -> order service
- `/api/payments/*` -> payment service
- `/api/inventory/*` -> inventory service
- `/api/shipping/*` -> shipping service
- `/api/notifications/*` -> notification service
- `/api/analytics/*` -> analytics service

Riêng product/review write methods được mở private qua method-based mount:

- `POST|PUT|PATCH|DELETE /api/products*` và `/api/v1/products*`
- `POST|PUT|PATCH|DELETE /api/reviews*` và `/api/v1/reviews*`

## Gateway middleware mặc định

- Request ID
- Recovery
- Logger
- Timeout
- CORS
- Rate limit
- Prometheus metrics
- JWT middleware cho private group

## Lưu ý tích hợp

- Gateway hiện không rewrite path trước khi forward; upstream cần hỗ trợ đúng prefix tương ứng.
- Khi route không tồn tại -> `404 Route not found` từ gateway.
