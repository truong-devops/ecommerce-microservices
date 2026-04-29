# User Service API

## Tổng quan

- Service: `services/user-service`
- Global prefix cứng: `/api`
- Controller có 2 alias path cho users và health.
- Hiện tại controller không gắn decorator role/auth trực tiếp (phụ thuộc lớp ngoài như gateway/middleware).

## Health

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| GET | `/api/health` | Open | Health check |
| GET | `/api/v1/health` | Open | Health check (alias) |

## User endpoints

| Method | Path | Chức năng |
|---|---|---|
| POST | `/api/users` hoặc `/api/v1/users` | Tạo user |
| GET | `/api/users` hoặc `/api/v1/users` | Danh sách users + pagination |
| GET | `/api/users/:id` hoặc `/api/v1/users/:id` | Chi tiết user |
| PATCH | `/api/users/:id` hoặc `/api/v1/users/:id` | Cập nhật thông tin user |
| PATCH | `/api/users/:id/status` hoặc `/api/v1/users/:id/status` | Cập nhật trạng thái user |
| DELETE | `/api/users/:id` hoặc `/api/v1/users/:id` | Xóa mềm/hard theo logic service |

## DTO chính

### `CreateUserDto`

- `email` (email, required)
- `firstName` (1..100, required)
- `lastName` (1..100, required)
- `phone` (optional, regex E.164 nới lỏng)
- `address` (optional, max 255)
- `gender` (optional): `male | female | other | unspecified`
- `dateOfBirth` (optional, ISO date)
- `avatarUrl` (optional, max 500)
- `role` (optional): `buyer | seller | admin`
- `status` (optional): `active | pending | suspended | deleted`
- `emailVerified` (optional, boolean)

### `ListUsersQueryDto`

- `page` (default `1`, min 1)
- `pageSize` (default `10`, min 1, max 100)
- `search` (optional)
- `role` (optional): `buyer | seller | admin`
- `status` (optional): `active | pending | suspended | deleted`
- `sortBy` (optional, default `createdAt`): `createdAt | updatedAt | email | firstName | lastName`
- `sortOrder` (optional, default `DESC`): `ASC | DESC`

### `UpdateUserDto`

Các field tương tự create nhưng đều optional.

### `UpdateUserStatusDto`

- `status` (required): `active | pending | suspended | deleted`

## Response

- `GET list users` trả:
  - `items: UserEntity[]`
  - `pagination: { page, pageSize, totalItems, totalPages }`
