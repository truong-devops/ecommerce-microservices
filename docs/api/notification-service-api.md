# Notification Service API

## Tổng quan

- Service: `services/notification-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/notifications`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Notification endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/notifications` | Roles(`ADMIN`,`SUPPORT`,`SUPER_ADMIN`) | Tạo manual notification campaign |
| GET | `/api/v1/notifications` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Danh sách notifications |
| GET | `/api/v1/notifications/:id` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Chi tiết notification |
| PATCH | `/api/v1/notifications/:id/read` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Đánh dấu đã đọc |

## DTO chính

### `CreateNotificationDto`

- `recipientIds` (required, array UUID, min 1)
- `channel` (optional): `EMAIL | SMS | PUSH | IN_APP`
- `category` (optional): `AUTH | ORDER | SHIPPING | CAMPAIGN | SYSTEM`
- `eventType` (optional, max 128)
- `subject` (optional, max 255)
- `content` (required, 1..2000)
- `payload` (optional object)

### `ListNotificationsDto` (query)

- `page`, `pageSize` (max 100)
- `status`: `PENDING | SENT | FAILED | CANCELLED`
- `channel`: `EMAIL | SMS | PUSH | IN_APP`
- `category`: `AUTH | ORDER | SHIPPING | CAMPAIGN | SYSTEM`
- `recipientId` (UUID)
- `eventType`, `search`
- `sortBy`: `createdAt | sentAt | status`
- `sortOrder`: `ASC | DESC`

## Error code nổi bật

- `NOTIFICATION_NOT_FOUND`
